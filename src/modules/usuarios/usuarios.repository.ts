import type { Db } from '../../shared/db.js';

export interface Usuario {
  id: number; nome: string; email: string; senha_hash: string | null; perfil: string;
  curso_id: number | null; matricula: string | null; externo: boolean; instituicao: string | null;
  titulacao: string | null; ativo: boolean; tentativas_login: number; bloqueado_ate: Date | null;
  termo_aceito_em: Date | null;
}

const COLUNAS_PUBLICAS = 'id, nome, email, perfil, curso_id, matricula, externo, instituicao, titulacao, ativo';

export const usuariosRepository = {
  async buscarPorEmail(db: Db, email: string): Promise<Usuario | undefined> {
    const { rows } = await db.query('SELECT * FROM usuario WHERE lower(email) = lower($1)', [email]);
    return rows[0];
  },
  async buscarPorId(db: Db, id: number): Promise<Usuario | undefined> {
    const { rows } = await db.query('SELECT * FROM usuario WHERE id = $1', [id]);
    return rows[0];
  },
  async buscarPublicoPorId(db: Db, id: number) {
    const { rows } = await db.query(`SELECT ${COLUNAS_PUBLICAS} FROM usuario WHERE id = $1`, [id]);
    return rows[0];
  },
  async listar(db: Db, filtro: { perfil?: string; cursoId?: number }) {
    const { rows } = await db.query(
      `SELECT ${COLUNAS_PUBLICAS} FROM usuario
       WHERE ($1::perfil_usuario IS NULL OR perfil = $1) AND ($2::bigint IS NULL OR curso_id = $2)
       ORDER BY nome`,
      [filtro.perfil ?? null, filtro.cursoId ?? null],
    );
    return rows;
  },
  async inserir(db: Db, u: { nome: string; email: string; perfil: string; cursoId: number | null; matricula: string | null;
    externo: boolean; instituicao: string | null; titulacao: string | null }) {
    const { rows } = await db.query(
      `INSERT INTO usuario (nome, email, perfil, curso_id, matricula, externo, instituicao, titulacao)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUNAS_PUBLICAS}`,
      [u.nome, u.email, u.perfil, u.cursoId, u.matricula, u.externo, u.instituicao, u.titulacao],
    );
    return rows[0];
  },
  async atualizarDados(db: Db, id: number, u: { nome: string; email: string; cursoId: number | null; matricula: string | null; titulacao: string | null }) {
    const { rows } = await db.query(
      `UPDATE usuario SET nome = $2, email = $3, curso_id = $4, matricula = $5, titulacao = $6
       WHERE id = $1 RETURNING ${COLUNAS_PUBLICAS}`,
      [id, u.nome, u.email, u.cursoId, u.matricula, u.titulacao],
    );
    return rows[0];
  },
  async desativar(db: Db, id: number) {
    await db.query('UPDATE usuario SET ativo = FALSE WHERE id = $1', [id]);
  },
  async registrarFalhaLogin(db: Db, id: number, tentativas: number, bloqueadoAte: Date | null) {
    await db.query('UPDATE usuario SET tentativas_login = $2, bloqueado_ate = $3 WHERE id = $1', [id, tentativas, bloqueadoAte]);
  },
  async zerarTentativas(db: Db, id: number) {
    await db.query('UPDATE usuario SET tentativas_login = 0, bloqueado_ate = NULL WHERE id = $1', [id]);
  },
  async definirSenha(db: Db, id: number, senhaHash: string) {
    await db.query('UPDATE usuario SET senha_hash = $2, tentativas_login = 0, bloqueado_ate = NULL WHERE id = $1', [id, senhaHash]);
  },
  async aceitarTermo(db: Db, id: number) {
    await db.query('UPDATE usuario SET termo_aceito_em = now() WHERE id = $1', [id]);
  },
  async definirAreas(db: Db, professorId: number, areaIds: number[]) {
    await db.query('DELETE FROM professor_area WHERE professor_id = $1', [professorId]);
    for (const areaId of areaIds) {
      await db.query('INSERT INTO professor_area (professor_id, area_id) VALUES ($1, $2)', [professorId, areaId]);
    }
  },
};
