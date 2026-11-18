import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/shared/db.js';
import { alunoOrientado, api, novoUsuarioLogado } from './ajudantes.js';

afterAll(() => pool.end());

/** TCC aprovado (direto no banco), com a entrega definitiva enviada. */
async function tccAprovado(visibilidade: 'TEXTO_COMPLETO' | 'SOMENTE_METADADOS' = 'SOMENTE_METADADOS') {
  const prof = await novoUsuarioLogado('ORIENTADOR');
  const aluno = await alunoOrientado(prof);
  await pool.query("UPDATE tcc SET situacao = 'APROVADO', justificativa_situacao = 'Aprovado pela banca', visibilidade = $2, concluido_em = now() WHERE id = $1",
    [aluno.tccId, visibilidade]);
  const pdf = Buffer.from('%PDF-1.4\n%%EOF');
  await pool.query(
    `INSERT INTO versao_tcc (tcc_id, etapa, numero, arquivo_nome, arquivo_tamanho, arquivo, enviado_por, declaracao_autoria)
     VALUES ($1, 'ENTREGA_DEFINITIVA', 1, 'definitivo.pdf', $2, $3, $4, TRUE)`,
    [aluno.tccId, pdf.length, pdf, aluno.id],
  );
  return { prof, aluno };
}

describe('UC22 e UC23 – painel, busca e exportação (coordenação)', () => {
  it('o painel mostra os totais por situação e só a coordenação acessa', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 1 });
    const prof = await novoUsuarioLogado('ORIENTADOR');
    await alunoOrientado(prof);
    const res = await api().get('/api/painel?semestre=todos').set(coord.auth);
    expect(res.status).toBe(200);
    const { rows } = await pool.query("SELECT situacao, count(*)::int AS n FROM tcc WHERE curso_id = 1 GROUP BY situacao");
    for (const r of rows) expect(res.body.porSituacao[r.situacao]).toBe(r.n); // totais conferidos com o banco
    expect(Object.keys(res.body.porSituacao)).toHaveLength(8);
    expect(res.body.professores.some((p: { id: number }) => p.id === prof.id)).toBe(true);

    const aluno = await novoUsuarioLogado('ALUNO');
    expect((await api().get('/api/painel').set(aluno.auth)).status).toBe(403);
  });

  it('busca por orientador sem diferenciar acentos e exporta planilha e PDF com os mesmos filtros', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 1 });
    const prof = await novoUsuarioLogado('ORIENTADOR');
    await pool.query("UPDATE usuario SET nome = 'Profa. Áurea Exportação' WHERE id = $1", [prof.id]);
    await alunoOrientado(prof);
    const busca = await api().get('/api/busca/tccs?orientador=aurea exportacao').set(coord.auth);
    expect(busca.status).toBe(200);
    expect(busca.body.total).toBe(1);
    expect(busca.body.itens[0]).not.toHaveProperty('matricula'); // a matrícula só sai na exportação

    const xlsx = await api().get('/api/busca/tccs/exportar?formato=xlsx&orientador=aurea exportacao').set(coord.auth).buffer(true)
      .parse((res, cb) => { const partes: Buffer[] = []; res.on('data', (c: Buffer) => partes.push(c)); res.on('end', () => cb(null, Buffer.concat(partes))); });
    expect(xlsx.status).toBe(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const pdf = await api().get('/api/busca/tccs/exportar?formato=pdf&orientador=aurea exportacao').set(coord.auth);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');

    const vazio = await api().get('/api/busca/tccs/exportar?formato=xlsx&aluno=ninguem-com-esse-nome').set(coord.auth);
    expect(vazio.status).toBe(422);
    expect(vazio.body.erro).toBe('Nenhum TCC encontrado para os filtros escolhidos');
  });
});

describe('UC24 – auditoria', () => {
  it('mostra quem alterou, com valor anterior e novo, sem campos de senha', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 1 });
    const { aluno } = await tccAprovado();
    await api().put(`/api/tccs/${aluno.tccId}/visibilidade`).set(aluno.auth).send({ visibilidade: 'TEXTO_COMPLETO', declaracao: true });
    const lista = await api().get(`/api/auditoria?tabela=tcc&registroId=${aluno.tccId}`).set(coord.auth);
    expect(lista.status).toBe(200);
    const item = lista.body.itens.find((i: { operacao: string }) => i.operacao === 'UPDATE');
    expect(item.usuario).toBeTruthy();
    const det = await api().get(`/api/auditoria/${item.id}`).set(coord.auth);
    expect(det.body.valor_anterior.visibilidade).toBe('SOMENTE_METADADOS');
    expect(det.body.valor_novo.visibilidade).toBe('TEXTO_COMPLETO');

    const usuarios = await api().get('/api/auditoria?tabela=usuario&de=2000-01-01').set(coord.auth);
    for (const i of usuarios.body.itens.slice(0, 5)) {
      const d = await api().get(`/api/auditoria/${i.id}`).set(coord.auth);
      expect(JSON.stringify(d.body)).not.toMatch(/senha/i);
    }
    const invertido = await api().get('/api/auditoria?de=2026-12-31&ate=2026-01-01').set(coord.auth);
    expect(invertido.status).toBe(422);
    expect(invertido.body.erro).toBe('A data inicial não pode ser posterior à data final');
  });
});

describe('UC26 e UC27 – acervo público e visibilidade', () => {
  it('TCC em desenvolvimento não aparece; somente metadados não oferece o PDF; texto completo exige a declaração', async () => {
    const { aluno, prof } = await tccAprovado();
    const emAndamento = await alunoOrientado(prof);

    const detalhe = await api().get(`/api/acervo/${aluno.tccId}`);
    expect(detalhe.status).toBe(200);
    expect(detalhe.body).not.toHaveProperty('matricula');
    expect(detalhe.body.tem_pdf).toBe(false);
    expect((await api().get(`/api/acervo/${aluno.tccId}/pdf`)).status).toBe(403);
    const oculto = await api().get(`/api/acervo/${emAndamento.tccId}`);
    expect(oculto.status).toBe(404);
    expect(oculto.body.erro).toBe('TCC não disponível para consulta pública');

    const semDeclaracao = await api().put(`/api/tccs/${aluno.tccId}/visibilidade`).set(aluno.auth).send({ visibilidade: 'TEXTO_COMPLETO' });
    expect(semDeclaracao.status).toBe(422);
    const outro = await novoUsuarioLogado('ALUNO');
    expect((await api().put(`/api/tccs/${aluno.tccId}/visibilidade`).set(outro.auth).send({ visibilidade: 'TEXTO_COMPLETO', declaracao: true })).status).toBe(403);

    const ok = await api().put(`/api/tccs/${aluno.tccId}/visibilidade`).set(aluno.auth).send({ visibilidade: 'TEXTO_COMPLETO', declaracao: true });
    expect(ok.status).toBe(200);
    expect((await api().get(`/api/acervo/${aluno.tccId}/pdf`)).status).toBe(200);
    const aviso = await pool.query("SELECT 1 FROM notificacao WHERE usuario_id = $1 AND titulo = 'Visibilidade do TCC alterada'", [prof.id]);
    expect(aviso.rowCount).toBe(1); // o orientador foi avisado

    const busca = await api().get('/api/acervo?pagina=1');
    expect(busca.body.itens.some((t: { id: number }) => t.id === emAndamento.tccId)).toBe(false);
  });
});

describe('UC25 – banner', () => {
  it('só para TCC aprovado; sem IA configurada, oferece o preenchimento manual com título e resumo', async () => {
    const { aluno, prof } = await tccAprovado();
    const emAndamento = await alunoOrientado(prof);
    const negado = await api().get(`/api/tccs/${emAndamento.tccId}/banner`).set(emAndamento.auth);
    expect(negado.status).toBe(422);
    expect(negado.body.erro).toBe('O banner só pode ser gerado para TCC aprovado');

    const sugestao = await api().post(`/api/tccs/${aluno.tccId}/banner/sugestao`).set(aluno.auth);
    expect(sugestao.status).toBe(200);
    expect(sugestao.body.origem).toBe('MANUAL');
    expect(sugestao.body.textos.titulo).toBeTruthy();

    // PNG e JPEG mínimos (só o começo do arquivo importa para a conferência)
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).toString('base64');
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]).toString('base64');
    const gerado = await api().post(`/api/tccs/${aluno.tccId}/banner`).set(aluno.auth).send({
      conteudo: { ...sugestao.body.textos, objetivo: '• Objetivo do trabalho' }, png, jpeg, largura: 100, altura: 141,
    });
    expect(gerado.status).toBe(201);
    expect(gerado.body.mensagem).toBe('Banner gerado. Use os botões para baixar');
    const arquivo = await api().get(`/api/tccs/${aluno.tccId}/banner/${gerado.body.id}/pdf`).set(aluno.auth);
    expect(arquivo.status).toBe(200);
  });

  it('aceita só o JPEG (sem PNG) e guarda referências, agradecimentos, coautores e área temática', async () => {
    const { aluno } = await tccAprovado();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]).toString('base64');
    const conteudo = {
      titulo: 'Meu TCC', introducao: 'Texto', objetivo: '', metodologia: '', resultados: '', conclusao: '',
      areaTematica: 'Engenharia de Software', coautores: 'Fulana de Tal', agradecimentos: 'À FAPEAM.',
      referencias: 'SOMMERVILLE, I. Engenharia de software. 10. ed. São Paulo: Pearson, 2019.',
    };
    const gerado = await api().post(`/api/tccs/${aluno.tccId}/banner`).set(aluno.auth).send({ conteudo, jpeg, largura: 300, altura: 400 });
    expect(gerado.status).toBe(201);

    const imagem = await api().get(`/api/tccs/${aluno.tccId}/banner/${gerado.body.id}/png`).set(aluno.auth);
    expect(imagem.status).toBe(200);
    expect(imagem.headers['content-type']).toBe('image/jpeg');
    expect(imagem.headers['content-disposition']).toContain('banner-tcc.jpg');

    const situacao = await api().get(`/api/tccs/${aluno.tccId}/banner`).set(aluno.auth);
    expect(situacao.body.ultimo.conteudo.referencias).toContain('SOMMERVILLE');
    expect(situacao.body.ultimo.conteudo.areaTematica).toBe('Engenharia de Software');

    const longo = await api().post(`/api/tccs/${aluno.tccId}/banner`).set(aluno.auth)
      .send({ conteudo: { ...conteudo, referencias: 'x'.repeat(1501) }, jpeg, largura: 300, altura: 400 });
    expect(longo.status).toBe(422);
  });
});
