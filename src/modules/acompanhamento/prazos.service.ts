import { pool, type Db } from '../../shared/db.js';
import { registrarEvento } from '../../shared/auditoria.js';
import { notificar } from '../../shared/notificacao.js';
import { dataHoraBR, diaEmManaus, semestreDe } from '../../shared/util.js';
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
      OR (t.situacao IN ('APROVADO', 'APROVADO_PUBLICACAO') AND c.etapa = 'ENTREGA_DEFINITIVA'
          AND t.prazo_correcoes IS NULL))   -- com correções pedidas pela banca, vale o prazo da banca
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

/** TCCs aprovados com correções que ainda não tiveram a entrega definitiva aprovada pelo orientador. */
const SQL_CORRECOES = `
  SELECT t.id AS tcc_id, t.aluno_id, t.orientador_id, t.titulo, t.prazo_correcoes, t.correcoes_alerta,
         (t.prazo_correcoes - $1::date) AS dias
  FROM tcc t
  WHERE t.correcoes_pendentes AND t.prazo_correcoes IS NOT NULL AND ($2::bigint IS NULL OR t.id = $2)`;

interface LinhaCorrecao {
  tcc_id: number; aluno_id: number; orientador_id: number | null; titulo: string; prazo_correcoes: string;
  correcoes_alerta: string | null; dias: number;
}

/** Recalcula a marca "atrasado" de um TCC (ou de todos) a partir das entregas pendentes. */
export async function recalcularAtraso(db: Db, hoje = diaEmManaus(), tccId: number | null = null) {
  const { rows } = await db.query(SQL_PRAZOS, [hoje, semestreDe(hoje), tccId]);
  const { rows: correcoes } = await db.query(SQL_CORRECOES, [hoje, tccId]);
  const atrasados = new Set((rows as LinhaPrazo[]).filter((l) => !l.entregue && l.dias < 0).map((l) => Number(l.tcc_id)));
  for (const c of correcoes as LinhaCorrecao[]) if (c.dias < 0) atrasados.add(Number(c.tcc_id)); // correções fora do prazo
  if (tccId !== null) {
    await db.query('UPDATE tcc SET atrasado = $2 WHERE id = $1 AND atrasado <> $2', [tccId, atrasados.has(tccId)]);
  }
  return { linhas: rows as LinhaPrazo[], atrasados, correcoes: correcoes as LinhaCorrecao[] };
}

/** Avisa aluno e banca 24 horas antes de cada defesa (uma única vez por banca). */
async function lembrarDefesas() {
  const { rows } = await pool.query(
    `UPDATE banca SET lembrete_enviado_em = now()
     WHERE status = 'AGENDADA' AND lembrete_enviado_em IS NULL
       AND data_hora > now() AND data_hora <= now() + interval '24 hours'
     RETURNING id, tcc_id, data_hora, local_ou_link`,
  );
  for (const b of rows) {
    const { rows: [tcc] } = await pool.query('SELECT titulo, aluno_id FROM tcc WHERE id = $1', [b.tcc_id]);
    const { rows: membros } = await pool.query('SELECT usuario_id FROM banca_membro WHERE banca_id = $1', [b.id]);
    const quando = `${dataHoraBR(b.data_hora)}, ${b.local_ou_link}`;
    await notificar(pool, Number(tcc.aluno_id), 'Lembrete: sua defesa é amanhã', `Sua defesa está marcada para ${quando}. Boa sorte!`);
    for (const m of membros) {
      await notificar(pool, Number(m.usuario_id), 'Lembrete: defesa amanhã', `Defesa do TCC "${tcc.titulo}" em ${quando}.`);
    }
  }
  return rows.length;
}

/**
 * RF14 – alertas automáticos e TCC atrasado. Roda uma vez por hora (server.ts) e pode ser
 * disparado pela coordenação. Cada alerta é enviado uma única vez por etapa.
 */
export async function verificarPrazos(hoje = diaEmManaus()) {
  const { linhas, atrasados, correcoes } = await recalcularAtraso(pool, hoje);
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
  // Correções pedidas pela banca: aviso 3 dias antes e quando o prazo passa
  for (const c of correcoes) {
    const prazo = br(c.prazo_correcoes);
    const linha = { aluno_id: c.aluno_id, orientador_id: c.orientador_id, titulo: c.titulo } as LinhaPrazo;
    if (c.dias < 0 && c.correcoes_alerta !== 'ATRASO') {
      await pool.query("UPDATE tcc SET correcoes_alerta = 'ATRASO' WHERE id = $1", [c.tcc_id]);
      novosAtrasos += 1;
      await avisar(pool, linha, 'Prazo das correções terminou', `O prazo para entregar o TCC corrigido terminou em ${prazo}. O TCC foi marcado como atrasado.`);
      await registrarEvento(pool, Number(c.tcc_id), 'PRAZO_PERDIDO', `Entrega das correções pedidas pela banca não feita até ${prazo}`, null);
    } else if (c.dias >= 0 && c.dias <= 3 && !c.correcoes_alerta) {
      await pool.query("UPDATE tcc SET correcoes_alerta = '3_DIAS' WHERE id = $1", [c.tcc_id]);
      alertas += 1;
      await avisar(pool, linha, 'Prazo das correções está acabando', `Envie a entrega definitiva com as correções pedidas pela banca até ${prazo}.`);
    }
  }
  const lembretesDefesa = await lembrarDefesas();
  const { rows } = await pool.query(
    `UPDATE tcc SET atrasado = (id = ANY($1)) WHERE atrasado <> (id = ANY($1)) RETURNING id`, [[...atrasados]],
  );
  return { alertas, novosAtrasos, lembretesDefesa, tccsAtrasados: atrasados.size, alterados: rows.length };
}

/** Prazos de um TCC para mostrar na tela do aluno: todas as etapas do calendário com a situação de cada uma. */
export async function prazosDoTcc(tcc: { id: number; curso_id: number }, hoje = diaEmManaus()) {
  const semestre = semestreDe(hoje);
  const [{ rows: etapas }, { linhas, correcoes }] = await Promise.all([
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
    /** Aprovado com correções: prazo dado pela banca para a entrega definitiva corrigida. */
    correcoes: correcoes[0] ? { prazo: correcoes[0].prazo_correcoes, dias: correcoes[0].dias } : null,
  };
}
