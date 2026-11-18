import { pool } from '../../shared/db.js';
import type { UsuarioLogadoLike } from '../../shared/util.js';

/** Relatórios da coordenação: só números do próprio curso. Notas aparecem só como média, nunca ligadas a nomes. */
export const relatoriosService = {
  async doCurso(coordenacao: UsuarioLogadoLike) {
    const curso = coordenacao.cursoId;
    const [porSituacao, porOrientador, defesas, porSemestre, atrasados] = await Promise.all([
      pool.query('SELECT situacao, count(*)::int AS total FROM tcc WHERE curso_id = $1 GROUP BY situacao ORDER BY situacao', [curso]),
      pool.query(
        `SELECT u.nome AS orientador,
                count(*) FILTER (WHERE t.situacao IN ('EM_PROPOSTA', 'EM_DESENVOLVIMENTO', 'APTO_DEFESA'))::int AS em_andamento,
                count(*) FILTER (WHERE t.situacao IN ('APROVADO', 'APROVADO_PUBLICACAO'))::int AS aprovados,
                count(*) FILTER (WHERE t.atrasado)::int AS atrasados,
                count(*)::int AS total
         FROM tcc t JOIN usuario u ON u.id = t.orientador_id
         WHERE t.curso_id = $1 GROUP BY u.nome ORDER BY em_andamento DESC, u.nome`,
        [curso],
      ),
      pool.query(
        `SELECT count(*)::int AS realizadas,
                count(*) FILTER (WHERE r.resultado = 'APROVADO')::int AS aprovados,
                count(*) FILTER (WHERE r.resultado = 'APROVADO_COM_CORRECOES')::int AS aprovados_com_correcoes,
                count(*) FILTER (WHERE r.resultado = 'REPROVADO')::int AS reprovados,
                round(avg(r.nota_final), 2)::float AS media_notas
         FROM resultado_defesa r JOIN banca b ON b.id = r.banca_id JOIN tcc t ON t.id = b.tcc_id WHERE t.curso_id = $1`,
        [curso],
      ),
      pool.query(
        `SELECT to_char(b.data_hora AT TIME ZONE 'America/Manaus', 'YYYY') || '.' ||
                CASE WHEN extract(month FROM b.data_hora AT TIME ZONE 'America/Manaus') <= 6 THEN '1' ELSE '2' END AS semestre,
                count(*)::int AS defesas,
                count(*) FILTER (WHERE r.resultado <> 'REPROVADO')::int AS aprovados,
                round(avg(r.nota_final), 2)::float AS media_notas
         FROM resultado_defesa r JOIN banca b ON b.id = r.banca_id JOIN tcc t ON t.id = b.tcc_id
         WHERE t.curso_id = $1 GROUP BY 1 ORDER BY 1 DESC`,
        [curso],
      ),
      pool.query('SELECT count(*)::int AS total FROM tcc WHERE curso_id = $1 AND atrasado', [curso]),
    ]);
    return {
      porSituacao: porSituacao.rows,
      porOrientador: porOrientador.rows,
      defesas: defesas.rows[0],
      porSemestre: porSemestre.rows,
      atrasados: atrasados.rows[0].total,
    };
  },

  /**
   * E-mails da simulação (o sistema ainda não envia e-mail de verdade). A coordenação vê só os
   * que foram para pessoas do próprio curso e para membros externos; o administrador vê todos.
   */
  async emails(coordenacao: UsuarioLogadoLike) {
    const { rows } = await pool.query(
      `SELECT e.id, e.para, e.assunto, e.texto, e.enviado_em, u.nome
       FROM email_enviado e JOIN usuario u ON lower(u.email) = lower(e.para)
       WHERE $1::bigint IS NULL OR u.curso_id = $1 OR (u.externo AND u.curso_id IS NULL)
       ORDER BY e.enviado_em DESC, e.id DESC LIMIT 300`,
      [coordenacao.cursoId],
    );
    return rows;
  },
};
