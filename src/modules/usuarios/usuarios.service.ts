import { pool, transacao, type Db } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado } from '../../shared/errors.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { authService } from '../auth/auth.service.js';
import { usuariosRepository } from './usuarios.repository.js';

export type PerfilUsuario = 'COORDENACAO' | 'ORIENTADOR' | 'ALUNO' | 'MEMBRO_BANCA' | 'ADMINISTRADOR';
export interface NovoUsuario {
  nome: string; email: string; perfil: PerfilUsuario;
  cursoId?: number | null; matricula?: string | null; externo?: boolean; instituicao?: string | null; titulacao?: string | null;
}

async function garantirEmailLivre(email: string, ignorarId?: number) {
  const existente = await usuariosRepository.buscarPorEmail(pool, email);
  if (existente && existente.id !== ignorarId) throw new ErroNegocio(409, 'Já existe um usuário com este e-mail');
}

async function garantirMatriculaLivre(matricula: string | null | undefined, ignorarId?: number) {
  if (!matricula) return;
  const { rows } = await pool.query('SELECT id FROM usuario WHERE matricula = $1', [matricula]);
  if (rows[0] && Number(rows[0].id) !== ignorarId) throw new ErroNegocio(409, 'Já existe um aluno com esta matrícula');
}

/** Quem está cadastrando (vem do token): administrador ou coordenação. */
export interface Ator { id: number; perfil: string; cursoId: number | null }
/** Mantido para quem ainda importa o nome antigo. */
export type Coordenador = Ator;

const SO_SEU_CURSO = 'Você só pode gerenciar usuários do seu curso';
const SO_ADMINISTRADOR = 'Este cadastro é feito pela administração do sistema';
const SO_COORDENACAO = 'Alunos são cadastrados pela coordenação do curso';

/** Professores e membros de banca são do NUCOMP: não pertencem a um curso e orientam alunos de qualquer curso. */
export const PERFIS_DO_NUCLEO = ['ORIENTADOR', 'MEMBRO_BANCA'];
const SEM_CURSO = ['ORIENTADOR', 'MEMBRO_BANCA', 'ADMINISTRADOR'];
const ehAdmin = (a: Ator) => a.perfil === 'ADMINISTRADOR';

/**
 * Quem cadastra quem:
 * - administrador: coordenações, professores do NUCOMP, membros externos e outros administradores (não cadastra alunos);
 * - coordenação: alunos do próprio curso e membros externos (para as bancas).
 */
function podeGerenciar(ator: Ator, alvo: { curso_id: number | string | null; externo: boolean; perfil: string }) {
  if (ehAdmin(ator)) return alvo.perfil !== 'ALUNO';
  if (alvo.externo) return true;
  return alvo.perfil === 'ALUNO' && Number(alvo.curso_id) === ator.cursoId;
}

function conferirPodeCriar(ator: Ator, perfil: string, externo: boolean) {
  if (ehAdmin(ator)) { if (perfil === 'ALUNO') throw new ErroNegocio(403, SO_COORDENACAO); return; }
  if (perfil === 'ALUNO' || (externo && perfil === 'MEMBRO_BANCA')) return;
  throw new ErroNegocio(403, SO_ADMINISTRADOR);
}

async function buscarGerenciavel(ator: Ator, id: number) {
  const alvo = await usuariosRepository.buscarPublicoPorId(pool, id);
  if (!alvo) throw naoEncontrado('Usuário');
  if (!podeGerenciar(ator, alvo)) {
    // a coordenação vê os professores, mas quem altera é a administração
    if (!ehAdmin(ator) && alvo.perfil !== 'ALUNO') throw new ErroNegocio(403, SO_ADMINISTRADOR);
    throw naoEncontrado('Usuário'); // não revela alunos de outro curso
  }
  return alvo;
}

/** Coordenação nova (ou que mudou de curso) passa a ser a coordenação registrada no curso. */
async function marcarCoordenacaoDoCurso(db: Db, usuarioId: number, cursoId: number) {
  const { rowCount } = await db.query('SELECT 1 FROM curso WHERE id = $1', [cursoId]);
  if (!rowCount) throw new ErroNegocio(422, 'Curso não encontrado');
  await db.query('UPDATE curso SET coordenador_id = $2 WHERE id = $1', [cursoId, usuarioId]);
}

export const usuariosService = {
  /** Administrador vê todos, menos os alunos. Coordenação vê os alunos do curso, os professores e os membros externos. */
  async listar(ator: Ator, filtro: { perfil?: string; cursoId?: number }) {
    const lista = await usuariosRepository.listar(pool, { ...filtro, cursoId: ehAdmin(ator) ? filtro.cursoId : ator.cursoId ?? filtro.cursoId });
    return ehAdmin(ator) ? lista.filter((u: { perfil: string }) => u.perfil !== 'ALUNO') : lista.filter((u: { perfil: string }) => u.perfil !== 'ADMINISTRADOR');
  },

  /** UC03 – cadastrar usuário (RF03). Envia o link de primeiro acesso. */
  async criar(ator: Ator, dados: NovoUsuario) {
    const externo = dados.externo ?? false;
    conferirPodeCriar(ator, dados.perfil, externo);
    if (externo || SEM_CURSO.includes(dados.perfil)) dados = { ...dados, cursoId: null }; // professores são do NUCOMP
    else if (!ehAdmin(ator)) {
      if (dados.cursoId != null && dados.cursoId !== ator.cursoId) throw new ErroNegocio(403, SO_SEU_CURSO);
      dados = { ...dados, cursoId: ator.cursoId };
    }
    if (dados.perfil === 'ALUNO' && !dados.matricula) throw new ErroNegocio(422, 'A matrícula é obrigatória para alunos');
    if (!SEM_CURSO.includes(dados.perfil) && !externo && !dados.cursoId) throw new ErroNegocio(422, 'Informe o curso do usuário', 'RF32');
    if (externo && !dados.instituicao) throw new ErroNegocio(422, 'Informe a instituição do membro externo');
    await garantirEmailLivre(dados.email);
    await garantirMatriculaLivre(dados.matricula);

    return transacao(async (db) => {
      const usuario = await usuariosRepository.inserir(db, {
        nome: dados.nome, email: dados.email, perfil: dados.perfil, cursoId: dados.cursoId ?? null,
        matricula: dados.matricula ?? null, externo, instituicao: dados.instituicao ?? null, titulacao: dados.titulacao ?? null,
      });
      if (dados.perfil === 'COORDENACAO') await marcarCoordenacaoDoCurso(db, Number(usuario.id), Number(dados.cursoId));
      await registrarAuditoria(db, { usuarioId: ator.id, tabela: 'usuario', registroId: Number(usuario.id), operacao: 'INSERT', novo: usuario });
      await authService.criarLinkSenha(db, Number(usuario.id), usuario.email, 'PRIMEIRO_ACESSO');
      return usuario;
    });
  },

  /**
   * UC03 – editar usuário. O administrador também pode trocar a função de um professor:
   * professor vira coordenação de um curso (ou deixa de ser), sem perder orientações, bancas e histórico.
   */
  async editar(ator: Ator, id: number, dados: { nome: string; email: string; cursoId?: number | null; matricula?: string | null;
    titulacao?: string | null; perfil?: PerfilUsuario }) {
    const anterior = await buscarGerenciavel(ator, id);
    let perfil: string = anterior.perfil;
    if (dados.perfil && dados.perfil !== anterior.perfil) {
      const troca = ['ORIENTADOR', 'COORDENACAO'];
      if (!ehAdmin(ator)) throw new ErroNegocio(403, SO_ADMINISTRADOR);
      if (!troca.includes(anterior.perfil) || !troca.includes(dados.perfil)) {
        throw new ErroNegocio(422, 'Só é possível trocar entre professor(a) e coordenação. Para outras mudanças, desative e cadastre de novo');
      }
      perfil = dados.perfil;
    }
    let cursoId: number | null;
    if (anterior.externo || SEM_CURSO.includes(perfil)) cursoId = null;
    else if (ehAdmin(ator)) cursoId = dados.cursoId ?? (anterior.curso_id != null ? Number(anterior.curso_id) : null);
    else {
      if (dados.cursoId != null && dados.cursoId !== ator.cursoId) throw new ErroNegocio(403, SO_SEU_CURSO);
      cursoId = ator.cursoId;
    }
    if (perfil === 'COORDENACAO' && !cursoId) throw new ErroNegocio(422, 'Escolha o curso da coordenação', 'RF32');
    if (perfil === 'ALUNO' && !dados.matricula) throw new ErroNegocio(422, 'A matrícula é obrigatória para alunos');
    await garantirEmailLivre(dados.email, id);
    await garantirMatriculaLivre(dados.matricula, id);

    return transacao(async (db) => {
      // perfil e curso mudam juntos (a regra do banco exige curso para a coordenação)
      if (perfil !== anterior.perfil) await db.query('UPDATE usuario SET perfil = $2, curso_id = $3 WHERE id = $1', [id, perfil, cursoId]);
      const novo = await usuariosRepository.atualizarDados(db, id, {
        nome: dados.nome, email: dados.email, cursoId, matricula: dados.matricula ?? null, titulacao: dados.titulacao ?? null,
      });
      if (perfil === 'COORDENACAO' && (anterior.perfil !== 'COORDENACAO' || Number(anterior.curso_id) !== cursoId)) {
        await db.query('UPDATE curso SET coordenador_id = NULL WHERE coordenador_id = $1', [id]);
        await marcarCoordenacaoDoCurso(db, id, cursoId!);
      }
      if (anterior.perfil === 'COORDENACAO' && perfil !== 'COORDENACAO') {
        await db.query('UPDATE curso SET coordenador_id = NULL WHERE coordenador_id = $1', [id]);
      }
      await registrarAuditoria(db, { usuarioId: ator.id, tabela: 'usuario', registroId: id, operacao: 'UPDATE', anterior, novo });
      return novo;
    });
  },

  /** UC03 – desativar usuário: perde o acesso, mas os registros continuam no histórico. */
  async desativar(ator: Ator, id: number) {
    if (ator.id === id) throw new ErroNegocio(422, 'Você não pode desativar o próprio usuário');
    const anterior = await buscarGerenciavel(ator, id);
    await transacao(async (db) => {
      await usuariosRepository.desativar(db, id);
      await registrarAuditoria(db, { usuarioId: ator.id, tabela: 'usuario', registroId: id, operacao: 'UPDATE', anterior, novo: { ...anterior, ativo: false } });
    });
    return { mensagem: 'Usuário desativado' };
  },

  /** UC05 – o professor mantém suas áreas de interesse (RF05). */
  async definirMinhasAreas(professorId: number, areaIds: number[]) {
    const unicas = [...new Set(areaIds)];
    if (unicas.length === 0) throw new ErroNegocio(422, 'Selecione ao menos uma área de interesse', 'RF05');
    const { rows } = await pool.query('SELECT id FROM area_conhecimento WHERE id = ANY($1) AND ativo', [unicas]);
    if (rows.length !== unicas.length) throw new ErroNegocio(422, 'Uma ou mais áreas não existem ou estão inativas');
    await transacao(async (db) => {
      await usuariosRepository.definirAreas(db, professorId, unicas);
      await registrarAuditoria(db, { usuarioId: professorId, tabela: 'professor_area', registroId: professorId, operacao: 'UPDATE', novo: { areas: unicas } });
    });
    return { areas: unicas };
  },
};
