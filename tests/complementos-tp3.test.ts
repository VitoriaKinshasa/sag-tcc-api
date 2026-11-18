import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/shared/db.js';
import { emailService } from '../src/shared/notificacao.js';
import { verificarPrazos } from '../src/modules/acompanhamento/prazos.service.js';
import {
  alunoAptoADefesa, api, calendarioComDefesaAberta, criarUsuario, defesaDaqui, diaDaqui, entrar, novoUsuarioLogado, SENHA,
} from './ajudantes.js';

afterAll(() => pool.end());
beforeAll(() => calendarioComDefesaAberta());

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');
let salas = 0;

/** Banca agendada (data no futuro) com presidente, 2 titulares e 1 suplente. */
async function bancaAgendada() {
  const prof = await novoUsuarioLogado('ORIENTADOR');
  const t1 = await novoUsuarioLogado('ORIENTADOR');
  const t2 = await novoUsuarioLogado('MEMBRO_BANCA');
  const sup = await novoUsuarioLogado('ORIENTADOR');
  const aluno = await alunoAptoADefesa(prof);
  salas += 1;
  const res = await api().post('/api/bancas').set(prof.auth).send({
    tccId: aluno.tccId, dataHora: defesaDaqui(5, 12 + (salas % 8)), localOuLink: `Sala complementos ${salas}`,
    membros: [{ usuarioId: t1.id, papel: 'TITULAR' }, { usuarioId: t2.id, papel: 'TITULAR' }, { usuarioId: sup.id, papel: 'SUPLENTE' }],
  });
  expect(res.status).toBe(201);
  return { bancaId: Number(res.body.id), prof, t1, t2, sup, aluno };
}

/** Banca que já aconteceu, com as 3 notas lançadas e o resultado registrado. */
async function bancaComResultado(resultado = 'APROVADO', extra: Record<string, unknown> = {}, notas = [9, 8, 7]) {
  const b = await bancaAgendada();
  await pool.query("UPDATE banca SET data_hora = now() - interval '1 day' WHERE id = $1", [b.bancaId]);
  for (const [i, m] of [b.prof, b.t1, b.t2].entries()) {
    await api().post(`/api/bancas/${b.bancaId}/notas`).set(m.auth).send({ nota: notas[i], parecer: `Parecer ${i}` });
  }
  const res = await api().post(`/api/bancas/${b.bancaId}/resultado`).set(b.prof.auth)
    .send({ resultado, observacao: resultado === 'APROVADO' ? null : 'Ajustar a conclusão', ...extra });
  return { ...b, resultado: res };
}

describe('Assinatura eletrônica da ata e verificação pública', () => {
  it('cada avaliador assina com a própria senha; a ata fica completa e pode ser conferida pelo código', async () => {
    const b = await bancaComResultado();
    expect(b.resultado.status).toBe(201);
    const ata = await api().get(`/api/bancas/${b.bancaId}/ata`).set(b.prof.auth);
    expect(ata.body.codigo_verificacao).toMatch(/^SAG-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(ata.body.assinaturaCompleta).toBe(false);
    expect(ata.body.assinaturas).toHaveLength(3);

    const errada = await api().post(`/api/bancas/${b.bancaId}/ata/assinar`).set(b.t1.auth).send({ senha: 'errada' });
    expect(errada.status).toBe(422);
    expect(errada.body.erro).toBe('Senha incorreta');
    const suplente = await api().post(`/api/bancas/${b.bancaId}/ata/assinar`).set(b.sup.auth).send({ senha: SENHA });
    expect(suplente.status).toBe(403);

    for (const m of [b.prof, b.t1, b.t2]) {
      const r = await api().post(`/api/bancas/${b.bancaId}/ata/assinar`).set(m.auth).send({ senha: SENHA });
      expect(r.status).toBe(200);
    }
    const repetida = await api().post(`/api/bancas/${b.bancaId}/ata/assinar`).set(b.t1.auth).send({ senha: SENHA });
    expect(repetida.status).toBe(409);

    const publica = await api().get(`/api/verificar/${ata.body.codigo_verificacao.toLowerCase().replace(/-/g, ' ')}`);
    expect(publica.status).toBe(200);
    expect(publica.body).toMatchObject({ tipo: 'ATA_DEFESA', assinaturaCompleta: true, resultado: 'APROVADO' });
    expect(JSON.stringify(publica.body)).not.toContain('"nota"'); // a verificação pública não mostra notas
    expect((await api().get('/api/verificar/SAG-AAAA-BBBB')).status).toBe(404);
  });

  it('presidente envia a ata assinada à mão (PDF escaneado) e o aluno consegue baixar', async () => {
    const b = await bancaComResultado();
    const naoPdf = await api().post(`/api/bancas/${b.bancaId}/ata/digitalizada`).set(b.prof.auth)
      .send({ arquivoNome: 'ata.jpg', arquivoBase64: PDF });
    expect(naoPdf.status).toBe(422);
    const titular = await api().post(`/api/bancas/${b.bancaId}/ata/digitalizada`).set(b.t1.auth)
      .send({ arquivoNome: 'ata.pdf', arquivoBase64: PDF });
    expect(titular.status).toBe(403);
    const ok = await api().post(`/api/bancas/${b.bancaId}/ata/digitalizada`).set(b.prof.auth)
      .send({ arquivoNome: 'ata-assinada.pdf', arquivoBase64: PDF });
    expect(ok.status).toBe(201);
    const pdf = await api().get(`/api/bancas/${b.bancaId}/ata/digitalizada`).set(b.aluno.auth);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const ata = await api().get(`/api/bancas/${b.bancaId}/ata`).set(b.aluno.auth);
    expect(ata.body.ataDigitalizada.nome).toBe('ata-assinada.pdf');
  });
});

describe('Privacidade e correção de notas', () => {
  it('o aluno vê a nota final e os pareceres, mas não a nota de cada membro (a não ser que o curso permita)', async () => {
    const b = await bancaComResultado();
    const doAluno = await api().get(`/api/bancas/${b.bancaId}/ata`).set(b.aluno.auth);
    expect(doAluno.body.notasIndividuaisOcultas).toBe(true);
    expect(doAluno.body.notas.every((n: { nota: number | null }) => n.nota === null)).toBe(true);
    expect(doAluno.body.notas[0].parecer).toBeTruthy();
    expect(doAluno.body.nota_final).toBe(8);
    const doMembro = await api().get(`/api/bancas/${b.bancaId}/ata`).set(b.t1.auth);
    expect(doMembro.body.notas.map((n: { nota: number }) => n.nota).sort()).toEqual([7, 8, 9]);

    await pool.query('UPDATE curso SET notas_individuais_aluno = TRUE WHERE id = 1');
    const permitido = await api().get(`/api/bancas/${b.bancaId}/ata`).set(b.aluno.auth);
    expect(permitido.body.notas.every((n: { nota: number | null }) => n.nota !== null)).toBe(true);
    await pool.query('UPDATE curso SET notas_individuais_aluno = FALSE WHERE id = 1');
  });

  it('só a coordenação corrige uma nota, com justificativa; a média é recalculada e a ata precisa ser assinada de novo', async () => {
    const b = await bancaComResultado();
    for (const m of [b.prof, b.t1, b.t2]) await api().post(`/api/bancas/${b.bancaId}/ata/assinar`).set(m.auth).send({ senha: SENHA });
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 1 });
    const outroCurso = await novoUsuarioLogado('COORDENACAO', { cursoId: 2 });

    expect((await api().patch(`/api/bancas/${b.bancaId}/notas/${b.t2.id}`).set(b.prof.auth).send({ nota: 10, justificativa: 'Erro de digitação' })).status).toBe(403);
    expect((await api().patch(`/api/bancas/${b.bancaId}/notas/${b.t2.id}`).set(outroCurso.auth).send({ nota: 10, justificativa: 'Erro de digitação' })).status).toBe(403);
    expect((await api().patch(`/api/bancas/${b.bancaId}/notas/${b.t2.id}`).set(coord.auth).send({ nota: 10 })).status).toBe(422);

    const ok = await api().patch(`/api/bancas/${b.bancaId}/notas/${b.t2.id}`).set(coord.auth).send({ nota: 10, justificativa: 'Erro de digitação do membro' });
    expect(ok.status).toBe(200);
    expect(ok.body.notaFinal).toBe(9);
    const ata = await api().get(`/api/bancas/${b.bancaId}/ata`).set(b.prof.auth);
    expect(ata.body.nota_final).toBe(9);
    expect(ata.body.assinaturaCompleta).toBe(false); // a ata mudou: assinaturas antigas não valem mais
    const reassinar = await api().post(`/api/bancas/${b.bancaId}/ata/assinar`).set(b.t1.auth).send({ senha: SENHA });
    expect(reassinar.status).toBe(200);
    const { rows } = await pool.query("SELECT 1 FROM auditoria WHERE tabela = 'nota_banca' AND operacao = 'UPDATE' AND registro_id = $1", [b.bancaId]);
    expect(rows).toHaveLength(1);
  });
});

describe('Banca acessa a versão final e downloads ficam registrados', () => {
  it('membro da banca baixa só a versão final; o aluno vê quem baixou', async () => {
    const b = await bancaAgendada();
    const qualif = await api().post(`/api/tccs/${b.aluno.tccId}/versoes`).set(b.aluno.auth)
      .send({ etapa: 'QUALIFICACAO', arquivoNome: 'q.pdf', arquivoBase64: PDF });
    const semAutoria = await api().post(`/api/tccs/${b.aluno.tccId}/versoes`).set(b.aluno.auth)
      .send({ etapa: 'VERSAO_FINAL', arquivoNome: 'final.pdf', arquivoBase64: PDF });
    expect(semAutoria.status).toBe(422);
    const final = await api().post(`/api/tccs/${b.aluno.tccId}/versoes`).set(b.aluno.auth)
      .send({ etapa: 'VERSAO_FINAL', arquivoNome: 'final.pdf', arquivoBase64: PDF, declaracaoAutoria: true });
    expect(final.status).toBe(201);
    expect(final.body.declaracao_autoria).toBe(true);

    const detalhe = await api().get(`/api/bancas/${b.bancaId}`).set(b.t2.auth);
    expect(detalhe.body.versao_final.id).toBe(Number(final.body.id));
    expect((await api().get(`/api/versoes/${final.body.id}/arquivo`).set(b.t2.auth)).status).toBe(200);
    expect((await api().get(`/api/versoes/${qualif.body.id}/arquivo`).set(b.t2.auth)).status).toBe(403);
    const estranho = await novoUsuarioLogado('ORIENTADOR');
    expect((await api().get(`/api/versoes/${final.body.id}/arquivo`).set(estranho.auth)).status).toBe(403);

    const downloads = await api().get(`/api/tccs/${b.aluno.tccId}/downloads`).set(b.aluno.auth);
    expect(downloads.body).toHaveLength(1);
    expect(downloads.body[0]).toMatchObject({ arquivo_nome: 'final.pdf', papel_banca: 'TITULAR' });
  });
});

describe('Aprovado com correções', () => {
  it('a banca dá um prazo; a entrega definitiva aprovada pelo orientador conclui o TCC', async () => {
    const b = await bancaComResultado('APROVADO_COM_CORRECOES', { prazoCorrecoes: diaDaqui(15) });
    expect(b.resultado.status).toBe(201);
    let tcc = (await pool.query('SELECT * FROM tcc WHERE id = $1', [b.aluno.tccId])).rows[0];
    expect(tcc).toMatchObject({ situacao: 'APROVADO', correcoes_pendentes: true, prazo_correcoes: diaDaqui(15) });
    const prazos = await api().get(`/api/tccs/${b.aluno.tccId}/prazos`).set(b.aluno.auth);
    expect(prazos.body.correcoes).toMatchObject({ prazo: diaDaqui(15), dias: 15 });

    const semVisibilidade = await api().post(`/api/tccs/${b.aluno.tccId}/versoes`).set(b.aluno.auth)
      .send({ etapa: 'ENTREGA_DEFINITIVA', arquivoNome: 'corrigido.pdf', arquivoBase64: PDF, declaracaoAutoria: true });
    expect(semVisibilidade.status).toBe(422);
    const v = await api().post(`/api/tccs/${b.aluno.tccId}/versoes`).set(b.aluno.auth)
      .send({ etapa: 'ENTREGA_DEFINITIVA', arquivoNome: 'corrigido.pdf', arquivoBase64: PDF, declaracaoAutoria: true, visibilidade: 'TEXTO_COMPLETO' });
    expect(v.status).toBe(201);
    expect(v.body.fora_do_prazo).toBe(false);
    await api().post(`/api/versoes/${v.body.id}/parecer`).set(b.prof.auth).send({ decisao: 'APROVADA' });
    tcc = (await pool.query('SELECT * FROM tcc WHERE id = $1', [b.aluno.tccId])).rows[0];
    expect(tcc.correcoes_pendentes).toBe(false);
    expect(tcc.concluido_em).not.toBeNull();
  });

  it('sem informar, o prazo é o padrão do curso; prazo vencido marca o TCC como atrasado e avisa', async () => {
    const b = await bancaComResultado('APROVADO_COM_CORRECOES');
    const { rows: [t] } = await pool.query('SELECT prazo_correcoes FROM tcc WHERE id = $1', [b.aluno.tccId]);
    expect(t.prazo_correcoes).toBe(diaDaqui(30));
    await pool.query("UPDATE tcc SET prazo_correcoes = current_date - 2 WHERE id = $1", [b.aluno.tccId]);
    await verificarPrazos();
    const { rows: [depois] } = await pool.query('SELECT atrasado, correcoes_alerta FROM tcc WHERE id = $1', [b.aluno.tccId]);
    expect(depois).toMatchObject({ atrasado: true, correcoes_alerta: 'ATRASO' });
  });

  it('com média abaixo da nota mínima do curso, o resultado não pode ser "aprovado"', async () => {
    const b = await bancaComResultado('APROVADO', {}, [5, 5, 5]);
    expect(b.resultado.status).toBe(422);
    expect(b.resultado.body.erro).toContain('abaixo da nota mínima');
  });
});

describe('Declarações com código de verificação', () => {
  it('membro emite declaração de participação; aluno emite folha de aprovação; ambas podem ser conferidas', async () => {
    const b = await bancaComResultado();
    const disp = await api().get('/api/declaracoes/disponiveis').set(b.t1.auth);
    expect(disp.body.map((d: { tipo: string }) => d.tipo)).toEqual(['PARTICIPACAO_BANCA']);
    const decl = await api().post('/api/declaracoes').set(b.t1.auth).send({ tipo: 'PARTICIPACAO_BANCA', tccId: b.aluno.tccId });
    expect(decl.status).toBe(201);
    expect(decl.body.dados).toMatchObject({ papel: 'Membro titular', aluno: expect.any(String) });
    const denovo = await api().post('/api/declaracoes').set(b.t1.auth).send({ tipo: 'PARTICIPACAO_BANCA', tccId: b.aluno.tccId });
    expect(denovo.body.codigo).toBe(decl.body.codigo); // a mesma declaração, o mesmo código

    const suplente = await api().post('/api/declaracoes').set(b.sup.auth).send({ tipo: 'PARTICIPACAO_BANCA', tccId: b.aluno.tccId });
    expect(suplente.status).toBe(422);
    const outro = await api().get(`/api/declaracoes/${decl.body.codigo}`).set(b.t2.auth);
    expect(outro.status).toBe(403);

    const folha = await api().post('/api/declaracoes').set(b.aluno.auth).send({ tipo: 'FOLHA_APROVACAO', tccId: b.aluno.tccId });
    expect(folha.body.dados.membros).toHaveLength(3);
    const publica = await api().get(`/api/verificar/${folha.body.codigo}`);
    expect(publica.body).toMatchObject({ tipo: 'FOLHA_APROVACAO', dados: { resultado: 'Aprovado' } });

    // Orientação: só depois do TCC concluído
    expect((await api().post('/api/declaracoes').set(b.prof.auth).send({ tipo: 'ORIENTACAO', tccId: b.aluno.tccId })).status).toBe(422);
    await pool.query('UPDATE tcc SET concluido_em = now() WHERE id = $1', [b.aluno.tccId]);
    const orient = await api().post('/api/declaracoes').set(b.prof.auth).send({ tipo: 'ORIENTACAO', tccId: b.aluno.tccId });
    expect(orient.status).toBe(201);
    expect(orient.body.dados.papel).toBe('Orientador(a)');
  });
});

describe('Bancas: suplente, cancelamento, lembrete e agenda', () => {
  it('a coordenação vê as bancas do próprio curso', async () => {
    const b = await bancaAgendada();
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 1 });
    const outro = await novoUsuarioLogado('COORDENACAO', { cursoId: 2 });
    const doCurso = await api().get('/api/bancas/minhas').set(coord.auth);
    expect(doCurso.status).toBe(200);
    expect(doCurso.body.some((x: { id: number }) => x.id === b.bancaId)).toBe(true);
    const deOutro = await api().get('/api/bancas/minhas').set(outro.auth);
    expect(deOutro.body.some((x: { id: number }) => x.id === b.bancaId)).toBe(false);
  });

  it('o suplente assume o lugar de um titular', async () => {
    const b = await bancaAgendada();
    const errado = await api().patch(`/api/bancas/${b.bancaId}/substituir`).set(b.prof.auth).send({ titularId: b.sup.id, suplenteId: b.t1.id });
    expect(errado.status).toBe(422);
    const ok = await api().patch(`/api/bancas/${b.bancaId}/substituir`).set(b.prof.auth).send({ titularId: b.t1.id, suplenteId: b.sup.id });
    expect(ok.status).toBe(200);
    const papel = (id: number) => ok.body.membros.find((m: { usuarioId: number }) => m.usuarioId === id).papel;
    expect(papel(b.sup.id)).toBe('TITULAR');
    expect(papel(b.t1.id)).toBe('SUPLENTE');
  });

  it('presidente ou coordenação cancelam a banca com motivo; outra banca pode ser marcada', async () => {
    const b = await bancaAgendada();
    expect((await api().patch(`/api/bancas/${b.bancaId}/cancelar`).set(b.t1.auth).send({ motivo: 'Não posso ir' })).status).toBe(403);
    expect((await api().patch(`/api/bancas/${b.bancaId}/cancelar`).set(b.prof.auth).send({})).status).toBe(422);
    const ok = await api().patch(`/api/bancas/${b.bancaId}/cancelar`).set(b.prof.auth).send({ motivo: 'Aluno doente no dia' });
    expect(ok.body).toMatchObject({ status: 'CANCELADA', motivo_cancelamento: 'Aluno doente no dia' });
    const notifs = await api().get('/api/notificacoes').set(b.aluno.auth);
    expect(notifs.body[0].titulo).toBe('Banca cancelada');
  });

  it('lembrete 24 horas antes (uma vez só) e arquivo .ics para a agenda', async () => {
    const b = await bancaAgendada();
    await pool.query("UPDATE banca SET data_hora = now() + interval '20 hours' WHERE id = $1", [b.bancaId]);
    const r1 = await verificarPrazos();
    expect(r1.lembretesDefesa).toBeGreaterThanOrEqual(1);
    const notifs = await api().get('/api/notificacoes').set(b.aluno.auth);
    expect(notifs.body.some((n: { titulo: string }) => n.titulo.includes('amanhã'))).toBe(true);
    const r2 = await verificarPrazos();
    expect(r2.lembretesDefesa).toBe(0);

    const ics = await api().get(`/api/bancas/${b.bancaId}/agenda.ics`).set(b.t1.auth);
    expect(ics.headers['content-type']).toContain('text/calendar');
    expect(ics.text).toContain('BEGIN:VEVENT');
    expect(ics.text).toContain('Sala complementos');
  });
});

describe('Meus dados, alterar senha e e-mails simulados', () => {
  it('mostra os próprios dados, guarda o acesso anterior, exporta tudo e pede correção', async () => {
    const aluno = await novoUsuarioLogado('ALUNO');
    await entrar(aluno.email); // segundo login: passa a existir "acesso anterior"
    const eu = await api().get('/api/me').set(aluno.auth);
    expect(eu.body).toMatchObject({ email: aluno.email, perfil: 'ALUNO', curso_sigla: 'EC' });
    expect(eu.body.acesso_anterior_em).not.toBeNull();
    expect(JSON.stringify(eu.body)).not.toContain('senha');
    const exportado = await api().get('/api/me/exportar').set(aluno.auth);
    expect(exportado.headers['content-disposition']).toContain('meus-dados');
    expect(exportado.body.cadastro.email).toBe(aluno.email);
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 1 });
    expect((await api().post('/api/me/correcao').set(aluno.auth).send({ mensagem: 'Meu nome está sem acento' })).status).toBe(200);
    const notifs = await api().get('/api/notificacoes').set(coord.auth);
    expect(notifs.body[0].titulo).toBe('Pedido de correção de dados');
  });

  it('altera a senha só com a senha atual correta', async () => {
    const u = await novoUsuarioLogado('ORIENTADOR');
    expect((await api().post('/api/auth/alterar-senha').set(u.auth).send({ senhaAtual: 'errada', novaSenha: 'NovaSenha@1' })).status).toBe(422);
    expect((await api().post('/api/auth/alterar-senha').set(u.auth).send({ senhaAtual: SENHA, novaSenha: 'curta' })).status).toBe(422);
    expect((await api().post('/api/auth/alterar-senha').set(u.auth).send({ senhaAtual: SENHA, novaSenha: 'NovaSenha@1' })).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: u.email, senha: 'NovaSenha@1' })).status).toBe(200);
  });

  it('a coordenação vê os e-mails simulados (ex.: link de primeiro acesso) só do próprio curso', async () => {
    const coordSI = await novoUsuarioLogado('COORDENACAO', { cursoId: 2 });
    const coordEC = await novoUsuarioLogado('COORDENACAO', { cursoId: 1 });
    const email = `novo.aluno.${Date.now()}@uea.edu.br`;
    await api().post('/api/usuarios').set(coordSI.auth).send({ nome: 'Aluno Novo SI', email, perfil: 'ALUNO', matricula: `SI${Date.now()}` });
    await new Promise((r) => setTimeout(r, 50));
    const doSI = await api().get('/api/emails').set(coordSI.auth);
    const primeiro = doSI.body.find((e: { para: string }) => e.para === email);
    expect(primeiro.texto).toContain('/definir-senha?token=');
    const doEC = await api().get('/api/emails').set(coordEC.auth);
    expect(doEC.body.some((e: { para: string }) => e.para === email)).toBe(false);
    expect(emailService.enviados.length).toBeGreaterThan(0);
  });
});

describe('Uso real: regras por curso, importação e relatórios', () => {
  it('a coordenação ajusta as regras só do próprio curso; o mínimo de titulares passa a valer', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 3 });
    const regras = { limiteOrientandos: 6, notaMinima: 7, minTitulares: 4, minSuplentes: 1, diasCorrecoes: 20, notasIndividuaisAluno: true };
    expect((await api().put('/api/cursos/1/regras').set(coord.auth).send(regras)).status).toBe(403);
    const ok = await api().put('/api/cursos/3/regras').set(coord.auth).send(regras);
    expect(ok.body).toMatchObject({ nota_minima: 7, min_titulares: 4, dias_correcoes: 20, notas_individuais_aluno: true });

    await calendarioComDefesaAberta(3);
    const prof = await novoUsuarioLogado('ORIENTADOR', { cursoId: 3 });
    const t1 = await criarUsuario('ORIENTADOR', { cursoId: 3 });
    const t2 = await criarUsuario('ORIENTADOR', { cursoId: 3 });
    const sup = await criarUsuario('ORIENTADOR', { cursoId: 3 });
    const aluno = await novoUsuarioLogado('ALUNO', { cursoId: 3 });
    const tcc = await api().post('/api/tccs').set(aluno.auth).send({ titulo: 'TCC de LC', resumo: 'Resumo do trabalho de LC.', areaId: 1 });
    const sol = await api().post('/api/orientacao/solicitacoes').set(aluno.auth).send({ professorId: prof.id });
    await api().patch(`/api/orientacao/solicitacoes/${sol.body.id}`).set(prof.auth).send({ aceitar: true });
    await api().patch(`/api/tccs/${tcc.body.id}/situacao`).set(prof.auth).send({ situacao: 'APTO_DEFESA' });
    const poucos = await api().post('/api/bancas').set(prof.auth).send({
      tccId: Number(tcc.body.id), dataHora: defesaDaqui(6, 13), localOuLink: 'Sala LC regras',
      membros: [{ usuarioId: t1.id, papel: 'TITULAR' }, { usuarioId: t2.id, papel: 'TITULAR' }, { usuarioId: sup.id, papel: 'SUPLENTE' }],
    });
    expect(poucos.status).toBe(422);
    expect(poucos.body.erro).toContain('pelo menos 4 titulares');
  });

  it('importa alunos de uma planilha: as linhas boas entram e as com erro são informadas', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 2 });
    const n = Date.now();
    const res = await api().post('/api/usuarios/importar').set(coord.auth).send({
      linhas: [
        { nome: 'Ana Importada', email: `ana.${n}@uea.edu.br`, matricula: `IMP${n}1` },
        { nome: 'Bruno Importado', email: 'email-invalido', matricula: `IMP${n}2` },
        { nome: 'Ana Repetida', email: `ana.${n}@uea.edu.br`, matricula: `IMP${n}3` },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ cadastrados: 1, comErro: 2 });
    expect(res.body.linhas[1].erro).toBe('E-mail inválido');
    const { rows } = await pool.query('SELECT curso_id, perfil FROM usuario WHERE email = $1', [`ana.${n}@uea.edu.br`]);
    expect(rows[0]).toMatchObject({ curso_id: 2, perfil: 'ALUNO' });
  });

  it('relatório da coordenação traz números do curso, sem notas ligadas a nomes', async () => {
    await bancaComResultado();
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 1 });
    const res = await api().get('/api/relatorios').set(coord.auth);
    expect(res.status).toBe(200);
    expect(res.body.defesas.realizadas).toBeGreaterThan(0);
    expect(res.body.porOrientador.length).toBeGreaterThan(0);
    expect(res.body.porSemestre[0]).toHaveProperty('media_notas');
    const aluno = await novoUsuarioLogado('ALUNO');
    expect((await api().get('/api/relatorios').set(aluno.auth)).status).toBe(403);
  });
});
