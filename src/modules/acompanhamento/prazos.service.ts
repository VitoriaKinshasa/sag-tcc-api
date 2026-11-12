import { pool, type Db } from '../../shared/db.js';
import { registrarEvento } from '../../shared/auditoria.js';
import { notificar } from '../../shared/notificacao.js';
import { diaEmManaus, semestreDe } from '../../shared/util.js';
import { NOME_ETAPA, type Etapa } from '../calendario/calendario.service.js';

/**
 * Etapas que exigem entrega de arquivo e para quais situações do TCC elas valem:
 * Qualificação e Versão final para TCC em andamento; Entrega definitiva depois da aprovação.
 * Uma etapa só conta se o TCC já existia na data-limite dela.
 */
const SQL_PRAZOS = `
  SELECT t.id AS tcc_id, t.aluno_id, t.orientador_id, t.titulo, t.atrasado,
         c.etapa, c.semestre, c.data_inicio, c.data_limite, (c.data_limite - $1::date) AS dias,
         EXISTS (SELECT 1 FROM versao_tcc v WHERE v.tcc_id = t.id AND v.etapa = c.etapa) AS entregue
  FROM tcc t
  JOIN calendario_etapa c ON c.curso_id = t.curso_id AND c.semestre = $2
  WHERE ($3::bigint IS NULL OR t.id = $3)
    AND ((t.situacao IN ('EM_DESENVOLVIMENTO', 'APTO_DEFESA') AND c.etapa IN ('QUALIFICACAO', 'VERSAO_FINAL'))
      OR (t.situacao IN ('APROVADO', 'APROVADO_PUBLICACAO') AND c.etapa = 'ENTREGA_DEFINITIVA'))
    AND (t.criado_em AT TIME ZONE 'America/Manaus')::date <= c.data_limite
  ORDER BY t.id, c.etapa`;

interface LinhaPrazo {
  tcc_id: number; aluno_id: number; orientador_id: number | null; titulo: string; atrasado: boolean;
  etapa: Etapa; semestre: string; data_limite: string; dias: number; entregue: boolean;
}

const br = (d: string) => d.split('-').reverse().join('/');

/** Grava o alerta; devolve false se ele já tinha sido enviado antes. */
async function marcarAlerta(db: Db, l: LinhaPrazo, tipo: '7_DIAS' | '1_DIA' | 'ATRASO') {
  const { rowCount } = await db.query(
    'INSERT INTO alerta_prazo (tcc_id, etapa, semestre, tipo) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
    [l.tcc_id, l.etapa, l.semestre, tipo],
  );
  return rowCount === 1;
}

async function avisar(db: Db, l: LinhaPrazo, titulo: string, mensagem: string) {
  await notificar(db, Number(l.aluno_id), titulo, mensagem);
  if (l.orientador_id) await notificar(db, Number(l.orientador_id), titulo, `TCC "${l.titulo}": ${mensagem}`);
}

/** Recalcula a marca "atrasado" de um TCC (ou de todos) a partir das entregas pendentes. */
export async function recalcularAtraso(db: Db, hoje = diaEmManaus(), tccId: number | null = null) {
  const { rows } = await db.query(SQL_PRAZOS, [hoje, semestreDe(hoje), tccId]);
  const atrasados = new Set((rows as LinhaPrazo[]).filter((l) => !l.entregue && l.dias < 0).map((l) => Number(l.tcc_id)));
  if (tccId !== null) {
    await db.query('UPDATE tcc SET atrasado = $2 WHERE id = $1 AND atrasado <> $2', [tccId, atrasados.has(tccId)]);
  }
  return { linhas: rows as LinhaPrazo[], atrasados };
}

/**
 * RF14 – alertas automáticos e TCC atrasado. Roda uma vez por hora (server.ts) e pode ser
 * disparado pela coordenação. Cada alerta é enviado uma única vez por etapa.
 */
export async function verificarPrazos(hoje = diaEmManaus()) {
  const { linhas, atrasados } = await recalcularAtraso(pool, hoje);
  let alertas = 0;
  let novosAtrasos = 0;
  for (const l of linhas) {
    if (l.entregue) continue;
    const etapa = NOME_ETAPA[l.etapa];
    if (l.dias < 0) {
      if (await marcarAlerta(pool, l, 'ATRASO')) {
        novosAtrasos += 1;
        await avisar(pool, l, 'Prazo perdido', `A entrega da etapa ${etapa} terminou em ${br(l.data_limite)} e não foi feita. O TCC foi marcado como atrasado.`);
        await registrarEvento(pool, Number(l.tcc_id), 'PRAZO_PERDIDO', `Entrega da etapa ${etapa} não feita até ${br(l.data_limite)}`, null);
      }
    } else if (l.dias <= 1) {
      if (await marcarAlerta(pool, l, '1_DIA')) {
        alertas += 1;
        await avisar(pool, l, `Prazo da etapa ${etapa} termina ${l.dias === 0 ? 'hoje' : 'amanhã'}`,
          `Envie a versão da etapa ${etapa} até ${br(l.data_limite)}.`);
      }
    } else if (l.dias <= 7) {
      if (await marcarAlerta(pool, l, '7_DIAS')) {
        alertas += 1;
        await avisar(pool, l, `Faltam ${l.dias} dias para a etapa ${etapa}`, `Envie a versão da etapa ${etapa} até ${br(l.data_limite)}.`);
      }
    }
  }
  const { rows } = await pool.query(
    `UPDATE tcc SET atrasado = (id = ANY($1)) WHERE atrasado <> (id = ANY($1)) RETURNING id`, [[...atrasados]],
  );
  return { alertas, novosAtrasos, tccsAtrasados: atrasados.size, alterados: rows.length };
}

/** Prazos de um TCC para mostrar na tela do aluno: todas as etapas do calendário com a situação de cada uma. */
export async function prazosDoTcc(tcc: { id: number; curso_id: number }, hoje = diaEmManaus()) {
  const semestre = semestreDe(hoje);
  const [{ rows: etapas }, { linhas }] = await Promise.all([
    pool.query('SELECT etapa, data_inicio, data_limite FROM calendario_etapa WHERE curso_id = $1 AND semestre = $2 ORDER BY etapa', [tcc.curso_id, semestre]),
    recalcularAtraso(pool, hoje, Number(tcc.id)),
  ]);
  return {
    semestre,
    etapas: etapas.map((e) => {
      const l = linhas.find((x) => x.etapa === e.etapa);
      const situacao = !l ? 'NAO_SE_APLICA' : l.entregue ? 'ENTREGUE' : l.dias < 0 ? 'ATRASADA' : 'PENDENTE';
      return { etapa: e.etapa, dataInicio: e.data_inicio, dataLimite: e.data_limite, exigeEntrega: !!l, situacao, dias: l?.dias ?? null };
    }),
  };
}
