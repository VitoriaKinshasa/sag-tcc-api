import type { Db } from '../../shared/db.js';
import { SITUACOES_ATIVAS } from '../../shared/util.js';

export interface Tcc {
  id: number; aluno_id: number; curso_id: number; area_id: number; titulo: string; subtitulo: string | null;
  resumo: string; orientador_id: number | null; coorientador_id: number | null; situacao: string;
  justificativa_situacao: string | null; visibilidade: string;
}

export const tccRepository = {
  async buscarPorId(db: Db, id: number, travar = false): Promise<Tcc | undefined> {
    const { rows } = await db.query(`SELECT * FROM tcc WHERE id = $1 ${travar ? 'FOR UPDATE' : ''}`, [id]);
    return rows[0];
  },
  /** TCC em andamento do aluno (RD01: no máximo um por curso). */
  async buscarAtivoDoAluno(db: Db, alunoId: number): Promise<Tcc | undefined> {
    const { rows } = await db.query(
      'SELECT * FROM tcc WHERE aluno_id = $1 AND situacao = ANY($2) ORDER BY criado_em DESC LIMIT 1',
      [alunoId, SITUACOES_ATIVAS],
    );
    return rows[0];
  },
  async inserir(db: Db, t: { alunoId: number; cursoId: number; areaId: number; titulo: string; subtitulo: string | null; resumo: string }): Promise<Tcc> {
    const { rows } = await db.query(
      `INSERT INTO tcc (aluno_id, curso_id, area_id, titulo, subtitulo, resumo)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [t.alunoId, t.cursoId, t.areaId, t.titulo, t.subtitulo, t.resumo],
    );
    return rows[0];
  },
  async atualizarProposta(db: Db, id: number, t: { areaId: number; titulo: string; subtitulo: string | null; resumo: string }): Promise<Tcc> {
    const { rows } = await db.query(
      'UPDATE tcc SET area_id = $2, titulo = $3, subtitulo = $4, resumo = $5 WHERE id = $1 RETURNING *',
      [id, t.areaId, t.titulo, t.subtitulo, t.resumo],
    );
    return rows[0];
  },
  async definirOrientacao(db: Db, id: number, orientadorId: number, coorientadorId: number | null): Promise<Tcc> {
    const { rows } = await db.query(
      `UPDATE tcc SET orientador_id = $2, coorientador_id = $3, situacao = 'EM_DESENVOLVIMENTO' WHERE id = $1 RETURNING *`,
      [id, orientadorId, coorientadorId],
    );
    return rows[0];
  },
  async trocarOrientador(db: Db, id: number, novoOrientadorId: number): Promise<Tcc> {
    const { rows } = await db.query('UPDATE tcc SET orientador_id = $2 WHERE id = $1 RETURNING *', [id, novoOrientadorId]);
    return rows[0];
  },
  async cancelar(db: Db, id: number, justificativa: string): Promise<Tcc> {
    const { rows } = await db.query(
      `UPDATE tcc SET situacao = 'CANCELADO', justificativa_situacao = $2 WHERE id = $1 RETURNING *`,
      [id, justificativa],
    );
    return rows[0];
  },
  async historico(db: Db, tccId: number) {
    const { rows } = await db.query(
      `SELECT e.criado_em, e.tipo, e.descricao, u.nome AS autor
       FROM evento_tcc e LEFT JOIN usuario u ON u.id = e.autor_id
       WHERE e.tcc_id = $1 ORDER BY e.criado_em, e.id`,
      [tccId],
    );
    return rows;
  },
};
