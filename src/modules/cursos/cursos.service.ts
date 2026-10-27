import { pool, transacao } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado } from '../../shared/errors.js';
import { registrarAuditoria } from '../../shared/auditoria.js';

/** UC04 – Manter cursos e áreas (CRUD) (RF32). */
export const cursosService = {
  async listarCursos() {
    const { rows } = await pool.query('SELECT * FROM curso ORDER BY nome');
    return rows;
  },

  async criarCurso(coordenadorId: number, dados: { nome: string; sigla: string; limiteOrientandos?: number }) {
    const sigla = dados.sigla.toUpperCase();
    const { rows: existe } = await pool.query('SELECT 1 FROM curso WHERE sigla = $1', [sigla]);
    if (existe[0]) throw new ErroNegocio(409, 'Já existe um curso com esta sigla');
    return transacao(async (db) => {
      const { rows } = await db.query(
        'INSERT INTO curso (nome, sigla, limite_orientandos) VALUES ($1, $2, $3) RETURNING *',
        [dados.nome, sigla, dados.limiteOrientandos ?? 5],
      );
      await registrarAuditoria(db, { usuarioId: coordenadorId, tabela: 'curso', registroId: Number(rows[0].id), operacao: 'INSERT', novo: rows[0] });
      return rows[0];
    });
  },

  async editarCurso(coordenadorId: number, id: number, dados: { nome: string; limiteOrientandos: number; coordenadorId?: number | null }) {
    const { rows: atual } = await pool.query('SELECT * FROM curso WHERE id = $1', [id]);
    if (!atual[0]) throw naoEncontrado('Curso');
    return transacao(async (db) => {
      const { rows } = await db.query(
        'UPDATE curso SET nome = $2, limite_orientandos = $3, coordenador_id = $4 WHERE id = $1 RETURNING *',
        [id, dados.nome, dados.limiteOrientandos, dados.coordenadorId ?? atual[0].coordenador_id],
      );
      await registrarAuditoria(db, { usuarioId: coordenadorId, tabela: 'curso', registroId: id, operacao: 'UPDATE', anterior: atual[0], novo: rows[0] });
      return rows[0];
    });
  },

  /** UC04 A2 – curso com registros vinculados não pode ser excluído, apenas desativado. */
  async excluirCurso(coordenadorId: number, id: number) {
    const { rows: atual } = await pool.query('SELECT * FROM curso WHERE id = $1', [id]);
    if (!atual[0]) throw naoEncontrado('Curso');
    const { rows } = await pool.query(
      `SELECT (SELECT count(*) FROM usuario WHERE curso_id = $1) + (SELECT count(*) FROM tcc WHERE curso_id = $1) AS total`,
      [id],
    );
    if (Number(rows[0].total) > 0) {
      throw new ErroNegocio(409, 'O curso possui usuários ou TCCs vinculados e não pode ser excluído. Use a desativação');
    }
    await transacao(async (db) => {
      await db.query('DELETE FROM curso WHERE id = $1', [id]);
      await registrarAuditoria(db, { usuarioId: coordenadorId, tabela: 'curso', registroId: id, operacao: 'DELETE', anterior: atual[0] });
    });
    return { mensagem: 'Curso excluído' };
  },

  async desativarCurso(coordenadorId: number, id: number) {
    await transacao(async (db) => {
      const { rows } = await db.query('UPDATE curso SET ativo = FALSE WHERE id = $1 RETURNING *', [id]);
      if (!rows[0]) throw naoEncontrado('Curso');
      await registrarAuditoria(db, { usuarioId: coordenadorId, tabela: 'curso', registroId: id, operacao: 'UPDATE', novo: rows[0] });
    });
    return { mensagem: 'Curso desativado' };
  },

  async listarAreas() {
    const { rows } = await pool.query('SELECT * FROM area_conhecimento WHERE ativo ORDER BY nome');
    return rows;
  },

  async criarArea(coordenadorId: number, nome: string) {
    const { rows: existe } = await pool.query('SELECT 1 FROM area_conhecimento WHERE lower(nome) = lower($1)', [nome]);
    if (existe[0]) throw new ErroNegocio(409, 'Esta área já está cadastrada');
    return transacao(async (db) => {
      const { rows } = await db.query('INSERT INTO area_conhecimento (nome) VALUES ($1) RETURNING *', [nome]);
      await registrarAuditoria(db, { usuarioId: coordenadorId, tabela: 'area_conhecimento', registroId: Number(rows[0].id), operacao: 'INSERT', novo: rows[0] });
      return rows[0];
    });
  },
};
