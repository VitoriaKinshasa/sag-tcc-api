import { pool, transacao } from '../../shared/db.js';
import { registrarAuditoria, registrarEvento } from '../../shared/auditoria.js';
import { ErroNegocio, naoEncontrado, proibido } from '../../shared/errors.js';
import { IaIndisponivel, iaConfigurada, LIMITE_SECAO, SECOES_BANNER, sugerirTextosBanner, type DadosPublicosTcc, type TextosBanner } from '../../shared/ia.js';
import { notificar } from '../../shared/notificacao.js';
import { A1_EM_PE, DocumentoPdf } from '../../shared/pdf.js';
import { diaEmManaus, type UsuarioLogadoLike } from '../../shared/util.js';

const APROVADOS = ['APROVADO', 'APROVADO_PUBLICACAO'];

/** Nas páginas públicas, tira as marcas "(aluno)", "(aluna)" usadas nos nomes de exemplo. */
const SQL_NOME = (col: string) => `regexp_replace(${col}, '\\s*\\((aluno|aluna|membro externo)\\)$', '')`;
const semAcento = (expr: string) => `translate(lower(${expr}), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')`;
const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Ano do TCC no acervo (O01 do UC26): o ano da aprovação na banca; para TCC aprovado por publicação,
 * o ano da publicação aceita.
 */
const SQL_ANO = `COALESCE(
  CASE WHEN t.situacao = 'APROVADO_PUBLICACAO' THEN
    (SELECT p.ano FROM pedido_publicacao p WHERE p.tcc_id = t.id AND p.status = 'APROVADA' ORDER BY p.decidido_em DESC LIMIT 1) END,
  (SELECT extract(year FROM r.registrado_em AT TIME ZONE 'America/Manaus')::int FROM resultado_defesa r
     JOIN banca b ON b.id = r.banca_id WHERE b.tcc_id = t.id ORDER BY r.registrado_em DESC LIMIT 1),
  extract(year FROM t.concluido_em AT TIME ZONE 'America/Manaus')::int,
  extract(year FROM t.atualizado_em AT TIME ZONE 'America/Manaus')::int)`;

/** Versão definitiva mais recente (é ela que pode ser baixada no acervo). */
const SQL_DEFINITIVA = `(SELECT v.id FROM versao_tcc v WHERE v.tcc_id = t.id AND v.etapa = 'ENTREGA_DEFINITIVA' ORDER BY v.numero DESC LIMIT 1)`;

export const POR_PAGINA_ACERVO = 20;

// ------------------------------------------------------------------ UC26 – acervo público

export const acervoService = {
  async filtros() {
    const [areas, cursos, anos] = await Promise.all([
      pool.query(`SELECT DISTINCT a.id, a.nome FROM tcc t JOIN area_conhecimento a ON a.id = t.area_id WHERE t.situacao = ANY($1) ORDER BY a.nome`, [APROVADOS]),
      pool.query(`SELECT DISTINCT c.id, c.nome FROM tcc t JOIN curso c ON c.id = t.curso_id WHERE t.situacao = ANY($1) ORDER BY c.nome`, [APROVADOS]),
      pool.query(`SELECT DISTINCT ${SQL_ANO} AS ano FROM tcc t WHERE t.situacao = ANY($1) ORDER BY 1 DESC`, [APROVADOS]),
    ]);
    return { areas: areas.rows, cursos: cursos.rows, anos: anos.rows.map((r) => r.ano) };
  },

  /** Busca no acervo: só TCCs aprovados (RN01), só nomes (RN02), 20 por página, do mais recente ao mais antigo. */
  async pesquisar(f: { q?: string; areaId?: number; cursoId?: number; ano?: number; pagina?: number }) {
    const cond = ['t.situacao = ANY($1)'];
    const valores: unknown[] = [APROVADOS];
    const add = (sql: (n: number) => string, v: unknown) => { valores.push(v); cond.push(sql(valores.length)); };
    if (f.q?.trim()) {
      add((n) => `(${semAcento('t.titulo')} LIKE '%' || $${n} || '%' OR ${semAcento('al.nome')} LIKE '%' || $${n} || '%'
        OR ${semAcento("coalesce(o.nome, '')")} LIKE '%' || $${n} || '%')`, normalizar(f.q));
    }
    if (f.areaId) add((n) => `t.area_id = $${n}`, f.areaId);
    if (f.cursoId) add((n) => `t.curso_id = $${n}`, f.cursoId);
    if (f.ano) add((n) => `${SQL_ANO} = $${n}`, f.ano);
    const where = cond.join(' AND ');
    const de = `FROM tcc t JOIN usuario al ON al.id = t.aluno_id LEFT JOIN usuario o ON o.id = t.orientador_id
                JOIN curso c ON c.id = t.curso_id JOIN area_conhecimento a ON a.id = t.area_id WHERE ${where}`;
    const pagina = Math.max(1, f.pagina ?? 1);
    const [{ rows: [{ total }] }, { rows }] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total ${de}`, valores),
      pool.query(
        `SELECT t.id, t.titulo, t.subtitulo, ${SQL_NOME('al.nome')} AS autor, ${SQL_NOME('o.nome')} AS orientador,
                a.nome AS area, c.nome AS curso, ${SQL_ANO} AS ano, t.visibilidade,
                (t.visibilidade = 'TEXTO_COMPLETO' AND ${SQL_DEFINITIVA} IS NOT NULL) AS tem_pdf
         ${de} ORDER BY ano DESC, lower(t.titulo) LIMIT ${POR_PAGINA_ACERVO} OFFSET ${(pagina - 1) * POR_PAGINA_ACERVO}`,
        valores,
      ),
    ]);
    return { total, pagina, porPagina: POR_PAGINA_ACERVO, itens: rows };
  },

  /** Detalhe público. Se não for aprovado, responde como se não existisse (E02, RD12). */
  async detalhe(id: number) {
    const { rows } = await pool.query(
      `SELECT t.id, t.titulo, t.subtitulo, t.resumo, t.situacao, t.visibilidade,
              ${SQL_NOME('al.nome')} AS autor, ${SQL_NOME('o.nome')} AS orientador, ${SQL_NOME('co.nome')} AS coorientador,
              a.nome AS area, c.nome AS curso, ${SQL_ANO} AS ano,
              (t.visibilidade = 'TEXTO_COMPLETO' AND ${SQL_DEFINITIVA} IS NOT NULL) AS tem_pdf,
              (SELECT json_build_object('titulo', p.titulo_artigo, 'veiculo', p.veiculo, 'ano', p.ano, 'link', p.link)
                 FROM pedido_publicacao p WHERE p.tcc_id = t.id AND p.status = 'APROVADA' ORDER BY p.decidido_em DESC LIMIT 1) AS publicacao
       FROM tcc t JOIN usuario al ON al.id = t.aluno_id LEFT JOIN usuario o ON o.id = t.orientador_id
       LEFT JOIN usuario co ON co.id = t.coorientador_id
       JOIN curso c ON c.id = t.curso_id JOIN area_conhecimento a ON a.id = t.area_id
       WHERE t.id = $1 AND t.situacao = ANY($2)`,
      [id, APROVADOS],
    );
    if (!rows[0]) throw new ErroNegocio(404, 'TCC não disponível para consulta pública', 'RD12');
    return rows[0];
  },

  /** PDF da versão definitiva: só com visibilidade "Texto completo" (RN03, RF28). */
  async pdf(id: number) {
    const { rows } = await pool.query(
      `SELECT t.visibilidade, v.arquivo, v.arquivo_nome FROM tcc t
       LEFT JOIN versao_tcc v ON v.id = ${SQL_DEFINITIVA}
       WHERE t.id = $1 AND t.situacao = ANY($2)`,
      [id, APROVADOS],
    );
    const r = rows[0];
    if (!r) throw new ErroNegocio(404, 'TCC não disponível para consulta pública', 'RD12');
    if (r.visibilidade !== 'TEXTO_COMPLETO') throw new ErroNegocio(403, 'Os autores optaram por divulgar apenas os dados deste trabalho', 'RF28');
    if (!r.arquivo) throw new ErroNegocio(404, 'O texto completo deste TCC ainda não foi entregue');
    return { arquivo: r.arquivo as Buffer, nome: r.arquivo_nome as string };
  },
};

// ------------------------------------------------------------------ UC27 – visibilidade

export const NOME_VISIBILIDADE: Record<string, string> = { TEXTO_COMPLETO: 'Texto completo', SOMENTE_METADADOS: 'Somente metadados' };

export const visibilidadeService = {
  async aprovadosDoOrientador(professorId: number) {
    const { rows } = await pool.query(
      `SELECT t.id, t.titulo, t.situacao, t.visibilidade, u.nome AS aluno, c.sigla AS curso, ${SQL_ANO} AS ano
       FROM tcc t JOIN usuario u ON u.id = t.aluno_id JOIN curso c ON c.id = t.curso_id
       WHERE t.orientador_id = $1 AND t.situacao = ANY($2) ORDER BY ano DESC, u.nome`,
      [professorId, APROVADOS],
    );
    return rows;
  },

  async alterar(usuario: UsuarioLogadoLike, tccId: number, dados: { visibilidade: 'TEXTO_COMPLETO' | 'SOMENTE_METADADOS'; declaracao?: boolean }) {
    return transacao(async (db) => {
      const { rows } = await db.query('SELECT id, titulo, aluno_id, orientador_id, visibilidade, situacao FROM tcc WHERE id = $1 FOR UPDATE', [tccId]);
      const tcc = rows[0];
      if (!tcc) throw naoEncontrado('TCC');
      const ehAluno = Number(tcc.aluno_id) === usuario.id;
      const ehOrientador = tcc.orientador_id != null && Number(tcc.orientador_id) === usuario.id;
      if (!ehAluno && !ehOrientador) throw proibido(); // RN01
      if (dados.visibilidade === 'TEXTO_COMPLETO' && !dados.declaracao) {
        throw new ErroNegocio(422, 'Marque a declaração para liberar o texto completo', 'RN03');
      }
      if (tcc.visibilidade === dados.visibilidade) return { mensagem: 'Visibilidade atualizada', visibilidade: tcc.visibilidade };

      await db.query('UPDATE tcc SET visibilidade = $2 WHERE id = $1', [tccId, dados.visibilidade]);
      const { rows: [autor] } = await db.query('SELECT nome FROM usuario WHERE id = $1', [usuario.id]);
      const nova = NOME_VISIBILIDADE[dados.visibilidade];
      await registrarEvento(db, tccId, 'VISIBILIDADE_ALTERADA', `Visibilidade no acervo público alterada para "${nova}" por ${autor.nome}`, usuario.id);
      await registrarAuditoria(db, {
        usuarioId: usuario.id, tabela: 'tcc', registroId: tccId, operacao: 'UPDATE',
        anterior: { visibilidade: tcc.visibilidade },
        novo: { visibilidade: dados.visibilidade, ...(dados.visibilidade === 'TEXTO_COMPLETO' ? { declaracao_sem_dados_sigilosos: true } : {}) },
      });
      // RN04: a outra parte é avisada
      const outro = ehAluno ? tcc.orientador_id : tcc.aluno_id;
      if (outro) {
        await notificar(db, Number(outro), 'Visibilidade do TCC alterada',
          `${autor.nome} alterou a visibilidade do TCC "${tcc.titulo}" no acervo público para "${nova}". Se não concordar, você também pode alterar.`);
      }
      return {
        mensagem: 'Visibilidade atualizada',
        visibilidade: dados.visibilidade,
        valeAgora: APROVADOS.includes(tcc.situacao), // FA01: antes da aprovação, a escolha fica guardada
      };
    });
  },
};

// ------------------------------------------------------------------ UC25 – banner

export const LIMITE_SUGESTOES_DIA = 5;

async function tccDoAlunoAprovado(usuario: UsuarioLogadoLike, tccId: number) {
  const { rows } = await pool.query(
    `SELECT t.id, t.titulo, t.subtitulo, t.resumo, t.situacao, t.aluno_id,
            ${SQL_NOME('al.nome')} AS aluno, ${SQL_NOME('o.nome')} AS orientador, ${SQL_NOME('co.nome')} AS coorientador,
            a.nome AS area, c.nome AS curso, ${SQL_ANO} AS ano
     FROM tcc t JOIN usuario al ON al.id = t.aluno_id LEFT JOIN usuario o ON o.id = t.orientador_id
     LEFT JOIN usuario co ON co.id = t.coorientador_id
     JOIN curso c ON c.id = t.curso_id JOIN area_conhecimento a ON a.id = t.area_id WHERE t.id = $1`,
    [tccId],
  );
  const tcc = rows[0];
  if (!tcc) throw naoEncontrado('TCC');
  if (Number(tcc.aluno_id) !== usuario.id) throw proibido();
  if (!APROVADOS.includes(tcc.situacao)) throw new ErroNegocio(422, 'O banner só pode ser gerado para TCC aprovado', 'RD12'); // E01
  return tcc;
}

async function sugestoesHoje(usuarioId: number) {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM banner_sugestao
     WHERE usuario_id = $1 AND sucesso AND (criado_em AT TIME ZONE 'America/Manaus')::date = $2`,
    [usuarioId, diaEmManaus()],
  );
  return rows[0].n as number;
}

/** Textos originais do TCC, usados quando a IA não está disponível (E03.P2). */
const textosOriginais = (tcc: { titulo: string; resumo: string }): TextosBanner => ({
  titulo: tcc.titulo, introducao: tcc.resumo.slice(0, LIMITE_SECAO), objetivo: '', metodologia: '', resultados: '', conclusao: '',
});

const ehPng = (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const ehJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8;
const LIMITE_IMAGEM = 8 * 1024 * 1024;

export const bannerService = {
  /** Dados para a tela do banner: dados públicos do TCC, limite do dia e o último banner gerado. */
  async situacao(usuario: UsuarioLogadoLike, tccId: number) {
    const tcc = await tccDoAlunoAprovado(usuario, tccId);
    const [usadas, ultimo] = await Promise.all([
      sugestoesHoje(usuario.id),
      pool.query('SELECT id, conteudo, gerado_em FROM banner_tcc WHERE tcc_id = $1 ORDER BY gerado_em DESC LIMIT 1', [tccId]),
    ]);
    const { aluno_id: _a, situacao: _s, ...dados } = tcc;
    return { dados, usadasHoje: usadas, limite: LIMITE_SUGESTOES_DIA, iaConfigurada: iaConfigurada(), ultimo: ultimo.rows[0] ?? null };
  },

  /** P2 a P4 / FA01 – pede a sugestão à IA, respeitando o limite de 5 por dia (RN03). */
  async sugerir(usuario: UsuarioLogadoLike, tccId: number) {
    const tcc = await tccDoAlunoAprovado(usuario, tccId);
    if (!iaConfigurada()) {
      return { origem: 'MANUAL' as const, aviso: 'Não foi possível gerar a sugestão agora. Você pode preencher o banner manualmente', textos: textosOriginais(tcc), usadasHoje: 0 };
    }
    const usadas = await sugestoesHoje(usuario.id);
    if (usadas >= LIMITE_SUGESTOES_DIA) {
      throw new ErroNegocio(429, 'Você atingiu o limite de 5 gerações hoje. Tente novamente amanhã', 'RN03'); // E02
    }
    const dados: DadosPublicosTcc = {
      titulo: tcc.titulo, subtitulo: tcc.subtitulo, resumo: tcc.resumo, area: tcc.area, curso: tcc.curso,
      aluno: tcc.aluno, orientador: tcc.orientador, ano: tcc.ano,
    };
    try {
      const textos = await sugerirTextosBanner(dados);
      await pool.query('INSERT INTO banner_sugestao (tcc_id, usuario_id, sucesso) VALUES ($1, $2, TRUE)', [tccId, usuario.id]);
      return { origem: 'IA' as const, textos, usadasHoje: usadas + 1 };
    } catch (erro) {
      if (!(erro instanceof IaIndisponivel)) throw erro;
      console.warn('[banner] IA indisponível:', erro.message);
      await pool.query('INSERT INTO banner_sugestao (tcc_id, usuario_id, sucesso) VALUES ($1, $2, FALSE)', [tccId, usuario.id]);
      return { origem: 'MANUAL' as const, aviso: 'Não foi possível gerar a sugestão agora. Você pode preencher o banner manualmente', textos: textosOriginais(tcc), usadasHoje: usadas };
    }
  },

  /** P7 e P8 – grava o banner revisado: a imagem PNG (feita na tela) e o PDF tamanho A1 para impressão. */
  async gerar(usuario: UsuarioLogadoLike, tccId: number, dados: { conteudo: TextosBanner; png: string; jpeg: string; largura: number; altura: number }) {
    await tccDoAlunoAprovado(usuario, tccId);
    const png = Buffer.from(dados.png.replace(/^data:[^,]*,/, ''), 'base64');
    const jpeg = Buffer.from(dados.jpeg.replace(/^data:[^,]*,/, ''), 'base64');
    if (!ehPng(png) || !ehJpeg(jpeg)) throw new ErroNegocio(422, 'A imagem do banner não é válida');
    if (png.length > LIMITE_IMAGEM || jpeg.length > LIMITE_IMAGEM) throw new ErroNegocio(422, 'A imagem do banner ficou grande demais');
    const conteudo = Object.fromEntries(SECOES_BANNER.map((s) => [s, String(dados.conteudo[s] ?? '').trim().slice(0, LIMITE_SECAO)]));
    if (!conteudo.titulo) throw new ErroNegocio(422, 'Informe o título do banner');

    const pdf = new DocumentoPdf(A1_EM_PE.largura, A1_EM_PE.altura);
    pdf.imagem(jpeg, { largura: dados.largura, altura: dados.altura }, 0, 0, A1_EM_PE.largura, A1_EM_PE.altura);

    return transacao(async (db) => {
      const { rows } = await db.query(
        'INSERT INTO banner_tcc (tcc_id, conteudo, arquivo_pdf, arquivo_png, gerado_por) VALUES ($1, $2, $3, $4, $5) RETURNING id, gerado_em',
        [tccId, JSON.stringify(conteudo), pdf.gerar(), png, usuario.id],
      );
      await registrarEvento(db, tccId, 'BANNER_GERADO', 'Banner do TCC gerado', usuario.id);
      return { ...rows[0], mensagem: 'Banner gerado. Use os botões para baixar' };
    });
  },

  async arquivo(usuario: UsuarioLogadoLike, tccId: number, bannerId: number, tipo: 'pdf' | 'png') {
    const { rows } = await pool.query(
      `SELECT b.arquivo_pdf, b.arquivo_png, t.aluno_id, t.orientador_id FROM banner_tcc b JOIN tcc t ON t.id = b.tcc_id
       WHERE b.id = $1 AND b.tcc_id = $2`,
      [bannerId, tccId],
    );
    const r = rows[0];
    if (!r) throw naoEncontrado('Banner');
    if (![Number(r.aluno_id), Number(r.orientador_id)].includes(usuario.id)) throw proibido();
    return tipo === 'pdf' ? r.arquivo_pdf as Buffer : r.arquivo_png as Buffer;
  },
};
