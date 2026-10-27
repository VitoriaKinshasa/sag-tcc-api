import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/shared/db.js';
import { alunoComProposta, alunoOrientado, api, criarUsuario, novoUsuarioLogado, proposta } from './ajudantes.js';

afterAll(() => pool.end());

describe('UC06 – Submeter proposta (RF06, RD01)', () => {
  it('cria o TCC com a situação "Em proposta"', async () => {
    const aluno = await novoUsuarioLogado('ALUNO');
    const res = await api().post('/api/tccs').set(aluno.auth).send(proposta());
    expect(res.status).toBe(201);
    expect(res.body.situacao).toBe('EM_PROPOSTA');
  });

  it('RD01 – não permite um segundo TCC ativo no mesmo curso', async () => {
    const aluno = await alunoComProposta();
    const res = await api().post('/api/tccs').set(aluno.auth).send(proposta('Segundo TCC'));
    expect(res.status).toBe(409);
    expect(res.body.regra).toBe('RD01');
  });

  it('recusa resumo com mais de 250 palavras', async () => {
    const aluno = await novoUsuarioLogado('ALUNO');
    const res = await api().post('/api/tccs').set(aluno.auth).send({ ...proposta(), resumo: 'palavra '.repeat(251) });
    expect(res.status).toBe(422);
  });

  it('professor não pode enviar proposta (RNF05)', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    expect((await api().post('/api/tccs').set(prof.auth).send(proposta())).status).toBe(403);
  });
});

describe('UC07 e UC08 – Solicitar e responder orientação (RF07–RF09)', () => {
  it('fluxo completo: solicita, professor aceita, TCC vai para "Em desenvolvimento"', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoComProposta();
    const sol = await api().post('/api/orientacao/solicitacoes').set(aluno.auth).send({ professorId: prof.id });
    expect(sol.status).toBe(201);

    const resp = await api().patch(`/api/orientacao/solicitacoes/${sol.body.id}`).set(prof.auth).send({ aceitar: true });
    expect(resp.status).toBe(200);
    const tcc = await api().get('/api/tccs/meu').set(aluno.auth);
    expect(tcc.body.situacao).toBe('EM_DESENVOLVIMENTO');
    expect(Number(tcc.body.orientador_id)).toBe(prof.id);

    const notifs = await api().get('/api/notificacoes').set(aluno.auth);
    expect(notifs.body[0].titulo).toBe('Orientação aceita'); // RF37
  });

  it('RD04 – só uma solicitação pendente por vez', async () => {
    const prof1 = await criarUsuario('ORIENTADOR');
    const prof2 = await criarUsuario('ORIENTADOR');
    const aluno = await alunoComProposta();
    await api().post('/api/orientacao/solicitacoes').set(aluno.auth).send({ professorId: prof1.id });
    const segunda = await api().post('/api/orientacao/solicitacoes').set(aluno.auth).send({ professorId: prof2.id });
    expect(segunda.status).toBe(409);
    expect(segunda.body.regra).toBe('RD04');
  });

  it('RD02 – não aceita professor externo como orientador', async () => {
    const externo = await criarUsuario('ORIENTADOR', { externo: true });
    const aluno = await alunoComProposta();
    const res = await api().post('/api/orientacao/solicitacoes').set(aluno.auth).send({ professorId: externo.id });
    expect(res.status).toBe(422);
    expect(res.body.regra).toBe('RD02');
  });

  it('recusa exige justificativa e libera o aluno para nova solicitação', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoComProposta();
    const sol = await api().post('/api/orientacao/solicitacoes').set(aluno.auth).send({ professorId: prof.id });
    const semJustificativa = await api().patch(`/api/orientacao/solicitacoes/${sol.body.id}`).set(prof.auth).send({ aceitar: false });
    expect(semJustificativa.status).toBe(422);
    const recusa = await api().patch(`/api/orientacao/solicitacoes/${sol.body.id}`).set(prof.auth)
      .send({ aceitar: false, justificativa: 'Sem disponibilidade neste semestre' });
    expect(recusa.body.status).toBe('RECUSADA');
    const outra = await criarUsuario('ORIENTADOR');
    const nova = await api().post('/api/orientacao/solicitacoes').set(aluno.auth).send({ professorId: outra.id });
    expect(nova.status).toBe(201);
  });

  it('professor não responde solicitação de outro professor', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const intruso = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoComProposta();
    const sol = await api().post('/api/orientacao/solicitacoes').set(aluno.auth).send({ professorId: prof.id });
    const res = await api().patch(`/api/orientacao/solicitacoes/${sol.body.id}`).set(intruso.auth).send({ aceitar: true });
    expect(res.status).toBe(403);
  });

  it('RD05 – professor no limite de orientandos não pode aceitar novos', async () => {
    const { rows } = await pool.query("INSERT INTO curso (nome, sigla, limite_orientandos) VALUES ('Curso Limite', 'LIM', 1) RETURNING id");
    const prof = await novoUsuarioLogado('ORIENTADOR', { cursoId: Number(rows[0].id) });
    await alunoOrientado(prof); // ocupa a única vaga
    const aluno2 = await alunoComProposta();
    const res = await api().post('/api/orientacao/solicitacoes').set(aluno2.auth).send({ professorId: prof.id });
    expect(res.status).toBe(422);
    expect(res.body.regra).toBe('RD05');
    const lista = await api().get('/api/orientacao/orientadores').set(aluno2.auth);
    expect(lista.body.find((p: { id: number }) => p.id === prof.id).disponivel).toBe(false);
  });
});

describe('UC09 – Reunião de alinhamento e encontros (RF33, RF16, RD15)', () => {
  const amanha = () => new Date(Date.now() + 86_400_000).toISOString();

  it('RD15 – não agenda reunião antes do aceite da orientação', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoComProposta();
    const res = await api().post(`/api/orientacao/tccs/${aluno.tccId}/reunioes`).set(prof.auth)
      .send({ dataHora: amanha(), localOuLink: 'Sala 10' });
    expect(res.status).toBe(422);
    expect(res.body.regra).toBe('RD15');
  });

  it('agenda após o aceite e alerta conflito de horário', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno1 = await alunoOrientado(prof);
    const aluno2 = await alunoOrientado(prof);
    const horario = amanha();
    const r1 = await api().post(`/api/orientacao/tccs/${aluno1.tccId}/reunioes`).set(prof.auth).send({ dataHora: horario, localOuLink: 'Sala 10' });
    expect(r1.status).toBe(201);
    const conflito = await api().post(`/api/orientacao/tccs/${aluno2.tccId}/reunioes`).set(prof.auth).send({ dataHora: horario, localOuLink: 'Sala 11' });
    expect(conflito.status).toBe(409);
    const confirmado = await api().post(`/api/orientacao/tccs/${aluno2.tccId}/reunioes`).set(prof.auth)
      .send({ dataHora: horario, localOuLink: 'Sala 11', confirmarConflito: true });
    expect(confirmado.status).toBe(201);
  });

  it('registra encontro e ele aparece no histórico do TCC', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    await api().post(`/api/orientacao/tccs/${aluno.tccId}/encontros`).set(prof.auth)
      .send({ data: new Date().toISOString(), resumo: 'Definido o escopo do capítulo 1' });
    const hist = await api().get(`/api/tccs/${aluno.tccId}/historico`).set(aluno.auth);
    expect(hist.body.map((e: { tipo: string }) => e.tipo)).toEqual(
      ['PROPOSTA_ENVIADA', 'ORIENTACAO_SOLICITADA', 'ORIENTACAO_ACEITA', 'ENCONTRO_REGISTRADO']);
  });
});

describe('UC10 e UC11 – Troca de orientador (RF34, RD14)', () => {
  it('coordenação aprova a troca e o orientador anterior fica no histórico', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const profAntigo = await novoUsuarioLogado('ORIENTADOR');
    const profNovo = await criarUsuario('ORIENTADOR');
    const aluno = await alunoOrientado(profAntigo);

    const troca = await api().post('/api/orientacao/trocas').set(aluno.auth).send({ novoOrientadorId: profNovo.id, motivo: 'Mudança de tema' });
    expect(troca.status).toBe(201);
    const duplicada = await api().post('/api/orientacao/trocas').set(aluno.auth).send({ novoOrientadorId: profNovo.id, motivo: 'De novo' });
    expect(duplicada.status).toBe(409);

    const decisao = await api().patch(`/api/orientacao/trocas/${troca.body.id}`).set(coord.auth).send({ aprovar: true });
    expect(decisao.status).toBe(200);

    const { rows } = await pool.query(
      "SELECT professor_id, fim FROM vinculo_orientacao WHERE tcc_id = $1 AND papel = 'ORIENTADOR' ORDER BY inicio", [aluno.tccId]);
    expect(rows).toHaveLength(2);
    expect(Number(rows[0].professor_id)).toBe(profAntigo.id);
    expect(rows[0].fim).not.toBeNull();
    expect(Number(rows[1].professor_id)).toBe(profNovo.id);
    expect(rows[1].fim).toBeNull();
  });

  it('recusa exige justificativa e coordenação de outro curso não decide', async () => {
    const coordOutroCurso = await novoUsuarioLogado('COORDENACAO', { cursoId: 2 });
    const coord = await novoUsuarioLogado('COORDENACAO');
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const novo = await criarUsuario('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const troca = await api().post('/api/orientacao/trocas').set(aluno.auth).send({ novoOrientadorId: novo.id, motivo: 'Motivo' });
    expect((await api().patch(`/api/orientacao/trocas/${troca.body.id}`).set(coordOutroCurso.auth).send({ aprovar: true })).status).toBe(403);
    expect((await api().patch(`/api/orientacao/trocas/${troca.body.id}`).set(coord.auth).send({ aprovar: false })).status).toBe(422);
  });
});

describe('UC12 – Registrar desistência (RF35, RD11)', () => {
  it('orientador confirma, TCC é cancelado com justificativa e o aluno pode abrir nova proposta', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const pedido = await api().post('/api/orientacao/desistencias').set(aluno.auth).send({ motivo: 'Mudança de curso' });
    expect(pedido.status).toBe(201);

    const confirma = await api().patch(`/api/orientacao/desistencias/${pedido.body.id}`).set(prof.auth).send({ confirmar: true });
    expect(confirma.status).toBe(200);
    const { rows } = await pool.query('SELECT situacao, justificativa_situacao FROM tcc WHERE id = $1', [aluno.tccId]);
    expect(rows[0].situacao).toBe('CANCELADO');
    expect(rows[0].justificativa_situacao).toBe('Mudança de curso');

    const novaProposta = await api().post('/api/tccs').set(aluno.auth).send(proposta('Novo tema'));
    expect(novaProposta.status).toBe(201);
  });
});

describe('RD13 – Log de auditoria imutável', () => {
  it('o banco impede alterar ou excluir registros de auditoria', async () => {
    await expect(pool.query('DELETE FROM auditoria')).rejects.toThrow(/RD13/);
  });
});
