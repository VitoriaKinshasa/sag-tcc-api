import { pool, transacao } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado } from '../../shared/errors.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { authService } from '../auth/auth.service.js';
import { usuariosRepository } from './usuarios.repository.js';

export interface NovoUsuario {
  nome: string; email: string; perfil: 'COORDENACAO' | 'ORIENTADOR' | 'ALUNO' | 'MEMBRO_BANCA';
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

export const usuariosService = {
  listar: (filtro: { perfil?: string; cursoId?: number }) => usuariosRepository.listar(pool, filtro),

  /** UC03 – cadastrar usuário (RF03). Envia o link de primeiro acesso. */
  async criar(coordenadorId: number, dados: NovoUsuario) {
    const externo = dados.externo ?? false;
    if (dados.perfil === 'ALUNO' && !dados.matricula) throw new ErroNegocio(422, 'A matrícula é obrigatória para alunos');
    if (dados.perfil !== 'MEMBRO_BANCA' && !externo && !dados.cursoId) throw new ErroNegocio(422, 'Informe o curso do usuário', 'RF32');
    if (externo && !dados.instituicao) throw new ErroNegocio(422, 'Informe a instituição do membro externo');
    await garantirEmailLivre(dados.email);
    await garantirMatriculaLivre(dados.matricula);

    return transacao(async (db) => {
      const usuario = await usuariosRepository.inserir(db, {
        nome: dados.nome, email: dados.email, perfil: dados.perfil, cursoId: dados.cursoId ?? null,
        matricula: dados.matricula ?? null, externo, instituicao: dados.instituicao ?? null, titulacao: dados.titulacao ?? null,
      });
      await registrarAuditoria(db, { usuarioId: coordenadorId, tabela: 'usuario', registroId: Number(usuario.id), operacao: 'INSERT', novo: usuario });
      await authService.criarLinkSenha(db, Number(usuario.id), usuario.email, 'PRIMEIRO_ACESSO');
      return usuario;
    });
  },

  /** UC03 – editar usuário. */
  async editar(coordenadorId: number, id: number, dados: { nome: string; email: string; cursoId?: number | null; matricula?: string | null; titulacao?: string | null }) {
    const anterior = await usuariosRepository.buscarPublicoPorId(pool, id);
    if (!anterior) throw naoEncontrado('Usuário');
    if (anterior.perfil === 'ALUNO' && !dados.matricula) throw new ErroNegocio(422, 'A matrícula é obrigatória para alunos');
    await garantirEmailLivre(dados.email, id);
    await garantirMatriculaLivre(dados.matricula, id);

    return transacao(async (db) => {
      const novo = await usuariosRepository.atualizarDados(db, id, {
        nome: dados.nome, email: dados.email, cursoId: dados.cursoId ?? anterior.curso_id,
        matricula: dados.matricula ?? null, titulacao: dados.titulacao ?? null,
      });
      await registrarAuditoria(db, { usuarioId: coordenadorId, tabela: 'usuario', registroId: id, operacao: 'UPDATE', anterior, novo });
      return novo;
    });
  },

  /** UC03 – desativar usuário: perde o acesso, mas os registros continuam no histórico. */
  async desativar(coordenadorId: number, id: number) {
    if (coordenadorId === id) throw new ErroNegocio(422, 'Você não pode desativar o próprio usuário');
    const anterior = await usuariosRepository.buscarPublicoPorId(pool, id);
    if (!anterior) throw naoEncontrado('Usuário');
    await transacao(async (db) => {
      await usuariosRepository.desativar(db, id);
      await registrarAuditoria(db, { usuarioId: coordenadorId, tabela: 'usuario', registroId: id, operacao: 'UPDATE', anterior, novo: { ...anterior, ativo: false } });
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
