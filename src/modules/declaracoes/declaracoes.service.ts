import { pool, transacao } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado, proibido } from '../../shared/errors.js';
import { registrarAuditoria, registrarEvento } from '../../shared/auditoria.js';
import { gerarCodigo, normalizarCodigo } from '../../shared/documentos.js';
import type { UsuarioLogadoLike } from '../../shared/util.js';
import { bancasService } from '../bancas/bancas.service.js';

export type TipoDeclaracao = 'PARTICIPACAO_BANCA' | 'ORIENTACAO' | 'FOLHA_APROVACAO';

const UEA = 'Universidade do Estado do Amazonas';

/**
 * Quais declarações cada pessoa pode emitir:
 * - Participação em banca: presidente e titulares de uma defesa já realizada.
 * - Orientação: orientador ou coorientador de um TCC concluído (entrega definitiva aprovada ou aprovado por publicação).
 * - Folha de aprovação: o aluno, depois de aprovado pela banca (vai dentro do texto final do TCC).
 */
const SQL_DISPONIVEIS = `
  SELECT 'PARTICIPACAO_BANCA' AS tipo, t.id AS tcc_id, b.id AS banca_id, t.titulo, al.nome AS aluno, b.data_hora AS data, m.papel::text AS papel
  FROM banca b JOIN banca_membro m ON m.banca_id = b.id JOIN tcc t ON t.id = b.tcc_id JOIN usuario al ON al.id = t.aluno_id
  WHERE m.usuario_id = $1 AND b.status = 'REALIZADA' AND m.papel IN ('PRESIDENTE', 'TITULAR')
  UNION ALL
  SELECT DISTINCT ON (t.id) 'ORIENTACAO', t.id, NULL::bigint, t.titulo, al.nome, COALESCE(t.concluido_em, t.atualizado_em), v.papel::text
  FROM vinculo_orientacao v JOIN tcc t ON t.id = v.tcc_id JOIN usuario al ON al.id = t.aluno_id
  WHERE v.professor_id = $1 AND (t.concluido_em IS NOT NULL OR t.situacao = 'APROVADO_PUBLICACAO')
  UNION ALL
  SELECT 'FOLHA_APROVACAO', t.id, b.id, t.titulo, al.nome, b.data_hora, NULL
  FROM tcc t JOIN usuario al ON al.id = t.aluno_id JOIN banca b ON b.tcc_id = t.id AND b.status = 'REALIZADA'
  JOIN resultado_defesa r ON r.banca_id = b.id AND r.resultado <> 'REPROVADO'
  WHERE t.aluno_id = $1`;

interface Disponivel { tipo: TipoDeclaracao; tcc_id: number; banca_id: number | null; titulo: string; aluno: string; data: Date; papel: string | null }

async function disponiveis(usuarioId: number): Promise<Disponivel[]> {
  const { rows } = await pool.query(SQL_DISPONIVEIS, [usuarioId]);
  return rows;
}

/** Monta o conteúdo da declaração. Ele fica guardado: a declaração não muda depois de emitida. */
async function montarDados(usuarioId: number, d: Disponivel) {
  const { rows: [pessoa] } = await pool.query('SELECT nome, titulacao, externo, instituicao, matricula FROM usuario WHERE id = $1', [usuarioId]);
  const { rows: [tcc] } = await pool.query(
    `SELECT t.titulo, t.subtitulo, t.situacao, t.concluido_em, al.nome AS aluno, al.matricula, c.nome AS curso
     FROM tcc t JOIN usuario al ON al.id = t.aluno_id JOIN curso c ON c.id = t.curso_id WHERE t.id = $1`,
    [d.tcc_id],
  );
  const base = { titulo: tcc.titulo, subtitulo: tcc.subtitulo, aluno: tcc.aluno, curso: tcc.curso };

  if (d.tipo === 'ORIENTACAO') {
    const { rows: [periodo] } = await pool.query(
      'SELECT min(inicio) AS inicio, max(COALESCE(fim, now())) AS fim FROM vinculo_orientacao WHERE tcc_id = $1 AND professor_id = $2',
      [d.tcc_id, usuarioId],
    );
    return {
      ...base, pessoa: pessoa.nome, titulacao: pessoa.titulacao, instituicao: pessoa.externo ? pessoa.instituicao : UEA,
      papel: d.papel === 'COORIENTADOR' ? 'Coorientador(a)' : 'Orientador(a)',
      inicio: periodo.inicio, fim: periodo.fim,
      conclusao: tcc.situacao === 'APROVADO_PUBLICACAO' ? 'Aprovado por publicação de artigo' : 'Aprovado em defesa pública',
    };
  }

  const { rows: [banca] } = await pool.query(
    `SELECT b.data_hora, b.local_ou_link, r.resultado FROM banca b JOIN resultado_defesa r ON r.banca_id = b.id WHERE b.id = $1`,
    [d.banca_id],
  );
  const { rows: membros } = await pool.query(
    `SELECT u.nome, u.titulacao, m.papel, CASE WHEN u.externo THEN u.instituicao ELSE $2 END AS instituicao
     FROM banca_membro m JOIN usuario u ON u.id = m.usuario_id
     WHERE m.banca_id = $1 AND m.papel IN ('PRESIDENTE', 'TITULAR') ORDER BY m.papel, u.nome`,
    [d.banca_id, UEA],
  );
  const resultado = banca.resultado === 'APROVADO_COM_CORRECOES' ? 'Aprovado com correções' : banca.resultado === 'APROVADO' ? 'Aprovado' : 'Reprovado';

  if (d.tipo === 'PARTICIPACAO_BANCA') {
    return {
      ...base, pessoa: pessoa.nome, titulacao: pessoa.titulacao, instituicao: pessoa.externo ? pessoa.instituicao : UEA,
      papel: d.papel === 'PRESIDENTE' ? 'Presidente (orientador)' : 'Membro titular',
      dataHora: banca.data_hora, local: banca.local_ou_link,
    };
  }
  // Folha de aprovação
  return { ...base, matricula: tcc.matricula, dataHora: banca.data_hora, resultado, membros };
}

export const declaracoesService = {
  /** Declarações que o usuário pode emitir, indicando as que já foram emitidas (com o código). */
  async disponiveis(usuario: UsuarioLogadoLike) {
    const lista = await disponiveis(usuario.id);
    const { rows: emitidas } = await pool.query('SELECT codigo, tipo, tcc_id, emitida_em FROM declaracao WHERE usuario_id = $1', [usuario.id]);
    return lista.map((d) => {
      const e = emitidas.find((x) => x.tipo === d.tipo && Number(x.tcc_id) === Number(d.tcc_id));
      return { ...d, codigo: e?.codigo ?? null, emitidaEm: e?.emitida_em ?? null };
    });
  },

  /** Emite a declaração (ou devolve a já emitida: cada declaração tem um único código). */
  async emitir(usuario: UsuarioLogadoLike, dados: { tipo: TipoDeclaracao; tccId: number }) {
    const d = (await disponiveis(usuario.id)).find((x) => x.tipo === dados.tipo && Number(x.tcc_id) === dados.tccId);
    if (!d) throw new ErroNegocio(422, 'Esta declaração ainda não está disponível para você');
    return transacao(async (db) => {
      const { rows: existe } = await db.query('SELECT * FROM declaracao WHERE tipo = $1 AND usuario_id = $2 AND tcc_id = $3', [d.tipo, usuario.id, d.tcc_id]);
      if (existe[0]) return existe[0];
      const conteudo = await montarDados(usuario.id, d);
      const { rows: [nova] } = await db.query(
        'INSERT INTO declaracao (codigo, tipo, usuario_id, tcc_id, banca_id, dados) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [gerarCodigo(), d.tipo, usuario.id, d.tcc_id, d.banca_id, JSON.stringify(conteudo)],
      );
      await registrarAuditoria(db, { usuarioId: usuario.id, tabela: 'declaracao', registroId: Number(d.tcc_id), operacao: 'INSERT', novo: { codigo: nova.codigo, tipo: d.tipo } });
      const nomes: Record<TipoDeclaracao, string> = { PARTICIPACAO_BANCA: 'participação em banca', ORIENTACAO: 'orientação', FOLHA_APROVACAO: 'folha de aprovação' };
      await registrarEvento(db, Number(d.tcc_id), 'DECLARACAO_EMITIDA', `Emitida declaração de ${nomes[d.tipo]} (código ${nova.codigo})`, usuario.id);
      return nova;
    });
  },

  /** Abre uma declaração para imprimir: só quem a emitiu ou a coordenação do curso. */
  async obter(usuario: UsuarioLogadoLike, codigo: string) {
    const { rows } = await pool.query(
      'SELECT d.*, t.curso_id FROM declaracao d JOIN tcc t ON t.id = d.tcc_id WHERE d.codigo = $1', [normalizarCodigo(codigo)],
    );
    const d = rows[0];
    if (!d) throw naoEncontrado('Declaração');
    const coordenacao = usuario.perfil === 'COORDENACAO' && usuario.cursoId === Number(d.curso_id);
    if (Number(d.usuario_id) !== usuario.id && !coordenacao) throw proibido();
    return d;
  },

  /** Verificação pública (sem login) de ata ou declaração pelo código. */
  async verificar(codigoDigitado: string) {
    const codigo = normalizarCodigo(codigoDigitado);
    const ata = await bancasService.verificarAta(codigo);
    if (ata) return ata;
    const { rows } = await pool.query('SELECT codigo, tipo, dados, emitida_em FROM declaracao WHERE codigo = $1', [codigo]);
    if (!rows[0]) throw new ErroNegocio(404, 'Nenhum documento encontrado com este código. Confira se digitou certo');
    return { tipo: rows[0].tipo, codigo, emitidaEm: rows[0].emitida_em, dados: rows[0].dados };
  },
};
