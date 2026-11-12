import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/shared/db.js';

export const api = () => request(app);
export const SENHA = 'Senha@123';
const hashSenha = bcrypt.hashSync(SENHA, 4);
let contador = 0;

/** Cria um usuário direto no banco (com senha definida) e devolve o id. */
export type PerfilTeste = 'COORDENACAO' | 'ORIENTADOR' | 'ALUNO' | 'MEMBRO_BANCA';
export async function criarUsuario(perfil: PerfilTeste, extra: { cursoId?: number; externo?: boolean } = {}) {
  contador += 1;
  const email = `${perfil.toLowerCase()}${contador}-${Date.now()}@uea.edu.br`;
  const { rows } = await pool.query(
    `INSERT INTO usuario (nome, email, senha_hash, perfil, curso_id, matricula, externo, instituicao)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [`${perfil} ${contador}`, email, hashSenha, perfil, extra.externo ? null : (extra.cursoId ?? 1),
     perfil === 'ALUNO' ? `M${Date.now()}${contador}` : null, extra.externo ?? false, extra.externo ? 'Outra Universidade' : null],
  );
  return { id: Number(rows[0].id), email };
}

/** Faz login pela API e devolve o cabeçalho de autorização. */
export async function entrar(email: string) {
  const res = await api().post('/api/auth/login').send({ email, senha: SENHA });
  if (res.status !== 200) throw new Error(`Login falhou: ${JSON.stringify(res.body)}`);
  return { Authorization: `Bearer ${res.body.token}` };
}

export async function novoUsuarioLogado(perfil: PerfilTeste, extra: { cursoId?: number } = {}) {
  const u = await criarUsuario(perfil, extra);
  return { ...u, auth: await entrar(u.email) };
}

export const proposta = (titulo = 'Sistema de apoio ao TCC') => ({
  titulo, resumo: 'Este trabalho propõe um sistema web para acompanhar TCCs.', areaId: 1,
});

/** Atalho: aluno com proposta enviada. */
export async function alunoComProposta() {
  const aluno = await novoUsuarioLogado('ALUNO');
  const res = await api().post('/api/tccs').set(aluno.auth).send(proposta());
  return { ...aluno, tccId: Number(res.body.id) };
}

/** Atalho: aluno com orientação já aceita pelo professor. */
export async function alunoOrientado(professor: { id: number; auth: Record<string, string> }) {
  const aluno = await alunoComProposta();
  const sol = await api().post('/api/orientacao/solicitacoes').set(aluno.auth).send({ professorId: professor.id });
  await api().patch(`/api/orientacao/solicitacoes/${sol.body.id}`).set(professor.auth).send({ aceitar: true });
  return aluno;
}

/** Dia (AAAA-MM-DD) daqui a n dias, no horário de Manaus. */
export const diaDaqui = (n: number) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });
const semestre = (dia: string) => `${dia.slice(0, 4)}.${Number(dia.slice(5, 7)) <= 6 ? 1 : 2}`;

/** Garante um calendário com a etapa Defesa aberta de hoje até daqui a 40 dias (semestres de hoje e de daqui a 40 dias). */
export async function calendarioComDefesaAberta(cursoId = 1) {
  for (const dia of [diaDaqui(0), diaDaqui(40)]) {
    await pool.query(
      `INSERT INTO calendario_etapa (curso_id, semestre, etapa, data_inicio, data_limite) VALUES
         ($1, $2, 'PROPOSTA', $3::date - 120, $3::date - 91), ($1, $2, 'QUALIFICACAO', $3::date - 90, $3::date - 61),
         ($1, $2, 'VERSAO_FINAL', $3::date - 60, $3::date - 31), ($1, $2, 'DEFESA', $3::date - 30, $3::date + 40),
         ($1, $2, 'ENTREGA_DEFINITIVA', $3::date + 41, $3::date + 60)
       ON CONFLICT (curso_id, semestre, etapa) DO NOTHING`,
      [cursoId, semestre(dia), diaDaqui(0)],
    );
  }
}

/** Atalho: TCC já marcado como "Apto à defesa" pelo orientador. */
export async function alunoAptoADefesa(professor: { id: number; auth: Record<string, string> }) {
  const aluno = await alunoOrientado(professor);
  await api().patch(`/api/tccs/${aluno.tccId}/situacao`).set(professor.auth).send({ situacao: 'APTO_DEFESA' });
  return aluno;
}

/** Data e hora (ISO) daqui a n dias, às 10h de Manaus (14h UTC). */
export const defesaDaqui = (n: number, hora = 14) => `${diaDaqui(n)}T${String(hora).padStart(2, '0')}:00:00.000Z`;
