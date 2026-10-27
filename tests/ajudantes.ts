import bcrypt from 'bcryptjs';
import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/shared/db.js';

export const api = () => request(app);
export const SENHA = 'Senha@123';
const hashSenha = bcrypt.hashSync(SENHA, 4);
let contador = 0;

/** Cria um usuário direto no banco (com senha definida) e devolve o id. */
export async function criarUsuario(perfil: 'COORDENACAO' | 'ORIENTADOR' | 'ALUNO', extra: { cursoId?: number; externo?: boolean } = {}) {
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

export async function novoUsuarioLogado(perfil: 'COORDENACAO' | 'ORIENTADOR' | 'ALUNO', extra: { cursoId?: number } = {}) {
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
