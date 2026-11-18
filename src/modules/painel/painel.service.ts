import { pool } from '../../shared/db.js';
import { ErroNegocio } from '../../shared/errors.js';
import { A4_DEITADO, cortar, DocumentoPdf } from '../../shared/pdf.js';
import { gerarPlanilha } from '../../shared/planilha.js';
import { dataHoraBR, diaEmManaus, NOME_SITUACAO, semestreDe, SITUACOES_ATIVAS, type UsuarioLogadoLike } from '../../shared/util.js';
import { NOME_ETAPA } from '../calendario/calendario.service.js';
import { recalcularAtraso } from '../acompanhamento/prazos.service.js';

export const SITUACOES = Object.keys(NOME_SITUACAO);

/** Semestre de um TCC pela data da proposta (RN01 do UC22): jan–jun = 1, jul–dez = 2. */
const SQL_SEMESTRE = `(to_char(t.criado_em AT TIME ZONE 'America/Manaus', 'YYYY') || '.' ||
  CASE WHEN extract(month FROM t.criado_em AT TIME ZONE 'America/Manaus') <= 6 THEN '1' ELSE '2' END)`;

/** Busca sem diferenciar maiúsculas, minúsculas e acentos (RN01 do UC23). */
const semAcento = (expr: string) => `translate(lower(${expr}), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')`;
const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export interface FiltrosBusca {
  aluno?: string; orientador?: string; semestre?: string; situacao?: string; areaId?: number; pagina?: number;
}

/** Monta o WHERE da busca. A coordenação só vê os TCCs do próprio curso. */
function montarFiltros(cursoId: number | null, f: FiltrosBusca) {
  const cond = ['t.curso_id = $1'];
  const valores: unknown[] = [cursoId];
  const add = (sql: (n: number) => string, v: unknown) => { valores.push(v); cond.push(sql(valores.length)); };
  if (f.aluno?.trim()) add((n) => `${semAcento('al.nome')} LIKE '%' || $${n} || '%'`, normalizar(f.aluno));
  if (f.orientador?.trim()) add((n) => `${semAcento("coalesce(o.nome, '')")} LIKE '%' || $${n} || '%'`, normalizar(f.orientador));
  if (f.semestre) add((n) => `${SQL_SEMESTRE} = $${n}`, f.semestre);
  if (f.situacao === 'ATRASADO') cond.push('t.atrasado');
  else if (f.situacao) add((n) => `t.situacao = $${n}::situacao_tcc`, f.situacao);
  if (f.areaId) add((n) => `t.area_id = $${n}`, f.areaId);
  return { where: cond.join(' AND '), valores };
}

const SQL_BUSCA = (where: string) => `
  FROM tcc t JOIN usuario al ON al.id = t.aluno_id LEFT JOIN usuario o ON o.id = t.orientador_id
  JOIN curso c ON c.id = t.curso_id JOIN area_conhecimento a ON a.id = t.area_id
  WHERE ${where}`;

const COLUNAS_BUSCA = `t.id, t.titulo, t.situacao, t.justificativa_situacao, t.atrasado, al.nome AS aluno, al.matricula,
  o.nome AS orientador, c.nome AS curso, a.nome AS area, ${SQL_SEMESTRE} AS semestre,
  (SELECT json_build_object('id', b.id, 'dataHora', b.data_hora, 'status', b.status) FROM banca b
   WHERE b.tcc_id = t.id ORDER BY b.criado_em DESC LIMIT 1) AS banca`;

export const POR_PAGINA_BUSCA = 20;
const LIMITE_EXPORTACAO = 5000;

/** Texto dos filtros usados, para o cabeçalho do arquivo exportado (RN03 do UC23). */
async function descreverFiltros(f: FiltrosBusca) {
  const partes: string[] = [];
  if (f.aluno?.trim()) partes.push(`aluno contém "${f.aluno.trim()}"`);
  if (f.orientador?.trim()) partes.push(`orientador contém "${f.orientador.trim()}"`);
  if (f.semestre) partes.push(`semestre ${f.semestre}`);
  if (f.situacao) partes.push(`situação ${f.situacao === 'ATRASADO' ? 'somente atrasados' : NOME_SITUACAO[f.situacao]}`);
  if (f.areaId) {
    const { rows } = await pool.query('SELECT nome FROM area_conhecimento WHERE id = $1', [f.areaId]);
    if (rows[0]) partes.push(`área ${rows[0].nome}`);
  }
  return partes.length ? partes.join('; ') : 'nenhum (todos os TCCs do curso)';
}

export const painelService = {
  /** UC22 – painel de governança da coordenação. */
  async painel(coordenacao: UsuarioLogadoLike, f: { semestre?: string; areaId?: number; situacao?: string }) {
    const hoje = diaEmManaus();
    const semestreAtual = semestreDe(hoje);
    // RN01: abre no semestre atual; "todos" mostra todos os semestres
    const semestre = f.semestre === 'todos' ? undefined : (f.semestre || semestreAtual);
    const { where, valores } = montarFiltros(coordenacao.cursoId, { semestre, situacao: f.situacao, areaId: f.areaId });

    const [curso, semestres, porSituacao, tccsAtrasados, professores, atraso] = await Promise.all([
      pool.query('SELECT id, nome, sigla FROM curso WHERE id = $1', [coordenacao.cursoId]),
      pool.query(`SELECT DISTINCT ${SQL_SEMESTRE} AS s FROM tcc t WHERE t.curso_id = $1 ORDER BY 1 DESC`, [coordenacao.cursoId]),
      pool.query(`SELECT t.situacao, count(*)::int AS total ${SQL_BUSCA(where)} GROUP BY t.situacao`, valores),
      pool.query(`SELECT t.id, t.titulo, al.nome AS aluno, o.nome AS orientador, t.situacao ${SQL_BUSCA(where + ' AND t.atrasado')} ORDER BY t.titulo`, valores),
      // RF23: carga de cada professor do NUCOMP. Orientandos no curso e no total (o limite vale para o total).
      pool.query(
        `SELECT u.id, u.nome,
                (SELECT count(*) FROM tcc t WHERE t.orientador_id = u.id AND t.situacao = ANY($2) AND t.curso_id = $1)::int AS no_curso,
                (SELECT count(*) FROM tcc t WHERE t.orientador_id = u.id AND t.situacao = ANY($2))::int AS total,
                (SELECT valor FROM regra_nucleo WHERE chave = 'limite_orientandos') AS limite,
                (SELECT count(*) FROM banca_membro bm JOIN banca b ON b.id = bm.banca_id
                 WHERE bm.usuario_id = u.id AND b.status <> 'CANCELADA'
                   AND ($3::text IS NULL OR (to_char(b.data_hora AT TIME ZONE 'America/Manaus', 'YYYY') || '.' ||
                        CASE WHEN extract(month FROM b.data_hora AT TIME ZONE 'America/Manaus') <= 6 THEN '1' ELSE '2' END) = $3))::int AS bancas
         FROM usuario u
         WHERE u.perfil IN ('ORIENTADOR', 'COORDENACAO') AND u.ativo AND NOT u.externo
         ORDER BY total DESC, u.nome`,
        [coordenacao.cursoId, SITUACOES_ATIVAS, semestre ?? null],
      ),
      recalcularAtraso(pool, hoje),
    ]);

    // RF22 / RN03: etapa vencida e dias de atraso (contados da data-limite até hoje)
    const atrasos = new Map<number, { etapa: string; dataLimite: string; dias: number }>();
    for (const l of atraso.linhas) {
      if (l.entregue || l.dias >= 0) continue;
      const atual = atrasos.get(Number(l.tcc_id));
      if (!atual || -l.dias > atual.dias) atrasos.set(Number(l.tcc_id), { etapa: NOME_ETAPA[l.etapa], dataLimite: l.data_limite, dias: -l.dias });
    }
    for (const c of atraso.correcoes) {
      if (c.dias >= 0) continue;
      const atual = atrasos.get(Number(c.tcc_id));
      if (!atual || -c.dias > atual.dias) atrasos.set(Number(c.tcc_id), { etapa: 'Correções pedidas pela banca', dataLimite: c.prazo_correcoes, dias: -c.dias });
    }

    const totais = Object.fromEntries(SITUACOES.map((s) => [s, 0]));
    for (const r of porSituacao.rows) totais[r.situacao] = r.total;
    const lista = semestres.rows.map((r) => r.s as string);
    if (!lista.includes(semestreAtual)) lista.unshift(semestreAtual);

    return {
      curso: curso.rows[0],
      filtros: { semestre: semestre ?? 'todos', areaId: f.areaId ?? null, situacao: f.situacao ?? null },
      semestres: lista.sort().reverse(),
      porSituacao: totais,
      total: Object.values(totais).reduce((s, n) => s + n, 0),
      atrasados: tccsAtrasados.rows.map((t) => ({ ...t, ...(atrasos.get(Number(t.id)) ?? { etapa: null, dataLimite: null, dias: null }) }))
        .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0)),
      professores: professores.rows,
    };
  },

  /** UC23 – busca de TCCs do curso, 20 por página, ordenada pelo título. */
  async buscar(coordenacao: UsuarioLogadoLike, f: FiltrosBusca) {
    const { where, valores } = montarFiltros(coordenacao.cursoId, f);
    const pagina = Math.max(1, f.pagina ?? 1);
    const [{ rows: [{ total }] }, { rows }, semestres] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total ${SQL_BUSCA(where)}`, valores),
      pool.query(`SELECT ${COLUNAS_BUSCA} ${SQL_BUSCA(where)} ORDER BY lower(t.titulo), t.id LIMIT ${POR_PAGINA_BUSCA} OFFSET ${(pagina - 1) * POR_PAGINA_BUSCA}`, valores),
      pool.query(`SELECT DISTINCT ${SQL_SEMESTRE} AS s FROM tcc t WHERE t.curso_id = $1 ORDER BY 1 DESC`, [coordenacao.cursoId]),
    ]);
    // a matrícula só sai na exportação (RN04 do UC23)
    return { total, pagina, porPagina: POR_PAGINA_BUSCA, semestres: semestres.rows.map((r) => r.s), itens: rows.map(({ matricula: _m, ...t }) => t) };
  },

  /** UC23 / FA01 – exporta TODOS os TCCs do resultado (não só a página) em planilha ou PDF. */
  async exportar(coordenacao: UsuarioLogadoLike, f: FiltrosBusca, formato: 'xlsx' | 'pdf') {
    const { where, valores } = montarFiltros(coordenacao.cursoId, f);
    const { rows } = await pool.query(
      `SELECT ${COLUNAS_BUSCA} ${SQL_BUSCA(where)} ORDER BY lower(t.titulo), t.id LIMIT ${LIMITE_EXPORTACAO + 1}`, valores);
    if (!rows.length) throw new ErroNegocio(422, 'Nenhum TCC encontrado para os filtros escolhidos');
    if (rows.length > LIMITE_EXPORTACAO) throw new ErroNegocio(422, 'O resultado tem mais de 5.000 TCCs. Use filtros mais específicos para exportar');

    const [{ rows: [quem] }, { rows: [curso] }, filtros] = await Promise.all([
      pool.query('SELECT nome FROM usuario WHERE id = $1', [coordenacao.id]),
      pool.query('SELECT nome FROM curso WHERE id = $1', [coordenacao.cursoId]),
      descreverFiltros(f),
    ]);
    const gerado = `Gerado em ${dataHoraBR(new Date())} por ${quem.nome}`;
    const cabecalho = ['Título', 'Aluno(a)', 'Matrícula', 'Orientador(a)', 'Curso', 'Área', 'Semestre', 'Situação', 'Atrasado'];
    const linhas = rows.map((t) => [t.titulo, t.aluno, t.matricula, t.orientador ?? 'Sem orientador', t.curso, t.area, t.semestre,
      NOME_SITUACAO[t.situacao], t.atrasado ? 'Sim' : 'Não']);
    const data = diaEmManaus();

    if (formato === 'xlsx') {
      return {
        nome: `tccs-${data}.xlsx`,
        tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        arquivo: gerarPlanilha({
          aba: 'TCCs', cabecalho, linhas, larguras: [50, 28, 14, 28, 28, 24, 10, 22, 10],
          informacoes: [`SAG-TCC – TCCs do curso de ${curso.nome}`, `Filtros: ${filtros}`, gerado, `Total: ${rows.length} TCC(s)`],
        }),
      };
    }

    // PDF em A4 deitado, com as mesmas colunas da tela
    const pdf = new DocumentoPdf(A4_DEITADO.largura, A4_DEITADO.altura);
    const m = 36; const larguraUtil = A4_DEITADO.largura - 2 * m;
    const pesos = [34, 16, 8, 16, 0, 13, 6, 14, 7]; // o curso é o mesmo em todas as linhas: vai no título
    const cols = cabecalho.map((t, i) => ({ t, w: (pesos[i] / pesos.reduce((s, p) => s + p, 0)) * larguraUtil })).filter((c) => c.w > 0);
    const idx = cabecalho.map((_, i) => i).filter((i) => pesos[i] > 0);
    let y = 0;
    const topo = (primeira: boolean) => {
      y = m;
      if (primeira) {
        pdf.retangulo(0, 0, A4_DEITADO.largura, 6, '#008349');
        pdf.texto(m, y, 'SAG-TCC – TCCs do curso', { tamanho: 16, negrito: true, cor: '#006638' }); y += 22;
        pdf.texto(m, y, `Curso: ${curso.nome}`, { tamanho: 10 }); y += 14;
        pdf.texto(m, y, cortar(`Filtros: ${filtros}`, larguraUtil, 10), { tamanho: 10 }); y += 14;
        pdf.texto(m, y, `${gerado} · Total: ${rows.length} TCC(s)`, { tamanho: 10, cor: '#5b6470' }); y += 22;
      }
      pdf.retangulo(m, y - 4, larguraUtil, 18, '#e6f4ec');
      let x = m;
      cols.forEach((c) => { pdf.texto(x + 3, y, cortar(c.t, c.w - 6, 8.5, true), { tamanho: 8.5, negrito: true, cor: '#0b5a33' }); x += c.w; });
      y += 18;
    };
    topo(true);
    for (const l of linhas) {
      if (y > A4_DEITADO.altura - m - 20) {
        pdf.novaPagina(); topo(false);
      }
      let x = m;
      idx.forEach((i, k) => { pdf.texto(x + 3, y, cortar(String(l[i] ?? ''), cols[k].w - 6, 8.5), { tamanho: 8.5 }); x += cols[k].w; });
      y += 15;
      pdf.linha(m, y - 4, m + larguraUtil, y - 4);
    }
    return { nome: `tccs-${data}.pdf`, tipo: 'application/pdf', arquivo: pdf.gerar() };
  },
};

// ------------------------------------------------------------------ UC24 – auditoria

export const POR_PAGINA_AUDITORIA = 50;

/** Campos que nunca aparecem na consulta (RN03 do UC24): senhas, tokens e códigos de acesso. */
const CAMPO_SENSIVEL = /senha|token|hash|link_acesso|segredo/i;

function limparValor(v: unknown): unknown {
  if (v == null || typeof v !== 'object') return typeof v === 'string' && v.length > 600 ? v.slice(0, 600) + '…' : v;
  if (Array.isArray(v)) return v.map(limparValor);
  return Object.fromEntries(Object.entries(v as Record<string, unknown>)
    .filter(([k]) => !CAMPO_SENSIVEL.test(k))
    .map(([k, x]) => [k, limparValor(x)]));
}

export interface FiltrosAuditoria {
  de?: string; ate?: string; usuarioId?: number; tabela?: string; operacao?: string; registroId?: number; pagina?: number;
}

/** Nome legível do registro alterado (ex.: o título do TCC), para a lista ficar fácil de ler. */
const SQL_DESCRICAO = `CASE a.tabela
    WHEN 'tcc' THEN (SELECT titulo FROM tcc WHERE id = a.registro_id)
    WHEN 'usuario' THEN (SELECT nome FROM usuario WHERE id = a.registro_id)
    WHEN 'curso' THEN (SELECT nome FROM curso WHERE id = a.registro_id)
    WHEN 'area_conhecimento' THEN (SELECT nome FROM area_conhecimento WHERE id = a.registro_id)
    WHEN 'banca' THEN (SELECT t.titulo FROM banca b JOIN tcc t ON t.id = b.tcc_id WHERE b.id = a.registro_id)
    ELSE NULL END`;

export const auditoriaService = {
  async consultar(f: FiltrosAuditoria) {
    const hoje = diaEmManaus();
    const seteDias = new Date(Date.now() - 7 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });
    const de = f.de || seteDias;
    const ate = f.ate || hoje;
    if (de > ate) throw new ErroNegocio(422, 'A data inicial não pode ser posterior à data final');

    const cond = [`(a.criado_em AT TIME ZONE 'America/Manaus')::date BETWEEN $1 AND $2`];
    const valores: unknown[] = [de, ate];
    const add = (sql: (n: number) => string, v: unknown) => { valores.push(v); cond.push(sql(valores.length)); };
    if (f.usuarioId) add((n) => `a.usuario_id = $${n}`, f.usuarioId);
    if (f.tabela) add((n) => `a.tabela = $${n}`, f.tabela);
    if (f.operacao) add((n) => `a.operacao = $${n}::operacao_auditoria`, f.operacao);
    if (f.registroId) add((n) => `a.registro_id = $${n}`, f.registroId);
    const where = cond.join(' AND ');
    const pagina = Math.max(1, f.pagina ?? 1);

    const [{ rows: [{ total }] }, { rows }] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total FROM auditoria a WHERE ${where}`, valores),
      pool.query(
        `SELECT a.id, a.criado_em, a.tabela, a.registro_id, a.operacao, u.nome AS usuario, ${SQL_DESCRICAO} AS descricao
         FROM auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id
         WHERE ${where} ORDER BY a.criado_em DESC, a.id DESC
         LIMIT ${POR_PAGINA_AUDITORIA} OFFSET ${(pagina - 1) * POR_PAGINA_AUDITORIA}`,
        valores,
      ),
    ]);
    return { de, ate, total, pagina, porPagina: POR_PAGINA_AUDITORIA, itens: rows };
  },

  /** Opções dos filtros: quem já fez alterações e quais tabelas aparecem no log. */
  async opcoes() {
    const [usuarios, tabelas] = await Promise.all([
      pool.query('SELECT DISTINCT u.id, u.nome FROM auditoria a JOIN usuario u ON u.id = a.usuario_id ORDER BY u.nome'),
      pool.query('SELECT DISTINCT tabela FROM auditoria ORDER BY tabela'),
    ]);
    return { usuarios: usuarios.rows, tabelas: tabelas.rows.map((r) => r.tabela) };
  },

  /** FA01 – detalhe de um registro, com o valor anterior e o novo (sem campos sensíveis). */
  async detalhe(id: number) {
    const { rows } = await pool.query(
      `SELECT a.*, u.nome AS usuario, ${SQL_DESCRICAO} AS descricao FROM auditoria a LEFT JOIN usuario u ON u.id = a.usuario_id WHERE a.id = $1`,
      [id],
    );
    if (!rows[0]) throw new ErroNegocio(404, 'Registro de auditoria não encontrado');
    const r = rows[0];
    return { ...r, valor_anterior: limparValor(r.valor_anterior), valor_novo: limparValor(r.valor_novo), usuario_id: undefined };
  },
};
