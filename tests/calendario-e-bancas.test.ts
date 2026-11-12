import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool } from '../src/shared/db.js';
import { emailService } from '../src/shared/notificacao.js';
import {
  alunoAptoADefesa, alunoComProposta, alunoOrientado, api, calendarioComDefesaAberta, defesaDaqui, diaDaqui, novoUsuarioLogado,
} from './ajudantes.js';

afterAll(() => pool.end());

const ETAPAS = ['PROPOSTA', 'QUALIFICACAO', 'VERSAO_FINAL', 'DEFESA', 'ENTREGA_DEFINITIVA'];
/** Monta as 5 etapas em sequência a partir de um dia (deslocamento em dias a partir de hoje). */
const etapasAPartirDe = (inicio: number) => ETAPAS.map((etapa, i) => ({
  etapa, dataInicio: diaDaqui(inicio + i * 10), dataLimite: diaDaqui(inicio + i * 10 + 9),
}));

describe('UC13 – Manter calendário de etapas (RF12, RN03)', () => {
  it('coordenação cadastra o calendário e os outros perfis só consultam', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const res = await api().post('/api/calendarios').set(coord.auth).send({ semestre: '2030.1', etapas: etapasAPartirDe(1) });
    expect(res.status).toBe(201);
    expect(res.body.etapas).toHaveLength(5);

    const aluno = await novoUsuarioLogado('ALUNO');
    const lista = await api().get('/api/calendarios').set(aluno.auth);
    expect(lista.body.find((c: { semestre: string }) => c.semestre === '2030.1').etapas[3].etapa).toBe('DEFESA');
    expect((await api().post('/api/calendarios').set(aluno.auth).send({ semestre: '2030.2', etapas: etapasAPartirDe(1) })).status).toBe(403);
  });

  it('não aceita o mesmo semestre duas vezes', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    await api().post('/api/calendarios').set(coord.auth).send({ semestre: '2030.2', etapas: etapasAPartirDe(1) });
    const res = await api().post('/api/calendarios').set(coord.auth).send({ semestre: '2030.2', etapas: etapasAPartirDe(1) });
    expect(res.status).toBe(409);
  });

  it('exige as 5 etapas, em ordem e com início antes do limite', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const faltando = await api().post('/api/calendarios').set(coord.auth).send({ semestre: '2031.1', etapas: etapasAPartirDe(1).slice(0, 4) });
    expect(faltando.status).toBe(422);
    expect(faltando.body.erro).toContain('Entrega definitiva');

    const foraDeOrdem = etapasAPartirDe(1);
    foraDeOrdem[3] = { etapa: 'DEFESA', dataInicio: diaDaqui(2), dataLimite: diaDaqui(5) };
    expect((await api().post('/api/calendarios').set(coord.auth).send({ semestre: '2031.1', etapas: foraDeOrdem })).status).toBe(422);
  });

  it('RN03 – etapa que já terminou não pode ser alterada; as futuras podem', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const etapas = etapasAPartirDe(-25); // Proposta e Qualificação já terminaram
    await api().post('/api/calendarios').set(coord.auth).send({ semestre: '2031.2', etapas });

    const mudandoPassada = etapas.map((e) => (e.etapa === 'PROPOSTA' ? { ...e, dataLimite: diaDaqui(-17) } : e));
    const erro = await api().put('/api/calendarios/2031.2').set(coord.auth).send({ etapas: mudandoPassada });
    expect(erro.status).toBe(422);
    expect(erro.body.regra).toBe('RN03');

    const mudandoFutura = etapas.map((e) => (e.etapa === 'ENTREGA_DEFINITIVA' ? { ...e, dataLimite: diaDaqui(30) } : e));
    const ok = await api().put('/api/calendarios/2031.2').set(coord.auth).send({ etapas: mudandoFutura });
    expect(ok.status).toBe(200);
    expect(ok.body.etapas[4].data_limite).toBe(diaDaqui(30));
  });
});

describe('UC17 – Alterar situação do TCC (RF15, RD10, RD11)', () => {
  it('orientador marca o TCC como apto à defesa e o evento vai para o histórico', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const res = await api().patch(`/api/tccs/${aluno.tccId}/situacao`).set(prof.auth).send({ situacao: 'APTO_DEFESA' });
    expect(res.status).toBe(200);
    expect(res.body.situacao).toBe('APTO_DEFESA');
    const hist = await api().get(`/api/tccs/${aluno.tccId}/historico`).set(aluno.auth);
    expect(hist.body.at(-1).tipo).toBe('SITUACAO_ALTERADA');
  });

  it('RD10 – outro professor não pode alterar a situação', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const outro = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const res = await api().patch(`/api/tccs/${aluno.tccId}/situacao`).set(outro.auth).send({ situacao: 'APTO_DEFESA' });
    expect(res.status).toBe(403);
    expect(res.body.regra).toBe('RD10');
  });

  it('RD11 – cancelar exige justificativa', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const aluno = await alunoComProposta();
    const sem = await api().patch(`/api/tccs/${aluno.tccId}/situacao`).set(coord.auth).send({ situacao: 'CANCELADO' });
    expect(sem.status).toBe(422);
    expect(sem.body.regra).toBe('RD11');
    const com = await api().patch(`/api/tccs/${aluno.tccId}/situacao`).set(coord.auth).send({ situacao: 'CANCELADO', justificativa: 'Aluno trancou o curso' });
    expect(com.status).toBe(200);
  });

  it('não permite pular etapas nem marcar aprovado sem defesa', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const aluno = await alunoComProposta();
    const res = await api().patch(`/api/tccs/${aluno.tccId}/situacao`).set(coord.auth).send({ situacao: 'APROVADO', justificativa: 'x' });
    expect(res.status).toBe(422);
    expect(res.body.erro).toContain('Em proposta');
  });

  it('coordenação lista os TCCs do curso', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    await alunoComProposta();
    const res = await api().get('/api/tccs').set(coord.auth);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('UC19 – Cadastrar banca de defesa (RF17, RD07, RD08, RD09)', () => {
  let titular1: Awaited<ReturnType<typeof novoUsuarioLogado>>;
  let titular2: Awaited<ReturnType<typeof novoUsuarioLogado>>;
  let suplente: Awaited<ReturnType<typeof novoUsuarioLogado>>;
  const membros = () => [
    { usuarioId: titular1.id, papel: 'TITULAR' }, { usuarioId: titular2.id, papel: 'TITULAR' }, { usuarioId: suplente.id, papel: 'SUPLENTE' },
  ];
  beforeAll(async () => {
    await calendarioComDefesaAberta();
    titular1 = await novoUsuarioLogado('ORIENTADOR');
    titular2 = await novoUsuarioLogado('MEMBRO_BANCA');
    suplente = await novoUsuarioLogado('ORIENTADOR');
  });

  it('orientador cadastra a banca, vira presidente e todos são avisados', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoAptoADefesa(prof);
    emailService.enviados.length = 0;
    const res = await api().post('/api/bancas').set(prof.auth)
      .send({ tccId: aluno.tccId, dataHora: defesaDaqui(5, 13), localOuLink: 'Sala UC19-a', membros: membros() });
    expect(res.status).toBe(201);
    expect(res.body.membros).toHaveLength(4);
    expect(res.body.membros[0]).toMatchObject({ usuarioId: prof.id, papel: 'PRESIDENTE' });
    expect(emailService.enviados.map((e) => e.para)).toEqual(expect.arrayContaining([titular1.email, titular2.email, suplente.email, aluno.email]));

    const agenda = await api().get('/api/agenda'); // pública, sem login
    expect(agenda.status).toBe(200);
    const item = agenda.body.find((b: { id: number }) => b.id === res.body.id);
    expect(item.aluno).toBeDefined();
    expect(JSON.stringify(item)).not.toContain('@'); // sem e-mails na agenda pública
  });

  it('RD07 – só para TCC apto à defesa', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoOrientado(prof);
    const res = await api().post('/api/bancas').set(prof.auth)
      .send({ tccId: aluno.tccId, dataHora: defesaDaqui(5), localOuLink: 'Sala UC19-b', membros: membros() });
    expect(res.status).toBe(422);
    expect(res.body.regra).toBe('RD07');
  });

  it('RD08 – precisa de 3 titulares e 1 suplente', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoAptoADefesa(prof);
    const res = await api().post('/api/bancas').set(prof.auth)
      .send({ tccId: aluno.tccId, dataHora: defesaDaqui(5), localOuLink: 'Sala UC19-c', membros: membros().slice(1) });
    expect(res.status).toBe(422);
    expect(res.body.regra).toBe('RD08');
  });

  it('RD08 – aluno não pode ser membro', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoAptoADefesa(prof);
    const outroAluno = await novoUsuarioLogado('ALUNO');
    const res = await api().post('/api/bancas').set(prof.auth).send({
      tccId: aluno.tccId, dataHora: defesaDaqui(5), localOuLink: 'Sala UC19-d',
      membros: [...membros(), { usuarioId: outroAluno.id, papel: 'TITULAR' }],
    });
    expect(res.status).toBe(422);
    expect(res.body.regra).toBe('RD08');
  });

  it('RD09 – data no passado ou depois do limite da etapa Defesa é recusada', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoAptoADefesa(prof);
    const base = { tccId: aluno.tccId, localOuLink: 'Sala UC19-e', membros: membros() };
    const passado = await api().post('/api/bancas').set(prof.auth).send({ ...base, dataHora: defesaDaqui(-1) });
    expect(passado.body.regra).toBe('RD09');
    const depois = await api().post('/api/bancas').set(prof.auth).send({ ...base, dataHora: defesaDaqui(45) });
    expect(depois.status).toBe(422);
    expect(depois.body.regra).toBe('RD09');
  });

  it('conflito de agenda: membro já está em outra banca no mesmo horário', async () => {
    const profA = await novoUsuarioLogado('ORIENTADOR');
    const profB = await novoUsuarioLogado('ORIENTADOR');
    const alunoA = await alunoAptoADefesa(profA);
    const alunoB = await alunoAptoADefesa(profB);
    await api().post('/api/bancas').set(profA.auth).send({ tccId: alunoA.tccId, dataHora: defesaDaqui(10, 15), localOuLink: 'Sala UC19-f', membros: membros() });
    const res = await api().post('/api/bancas').set(profB.auth).send({ tccId: alunoB.tccId, dataHora: defesaDaqui(10, 16), localOuLink: 'Sala UC19-g', membros: membros() });
    expect(res.status).toBe(409);
    expect(res.body.erro).toContain('Conflito de agenda');
  });

  it('UC17 – se o TCC volta para "Em desenvolvimento", a banca é cancelada', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoAptoADefesa(prof);
    const banca = await api().post('/api/bancas').set(prof.auth)
      .send({ tccId: aluno.tccId, dataHora: defesaDaqui(12, 13), localOuLink: 'Sala UC19-h', membros: membros() });
    await api().patch(`/api/tccs/${aluno.tccId}/situacao`).set(prof.auth).send({ situacao: 'EM_DESENVOLVIMENTO', justificativa: 'Faltam os testes' });
    const depois = await api().get(`/api/bancas/${banca.body.id}`).set(prof.auth);
    expect(depois.body.status).toBe('CANCELADA');
  });
});

describe('UC20 – Registrar resultado da defesa (RF18, RF19, RF20)', () => {
  /** Cria uma banca e "volta no tempo" para a defesa já ter acontecido. */
  async function bancaRealizadaOntem(local: string) {
    await calendarioComDefesaAberta();
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const t1 = await novoUsuarioLogado('ORIENTADOR');
    const t2 = await novoUsuarioLogado('MEMBRO_BANCA');
    const sup = await novoUsuarioLogado('ORIENTADOR');
    const aluno = await alunoAptoADefesa(prof);
    const res = await api().post('/api/bancas').set(prof.auth).send({
      tccId: aluno.tccId, dataHora: defesaDaqui(3, 18), localOuLink: local,
      membros: [{ usuarioId: t1.id, papel: 'TITULAR' }, { usuarioId: t2.id, papel: 'TITULAR' }, { usuarioId: sup.id, papel: 'SUPLENTE' }],
    });
    await pool.query("UPDATE banca SET data_hora = now() - interval '1 day' WHERE id = $1", [res.body.id]);
    return { bancaId: Number(res.body.id), prof, t1, t2, sup, aluno };
  }

  it('nota só depois da defesa e só de titulares; suplente não lança nota', async () => {
    const b = await bancaRealizadaOntem('Sala UC20-a');
    const sup = await api().post(`/api/bancas/${b.bancaId}/notas`).set(b.sup.auth).send({ nota: 9 });
    expect(sup.status).toBe(422);
    const ok = await api().post(`/api/bancas/${b.bancaId}/notas`).set(b.t1.auth).send({ nota: 8.5, parecer: 'Bom trabalho' });
    expect(ok.status).toBe(201);
    expect(ok.body.faltam).toBe(2);
    const repetida = await api().post(`/api/bancas/${b.bancaId}/notas`).set(b.t1.auth).send({ nota: 9 });
    expect(repetida.status).toBe(409);
    const foraDaFaixa = await api().post(`/api/bancas/${b.bancaId}/notas`).set(b.t2.auth).send({ nota: 11 });
    expect(foraDaFaixa.status).toBe(422);
  });

  it('resultado exige todas as notas; depois calcula a média e aprova o TCC', async () => {
    const b = await bancaRealizadaOntem('Sala UC20-b');
    await api().post(`/api/bancas/${b.bancaId}/notas`).set(b.t1.auth).send({ nota: 8 });
    const cedo = await api().post(`/api/bancas/${b.bancaId}/resultado`).set(b.prof.auth).send({ resultado: 'APROVADO' });
    expect(cedo.status).toBe(422);
    expect(cedo.body.erro).toContain('faltam as notas');

    await api().post(`/api/bancas/${b.bancaId}/notas`).set(b.t2.auth).send({ nota: 9 });
    await api().post(`/api/bancas/${b.bancaId}/notas`).set(b.prof.auth).send({ nota: 10 });
    const naoPresidente = await api().post(`/api/bancas/${b.bancaId}/resultado`).set(b.t1.auth).send({ resultado: 'APROVADO' });
    expect(naoPresidente.status).toBe(403);

    const res = await api().post(`/api/bancas/${b.bancaId}/resultado`).set(b.prof.auth).send({ resultado: 'APROVADO' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'REALIZADA', resultado: 'APROVADO', nota_final: 9 });
    const { rows } = await pool.query('SELECT situacao FROM tcc WHERE id = $1', [b.aluno.tccId]);
    expect(rows[0].situacao).toBe('APROVADO');

    const ata = await api().get(`/api/bancas/${b.bancaId}/ata`).set(b.aluno.auth);
    expect(ata.status).toBe(200);
    expect(ata.body.notas).toHaveLength(3);
  });

  it('RD11 – reprovação exige justificativa', async () => {
    const b = await bancaRealizadaOntem('Sala UC20-c');
    for (const m of [b.prof, b.t1, b.t2]) await api().post(`/api/bancas/${b.bancaId}/notas`).set(m.auth).send({ nota: 4 });
    const sem = await api().post(`/api/bancas/${b.bancaId}/resultado`).set(b.prof.auth).send({ resultado: 'REPROVADO' });
    expect(sem.body.regra).toBe('RD11');
    const com = await api().post(`/api/bancas/${b.bancaId}/resultado`).set(b.prof.auth)
      .send({ resultado: 'REPROVADO', observacao: 'Metodologia insuficiente' });
    expect(com.status).toBe(201);
    const { rows } = await pool.query('SELECT situacao FROM tcc WHERE id = $1', [b.aluno.tccId]);
    expect(rows[0].situacao).toBe('REPROVADO');
  });
});

describe('UC21 – Agenda e convites', () => {
  it('aluno convida a audiência por e-mail (no máximo 20)', async () => {
    await calendarioComDefesaAberta();
    const prof = await novoUsuarioLogado('ORIENTADOR');
    const t1 = await novoUsuarioLogado('ORIENTADOR');
    const t2 = await novoUsuarioLogado('ORIENTADOR');
    const sup = await novoUsuarioLogado('MEMBRO_BANCA');
    const aluno = await alunoAptoADefesa(prof);
    const banca = await api().post('/api/bancas').set(prof.auth).send({
      tccId: aluno.tccId, dataHora: defesaDaqui(20, 13), localOuLink: 'Sala UC21-a',
      membros: [{ usuarioId: t1.id, papel: 'TITULAR' }, { usuarioId: t2.id, papel: 'TITULAR' }, { usuarioId: sup.id, papel: 'SUPLENTE' }],
    });
    const res = await api().post(`/api/bancas/${banca.body.id}/convites`).set(aluno.auth).send({ emails: ['mae@exemplo.com', 'amigo@exemplo.com'] });
    expect(res.body.enviados).toBe(2);
    const muitos = Array.from({ length: 21 }, (_, i) => `p${i}@exemplo.com`);
    expect((await api().post(`/api/bancas/${banca.body.id}/convites`).set(aluno.auth).send({ emails: muitos })).status).toBe(422);

    const minhas = await api().get('/api/bancas/minhas').set(t1.auth);
    expect(minhas.body[0].meuPapel).toBe('TITULAR');
    const estranho = await novoUsuarioLogado('ALUNO');
    expect((await api().get(`/api/bancas/${banca.body.id}`).set(estranho.auth)).status).toBe(403);
  });
});
