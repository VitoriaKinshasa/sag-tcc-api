import type { Db } from '../../shared/db.js';
import { notificar } from '../../shared/notificacao.js';
import { dataHoraBR } from '../../shared/util.js';

export type Papel = 'PRESIDENTE' | 'TITULAR' | 'SUPLENTE';
export interface Banca { id: number; tcc_id: number; data_hora: Date; local_ou_link: string; status: string; criado_por: number }
export interface Membro { usuario_id: number; papel: Papel; nome: string; email: string }

/** Campos que as telas usam para mostrar uma banca. */
const DETALHE = `
  SELECT b.id, b.tcc_id, b.data_hora, b.local_ou_link, b.status,
         t.titulo, t.subtitulo, t.situacao, t.curso_id, c.sigla AS curso, c.nome AS curso_nome, al.id AS aluno_id, al.nome AS aluno,
         (SELECT json_agg(json_build_object('usuarioId', m.usuario_id, 'nome', u.nome, 'papel', m.papel,
                 'externo', u.externo, 'instituicao', u.instituicao, 'notaRegistrada', n.membro_id IS NOT NULL)
                 ORDER BY m.papel, u.nome)
          FROM banca_membro m JOIN usuario u ON u.id = m.usuario_id
          LEFT JOIN nota_banca n ON n.banca_id = m.banca_id AND n.membro_id = m.usuario_id
          WHERE m.banca_id = b.id) AS membros,
         r.resultado, r.nota_final, r.observacao, r.ata_url, r.registrado_em AS resultado_em
  FROM banca b JOIN tcc t ON t.id = b.tcc_id JOIN curso c ON c.id = t.curso_id
  JOIN usuario al ON al.id = t.aluno_id
  LEFT JOIN resultado_defesa r ON r.banca_id = b.id`;

export const bancasRepository = {
  async buscarPorId(db: Db, id: number, travar = false): Promise<Banca | undefined> {
    const { rows } = await db.query(`SELECT * FROM banca WHERE id = $1 ${travar ? 'FOR UPDATE' : ''}`, [id]);
    return rows[0];
  },
  async detalhe(db: Db, id: number) {
    const { rows } = await db.query(`${DETALHE} WHERE b.id = $1`, [id]);
    return rows[0];
  },
  async membros(db: Db, bancaId: number): Promise<Membro[]> {
    const { rows } = await db.query(
      `SELECT m.usuario_id, m.papel, u.nome, u.email FROM banca_membro m JOIN usuario u ON u.id = m.usuario_id
       WHERE m.banca_id = $1 ORDER BY m.papel, u.nome`,
      [bancaId],
    );
    return rows;
  },
  async agendadaDoTcc(db: Db, tccId: number): Promise<Banca | undefined> {
    const { rows } = await db.query("SELECT * FROM banca WHERE tcc_id = $1 AND status = 'AGENDADA'", [tccId]);
    return rows[0];
  },

  /** Bancas em que o usuário participa (como membro ou como aluno); a coordenação vê as do seu curso. */
  async doUsuario(db: Db, usuario: { id: number; perfil: string; cursoId: number | null }) {
    const filtro = usuario.perfil === 'COORDENACAO'
      ? 't.curso_id = $2::bigint'
      : '(EXISTS (SELECT 1 FROM banca_membro x WHERE x.banca_id = b.id AND x.usuario_id = $1) OR t.aluno_id = $1) AND $2::bigint IS NOT DISTINCT FROM $2';
    const { rows } = await db.query(
      `SELECT * FROM (${DETALHE} WHERE ${filtro}) d
       ORDER BY d.status = 'AGENDADA' DESC, CASE WHEN d.status = 'AGENDADA' THEN d.data_hora END, d.data_hora DESC`,
      [usuario.id, usuario.cursoId],
    );
    return rows.map((r) => ({ ...r, meuPapel: r.membros?.find((m: { usuarioId: number }) => m.usuarioId === usuario.id)?.papel ?? null }));
  },

  /** Professores e membros externos que podem compor bancas. */
  async membrosDisponiveis(db: Db) {
    const { rows } = await db.query(
      `SELECT id, nome, perfil, externo, instituicao, titulacao FROM usuario
       WHERE perfil IN ('ORIENTADOR', 'MEMBRO_BANCA') AND ativo ORDER BY externo, nome`,
    );
    return rows;
  },
  async usuariosAtivos(db: Db, ids: number[]) {
    const { rows } = await db.query('SELECT id, nome, perfil, ativo FROM usuario WHERE id = ANY($1)', [ids]);
    return rows as { id: number; nome: string; perfil: string; ativo: boolean }[];
  },

  /**
   * Conflitos de agenda: outra banca agendada a menos de 2 horas, no mesmo local
   * ou com algum dos mesmos membros.
   */
  async conflitos(db: Db, dataHora: Date, local: string, membros: number[], ignorarBancaId: number | null) {
    const { rows } = await db.query(
      `SELECT b.id, b.data_hora, b.local_ou_link,
              lower(trim(b.local_ou_link)) = lower(trim($2)) AS mesmo_local,
              (SELECT string_agg(u.nome, ', ') FROM banca_membro m JOIN usuario u ON u.id = m.usuario_id
               WHERE m.banca_id = b.id AND m.usuario_id = ANY($3)) AS membros_em_comum
       FROM banca b
       WHERE b.status = 'AGENDADA' AND b.id IS DISTINCT FROM $4
         AND b.data_hora > $1::timestamptz - interval '2 hours' AND b.data_hora < $1::timestamptz + interval '2 hours'`,
      [dataHora, local, membros, ignorarBancaId],
    );
    return rows.filter((r) => r.mesmo_local || r.membros_em_comum);
  },

  async inserir(db: Db, b: { tccId: number; dataHora: Date; localOuLink: string; criadoPor: number }): Promise<Banca> {
    const { rows } = await db.query(
      'INSERT INTO banca (tcc_id, data_hora, local_ou_link, criado_por) VALUES ($1, $2, $3, $4) RETURNING *',
      [b.tccId, b.dataHora, b.localOuLink, b.criadoPor],
    );
    return rows[0];
  },
  async inserirMembro(db: Db, bancaId: number, usuarioId: number, papel: Papel) {
    await db.query('INSERT INTO banca_membro (banca_id, usuario_id, papel) VALUES ($1, $2, $3)', [bancaId, usuarioId, papel]);
  },
  async remarcar(db: Db, id: number, dataHora: Date, localOuLink: string): Promise<Banca> {
    const { rows } = await db.query(
      'UPDATE banca SET data_hora = $2, local_ou_link = $3 WHERE id = $1 RETURNING *', [id, dataHora, localOuLink],
    );
    return rows[0];
  },
  async mudarStatus(db: Db, id: number, status: 'REALIZADA' | 'CANCELADA') {
    await db.query('UPDATE banca SET status = $2 WHERE id = $1', [id, status]);
  },

  async notas(db: Db, bancaId: number) {
    const { rows } = await db.query(
      `SELECT n.membro_id, u.nome, m.papel, n.nota, n.parecer, n.registrado_em
       FROM nota_banca n JOIN banca_membro m ON m.banca_id = n.banca_id AND m.usuario_id = n.membro_id
       JOIN usuario u ON u.id = n.membro_id WHERE n.banca_id = $1 ORDER BY m.papel, u.nome`,
      [bancaId],
    );
    return rows as { membro_id: number; nome: string; papel: Papel; nota: number; parecer: string | null }[];
  },
  async inserirNota(db: Db, bancaId: number, membroId: number, nota: number, parecer: string | null) {
    const { rows } = await db.query(
      'INSERT INTO nota_banca (banca_id, membro_id, nota, parecer) VALUES ($1, $2, $3, $4) RETURNING *',
      [bancaId, membroId, nota, parecer],
    );
    return rows[0];
  },
  async inserirResultado(db: Db, r: { bancaId: number; resultado: string; notaFinal: number; observacao: string | null; ataUrl: string | null; registradoPor: number }) {
    const { rows } = await db.query(
      `INSERT INTO resultado_defesa (banca_id, resultado, nota_final, observacao, ata_url, registrado_por)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [r.bancaId, r.resultado, r.notaFinal, r.observacao, r.ataUrl, r.registradoPor],
    );
    return rows[0];
  },

  /** UC21 – agenda pública: defesas agendadas a partir de agora (só nomes, sem e-mails). */
  async agendaPublica(db: Db, filtros: { cursoId?: number; mes?: string }) {
    const { rows } = await db.query(
      `SELECT b.id, b.data_hora, b.local_ou_link, t.titulo, t.subtitulo, al.nome AS aluno, c.sigla AS curso, ar.nome AS area,
              (SELECT json_agg(json_build_object('nome', u.nome, 'papel', m.papel, 'instituicao', CASE WHEN u.externo THEN u.instituicao END)
                      ORDER BY m.papel, u.nome)
               FROM banca_membro m JOIN usuario u ON u.id = m.usuario_id WHERE m.banca_id = b.id) AS membros
       FROM banca b JOIN tcc t ON t.id = b.tcc_id JOIN usuario al ON al.id = t.aluno_id
       JOIN curso c ON c.id = t.curso_id JOIN area_conhecimento ar ON ar.id = t.area_id
       WHERE b.status = 'AGENDADA' AND b.data_hora >= now()
         AND ($1::bigint IS NULL OR t.curso_id = $1)
         AND ($2::text IS NULL OR to_char(b.data_hora AT TIME ZONE 'America/Manaus', 'YYYY-MM') = $2)
       ORDER BY b.data_hora`,
      [filtros.cursoId ?? null, filtros.mes ?? null],
    );
    return rows;
  },

  /** Usado pelo UC17: quando o TCC deixa de estar apto à defesa, a banca agendada é cancelada e os membros avisados. */
  async cancelarAgendadas(db: Db, tccId: number, motivo: string) {
    const { rows } = await db.query(
      "UPDATE banca SET status = 'CANCELADA' WHERE tcc_id = $1 AND status = 'AGENDADA' RETURNING id, data_hora",
      [tccId],
    );
    for (const b of rows) {
      for (const m of await this.membros(db, Number(b.id))) {
        await notificar(db, Number(m.usuario_id), 'Banca cancelada',
          `A banca marcada para ${dataHoraBR(b.data_hora)} foi cancelada. Motivo: ${motivo}`);
      }
    }
    return rows.length;
  },
};
