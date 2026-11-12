import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/shared/db.js';
import { verificarPrazos } from '../src/modules/acompanhamento/prazos.service.js';
import {
  alunoAptoADefesa, alunoComProposta, alunoOrientado, api, calendarioComDefesaAberta, criarUsuario, diaDaqui, entrar, novoUsuarioLogado, proposta,
} from './ajudantes.js';

afterAll(() => pool.end());
beforeAll(() => calendarioComDefesaAberta());

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');
const versao = (etapa = 'QUALIFICACAO', extra = {}) => ({ etapa, arquivoNome: 'tcc.pdf', arquivoBase64: PDF, comentario: 'Capítulos 1 e 2', ...extra });
const semestre = (dia: string) => `${dia.slice(0, 4)}.${Number(dia.slice(5, 7)) <= 6 ? 1 : 2}`;

describe('Versões do TCC (RF14)', () => {
  it('aluno envia versão em PDF; orientador é avisado; entrega depois do limite fica "fora do prazo"', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const res = await api().post(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth).send(versao());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ numero: 1, etapa: 'QUALIFICACAO', fora_do_prazo: true });

    const lista = await api().get(`/api/tccs/${aluno.tccId}/versoes`).set(prof.auth);
    expect(lista.body).toHaveLength(1);
    const arquivo = await api().get(`/api/versoes/${res.body.id}/arquivo`).set(prof.auth);
    expect(arquivo.headers['content-type']).toContain('application/pdf');
    const notifs = await api().get('/api/notificacoes').set(prof.auth);
    expect(notifs.body[0].titulo).toContain('Nova versão');
  });

  it('recusa arquivo que não é PDF', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const txt = Buffer.from('texto qualquer').toString('base64');
    const res = await api().post(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth).send(versao('QUALIFICACAO', { arquivoNome: 'tcc.docx', arquivoBase64: txt }));
    expect(res.status).toBe(422);
    const disfarçado = await api().post(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth).send(versao('QUALIFICACAO', { arquivoBase64: txt }));
    expect(disfarçado.body.erro).toContain('não é um PDF');
  });

  it('não envia versão antes do aceite da orientação, nem versão de outro aluno', async () => {
    const aluno = await alunoComProposta();
    expect((await api().post(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth).send(versao())).status).toBe(422);
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const outro = await alunoOrientado(prof);
    expect((await api().post(`/api/tccs/${outro.tccId}/versoes`).set(aluno.auth).send(versao())).status).toBe(403);
  });

  it('pessoa de fora não vê as versões', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const estranho = await novoUsuarioLogado('ORIENTADOR');
    expect((await api().get(`/api/tccs/${aluno.tccId}/versoes`).set(estranho.auth)).status).toBe(403);
  });
});

describe('Pareceres (RF15)', () => {
  it('orientador aprova ou pede ajustes (ajustes exigem texto) e o aluno é avisado', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const v = await api().post(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth).send(versao());
    const recebidas = await api().get('/api/versoes/recebidas').set(prof.auth);
    expect(recebidas.body[0].id).toBe(v.body.id);

    const sem = await api().post(`/api/versoes/${v.body.id}/parecer`).set(prof.auth).send({ decisao: 'AJUSTES' });
    expect(sem.body.regra).toBe('RD11');
    const ok = await api().post(`/api/versoes/${v.body.id}/parecer`).set(prof.auth).send({ decisao: 'AJUSTES', texto: 'Revisar a metodologia' });
    expect(ok.status).toBe(201);
    const repetido = await api().post(`/api/versoes/${v.body.id}/parecer`).set(prof.auth).send({ decisao: 'APROVADA' });
    expect(repetido.status).toBe(409);

    const lista = await api().get(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth);
    expect(lista.body[0]).toMatchObject({ parecer_decisao: 'AJUSTES', parecer_texto: 'Revisar a metodologia' });
    const notifs = await api().get('/api/notificacoes').set(aluno.auth);
    expect(notifs.body[0].titulo).toContain('Parecer');
  });

  it('outro professor não dá parecer', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const outro = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const v = await api().post(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth).send(versao());
    expect((await api().post(`/api/versoes/${v.body.id}/parecer`).set(outro.auth).send({ decisao: 'APROVADA' })).status).toBe(403);
  });
});

describe('Versão final / entrega definitiva (RF22)', () => {
  it('só depois da aprovação; o aluno escolhe a visibilidade do texto', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoAptoADefesa(prof);
    const cedo = await api().post(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth).send(versao('ENTREGA_DEFINITIVA'));
    expect(cedo.status).toBe(422);

    await pool.query("UPDATE tcc SET situacao = 'APROVADO' WHERE id = $1", [aluno.tccId]); // como se a banca tivesse aprovado
    const meu = await api().get('/api/tccs/meu').set(aluno.auth);
    expect(meu.body.situacao).toBe('APROVADO');
    const res = await api().post(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth)
      .send(versao('ENTREGA_DEFINITIVA', { visibilidade: 'TEXTO_COMPLETO' }));
    expect(res.status).toBe(201);
    const { rows } = await pool.query('SELECT visibilidade FROM tcc WHERE id = $1', [aluno.tccId]);
    expect(rows[0].visibilidade).toBe('TEXTO_COMPLETO');
  });
});

describe('Alertas automáticos e TCC atrasado (RF14)', () => {
  it('avisa 7 dias e 1 dia antes, uma vez só, e marca atrasado quando o prazo passa sem entrega', async () => {
    const hoje = diaDaqui(0);
    const limite = diaDaqui(10);
    const { rows: [curso] } = await pool.query(
      "INSERT INTO curso (nome, sigla) VALUES ('Curso de teste de prazos', $1) RETURNING id", [`P${Date.now() % 100000}`]);
    for (const dia of [hoje, diaDaqui(12)]) {
      await pool.query(
        `INSERT INTO calendario_etapa (curso_id, semestre, etapa, data_inicio, data_limite) VALUES
           ($1, $2, 'QUALIFICACAO', $3::date - 20, $3::date), ($1, $2, 'VERSAO_FINAL', $3::date + 30, $3::date + 60)
         ON CONFLICT DO NOTHING`, [curso.id, semestre(dia), limite]);
    }
    const prof = await novoUsuarioLogado('ORIENTADOR', { cursoId: curso.id });
    const u = await criarUsuario('ALUNO', { cursoId: curso.id });
    const auth = await entrar(u.email);
    const tcc = await api().post('/api/tccs').set(auth).send(proposta());
    const sol = await api().post('/api/orientacao/solicitacoes').set(auth).send({ professorId: prof.id });
    await api().patch(`/api/orientacao/solicitacoes/${sol.body.id}`).set(prof.auth).send({ aceitar: true });
    const titulos = async () => (await api().get('/api/notificacoes').set(auth)).body.map((n: { titulo: string }) => n.titulo);

    await verificarPrazos(diaDaqui(4));   // faltam 6 dias
    await verificarPrazos(diaDaqui(5));   // de novo: não repete
    expect((await titulos()).filter((t: string) => t.startsWith('Faltam'))).toHaveLength(1);

    await verificarPrazos(diaDaqui(9));   // falta 1 dia
    expect(await titulos()).toContain('Prazo da etapa Qualificação termina amanhã');

    await verificarPrazos(diaDaqui(12));  // passou do prazo
    const { rows } = await pool.query('SELECT atrasado FROM tcc WHERE id = $1', [tcc.body.id]);
    expect(rows[0].atrasado).toBe(true);
    expect(await titulos()).toContain('Prazo perdido');
    const hist = await api().get(`/api/tccs/${tcc.body.id}/historico`).set(auth);
    expect(hist.body.some((e: { tipo: string }) => e.tipo === 'PRAZO_PERDIDO')).toBe(true);
  });

  it('a entrega tira a marca de atraso e a tela de prazos mostra cada etapa', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    // TCC criado há 100 dias: a Qualificação (até 61 dias atrás) e a Versão final (até 31 dias atrás) já venceram
    await pool.query("UPDATE tcc SET criado_em = now() - interval '100 days' WHERE id = $1", [aluno.tccId]);
    const antes = await api().get(`/api/tccs/${aluno.tccId}/prazos`).set(aluno.auth);
    expect(antes.body.etapas.find((e: { etapa: string }) => e.etapa === 'QUALIFICACAO').situacao).toBe('ATRASADA');
    expect((await pool.query('SELECT atrasado FROM tcc WHERE id = $1', [aluno.tccId])).rows[0].atrasado).toBe(true);

    await api().post(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth).send(versao('QUALIFICACAO'));
    await api().post(`/api/tccs/${aluno.tccId}/versoes`).set(aluno.auth).send(versao('VERSAO_FINAL'));
    const depois = await api().get(`/api/tccs/${aluno.tccId}/prazos`).set(aluno.auth);
    expect(depois.body.etapas.filter((e: { situacao: string }) => e.situacao === 'ENTREGUE')).toHaveLength(2);
    expect((await pool.query('SELECT atrasado FROM tcc WHERE id = $1', [aluno.tccId])).rows[0].atrasado).toBe(false);
  });
});

describe('Conclusão por publicação (RF21)', () => {
  const artigo = { tituloArtigo: 'Chatbots no ensino de programação', veiculo: 'SBIE 2026', ano: 2026, link: 'https://doi.org/10.5753/sbie.2026.1' };

  it('aluno pede, coordenação aprova e o TCC fica "Aprovado para publicação"', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const coord = await novoUsuarioLogado('COORDENACAO');
    const pedido = await api().post(`/api/tccs/${aluno.tccId}/publicacao`).set(aluno.auth).send(artigo);
    expect(pedido.status).toBe(201);
    expect((await api().post(`/api/tccs/${aluno.tccId}/publicacao`).set(aluno.auth).send(artigo)).status).toBe(409);

    const pendentes = await api().get('/api/publicacoes/pendentes').set(coord.auth);
    expect(pendentes.body.some((p: { id: number }) => p.id === pedido.body.id)).toBe(true);
    const ok = await api().patch(`/api/publicacoes/${pedido.body.id}`).set(coord.auth).send({ aprovar: true });
    expect(ok.status).toBe(200);
    const { rows } = await pool.query('SELECT situacao FROM tcc WHERE id = $1', [aluno.tccId]);
    expect(rows[0].situacao).toBe('APROVADO_PUBLICACAO');
    const { rows: vinc } = await pool.query('SELECT 1 FROM vinculo_orientacao WHERE tcc_id = $1 AND fim IS NULL', [aluno.tccId]);
    expect(vinc).toHaveLength(0);
  });

  it('recusa exige justificativa; proposta sem orientador não pode pedir', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const coord = await novoUsuarioLogado('COORDENACAO');
    const pedido = await api().post(`/api/tccs/${aluno.tccId}/publicacao`).set(aluno.auth).send(artigo);
    const sem = await api().patch(`/api/publicacoes/${pedido.body.id}`).set(coord.auth).send({ aprovar: false });
    expect(sem.body.regra).toBe('RD11');
    const com = await api().patch(`/api/publicacoes/${pedido.body.id}`).set(coord.auth).send({ aprovar: false, justificativa: 'Evento não é qualificado' });
    expect(com.body.status).toBe('RECUSADA');

    const semOrientador = await alunoComProposta();
    expect((await api().post(`/api/tccs/${semOrientador.tccId}/publicacao`).set(semOrientador.auth).send(artigo)).status).toBe(422);
  });
});
