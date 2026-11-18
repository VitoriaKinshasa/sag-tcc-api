import { pool, transacao } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado } from '../../shared/errors.js';
import { registrarAuditoria } from '../../shared/auditoria.js';

/** UC04 – Manter cursos e áreas (CRUD) (RF32). */
export const cursosService = {
  async listarCursos() {
    // coordenação atual de cada curso (quem tem perfil de coordenação ativo naquele curso)
    const { rows } = await pool.query(
      `SELECT c.*, (SELECT string_agg(u.nome, ', ' ORDER BY u.nome) FROM usuario u
                   WHERE u.curso_id = c.id AND u.perfil = 'COORDENACAO' AND u.ativo) AS coordenacao
       FROM curso c ORDER BY c.nome`,
    );
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

  /** Regras do NUCOMP (valem para todos os cursos): limite TOTAL de orientandos por professor (RD05). */
  async regrasNucleo() {
    const { rows } = await pool.query("SELECT valor FROM regra_nucleo WHERE chave = 'limite_orientandos'");
    return { limiteOrientandos: Number(rows[0]?.valor ?? 5) };
  },

  async editarRegrasNucleo(coordenacao: { id: number }, r: { limiteOrientandos: number }) {
    const anterior = await this.regrasNucleo();
    await transacao(async (db) => {
      await db.query(
        `INSERT INTO regra_nucleo (chave, valor) VALUES ('limite_orientandos', $1)
         ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()`, [r.limiteOrientandos],
      );
      await registrarAuditoria(db, { usuarioId: coordenacao.id, tabela: 'regra_nucleo', registroId: 1, operacao: 'UPDATE', anterior, novo: r });
    });
    return r;
  },

  /** Regras do curso (só a coordenação do próprio curso): banca, nota mínima, prazo de correções e privacidade das notas. */
  async editarRegras(coordenacao: { id: number; cursoId: number | null }, id: number, r: {
    notaMinima: number; minTitulares: number; minSuplentes: number; diasCorrecoes: number; notasIndividuaisAluno: boolean;
  }) {
    if (coordenacao.cursoId !== id) throw new ErroNegocio(403, 'Você só pode alterar as regras do seu curso');
    const { rows: atual } = await pool.query('SELECT * FROM curso WHERE id = $1', [id]);
    if (!atual[0]) throw naoEncontrado('Curso');
    return transacao(async (db) => {
      const { rows } = await db.query(
        `UPDATE curso SET nota_minima = $2, min_titulares = $3, min_suplentes = $4,
                dias_correcoes = $5, notas_individuais_aluno = $6 WHERE id = $1 RETURNING *`,
        [id, r.notaMinima, r.minTitulares, r.minSuplentes, r.diasCorrecoes, r.notasIndividuaisAluno],
      );
      await registrarAuditoria(db, { usuarioId: coordenacao.id, tabela: 'curso', registroId: id, operacao: 'UPDATE', anterior: atual[0], novo: rows[0] });
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
