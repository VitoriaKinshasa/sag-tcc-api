import type { Db } from '../../shared/db.js';
import { SITUACOES_ATIVAS } from '../../shared/util.js';

export const orientacaoRepository = {
  /** Orientadores ativos do NUCOMP, com orientandos atuais e limite do curso (UC07). */
  async listarOrientadores(db: Db, areaId?: number) {
    const { rows } = await db.query(
      `SELECT u.id, u.nome, u.email, c.sigla AS curso, c.limite_orientandos AS limite,
              (SELECT count(*) FROM tcc t WHERE t.orientador_id = u.id AND t.situacao = ANY($2))::int AS orientandos,
              COALESCE((SELECT json_agg(a.nome ORDER BY a.nome) FROM professor_area pa
                        JOIN area_conhecimento a ON a.id = pa.area_id WHERE pa.professor_id = u.id), '[]') AS areas
       FROM usuario u JOIN curso c ON c.id = u.curso_id
       WHERE u.perfil = 'ORIENTADOR' AND u.ativo AND NOT u.externo
         AND ($1::bigint IS NULL OR EXISTS (SELECT 1 FROM professor_area pa WHERE pa.professor_id = u.id AND pa.area_id = $1))
       ORDER BY u.nome`,
      [areaId ?? null, SITUACOES_ATIVAS],
    );
    return rows.map((r) => ({ ...r, disponivel: r.orientandos < r.limite }));
  },

  /** Busca o professor travando a linha, para que dois aceites simultâneos não ultrapassem o limite. */
  async buscarProfessorComCarga(db: Db, professorId: number) {
    const { rows } = await db.query(
      `SELECT u.id, u.nome, u.perfil, u.ativo, u.externo, c.limite_orientandos AS limite
       FROM usuario u LEFT JOIN curso c ON c.id = u.curso_id WHERE u.id = $1 FOR UPDATE OF u`,
      [professorId],
    );
    if (!rows[0]) return undefined;
    const { rows: qtd } = await db.query(
      'SELECT count(*)::int AS total FROM tcc WHERE orientador_id = $1 AND situacao = ANY($2)',
      [professorId, SITUACOES_ATIVAS],
    );
    return { ...rows[0], orientandos: qtd[0].total as number };
  },

  // ---------- Solicitações de orientação ----------
  async existeSolicitacaoPendente(db: Db, tccId: number) {
    const { rows } = await db.query("SELECT 1 FROM solicitacao_orientacao WHERE tcc_id = $1 AND status = 'PENDENTE'", [tccId]);
    return rows.length > 0;
  },
  async inserirSolicitacao(db: Db, tccId: number, professorId: number) {
    const { rows } = await db.query(
      'INSERT INTO solicitacao_orientacao (tcc_id, professor_id) VALUES ($1, $2) RETURNING *',
      [tccId, professorId],
    );
    return rows[0];
  },
  async buscarSolicitacao(db: Db, id: number) {
    const { rows } = await db.query('SELECT * FROM solicitacao_orientacao WHERE id = $1 FOR UPDATE', [id]);
    return rows[0];
  },
  async responderSolicitacao(db: Db, id: number, status: 'ACEITA' | 'RECUSADA', justificativa: string | null) {
    const { rows } = await db.query(
      'UPDATE solicitacao_orientacao SET status = $2, justificativa = $3, respondido_em = now() WHERE id = $1 RETURNING *',
      [id, status, justificativa],
    );
    return rows[0];
  },
  async solicitacoesDoProfessor(db: Db, professorId: number) {
    const { rows } = await db.query(
      `SELECT s.id, s.status, s.criado_em, t.id AS tcc_id, t.titulo, t.resumo, u.nome AS aluno, a.nome AS area
       FROM solicitacao_orientacao s JOIN tcc t ON t.id = s.tcc_id
       JOIN usuario u ON u.id = t.aluno_id JOIN area_conhecimento a ON a.id = t.area_id
       WHERE s.professor_id = $1 ORDER BY s.status = 'PENDENTE' DESC, s.criado_em DESC`,
      [professorId],
    );
    return rows;
  },

  // ---------- Vínculos (histórico de orientadores – RD14) ----------
  async iniciarVinculo(db: Db, tccId: number, professorId: number, papel: 'ORIENTADOR' | 'COORIENTADOR') {
    await db.query('INSERT INTO vinculo_orientacao (tcc_id, professor_id, papel) VALUES ($1, $2, $3)', [tccId, professorId, papel]);
  },
  async encerrarVinculos(db: Db, tccId: number, papel?: 'ORIENTADOR' | 'COORIENTADOR') {
    await db.query(
      'UPDATE vinculo_orientacao SET fim = now() WHERE tcc_id = $1 AND fim IS NULL AND ($2::papel_vinculo IS NULL OR papel = $2)',
      [tccId, papel ?? null],
    );
  },

  // ---------- Reuniões e encontros (RF33, RF16) ----------
  /** Compromissos do orientador a menos de 1 hora do horário pedido (UC09 A2). */
  async conflitosDeAgenda(db: Db, orientadorId: number, dataHora: Date) {
    const { rows } = await db.query(
      `SELECT r.data_hora FROM reuniao r JOIN tcc t ON t.id = r.tcc_id
       WHERE r.tipo = 'ALINHAMENTO' AND t.orientador_id = $1
         AND r.data_hora > $2::timestamptz - interval '1 hour' AND r.data_hora < $2::timestamptz + interval '1 hour'`,
      [orientadorId, dataHora],
    );
    return rows;
  },
  async inserirReuniao(db: Db, r: { tccId: number; tipo: 'ALINHAMENTO' | 'ENCONTRO'; dataHora: Date; localOuLink: string | null; resumo: string | null; criadoPor: number }) {
    const { rows } = await db.query(
      `INSERT INTO reuniao (tcc_id, tipo, data_hora, local_ou_link, resumo, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [r.tccId, r.tipo, r.dataHora, r.localOuLink, r.resumo, r.criadoPor],
    );
    return rows[0];
  },

  // ---------- Troca de orientador (RF34) ----------
  async existeTrocaPendente(db: Db, tccId: number) {
    const { rows } = await db.query("SELECT 1 FROM solicitacao_troca WHERE tcc_id = $1 AND status = 'PENDENTE'", [tccId]);
    return rows.length > 0;
  },
  async inserirTroca(db: Db, t: { tccId: number; atualId: number; novoId: number; motivo: string }) {
    const { rows } = await db.query(
      `INSERT INTO solicitacao_troca (tcc_id, orientador_atual_id, novo_orientador_id, motivo)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [t.tccId, t.atualId, t.novoId, t.motivo],
    );
    return rows[0];
  },
  async buscarTroca(db: Db, id: number) {
    const { rows } = await db.query('SELECT * FROM solicitacao_troca WHERE id = $1 FOR UPDATE', [id]);
    return rows[0];
  },
  async decidirTroca(db: Db, id: number, status: 'APROVADA' | 'RECUSADA', justificativa: string | null, decididoPor: number) {
    const { rows } = await db.query(
      `UPDATE solicitacao_troca SET status = $2, justificativa_decisao = $3, decidido_por = $4, decidido_em = now()
       WHERE id = $1 RETURNING *`,
      [id, status, justificativa, decididoPor],
    );
    return rows[0];
  },

  // ---------- Desistência (RF35) ----------
  async existeDesistenciaPendente(db: Db, tccId: number) {
    const { rows } = await db.query("SELECT 1 FROM pedido_desistencia WHERE tcc_id = $1 AND status = 'PENDENTE'", [tccId]);
    return rows.length > 0;
  },
  async inserirDesistencia(db: Db, tccId: number, motivo: string) {
    const { rows } = await db.query('INSERT INTO pedido_desistencia (tcc_id, motivo) VALUES ($1, $2) RETURNING *', [tccId, motivo]);
    return rows[0];
  },
  async buscarDesistencia(db: Db, id: number) {
    const { rows } = await db.query('SELECT * FROM pedido_desistencia WHERE id = $1 FOR UPDATE', [id]);
    return rows[0];
  },
  async decidirDesistencia(db: Db, id: number, status: 'APROVADA' | 'RECUSADA', decididoPor: number) {
    const { rows } = await db.query(
      'UPDATE pedido_desistencia SET status = $2, decidido_por = $3, decidido_em = now() WHERE id = $1 RETURNING *',
      [id, status, decididoPor],
    );
    return rows[0];
  },
};
