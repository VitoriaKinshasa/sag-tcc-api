import { pool, transacao } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado, proibido } from '../../shared/errors.js';
import { registrarAuditoria, registrarEvento } from '../../shared/auditoria.js';
import { notificar, notificarCoordenacao } from '../../shared/notificacao.js';
import { diaEmManaus, semestreDe, SITUACOES_ATIVAS, type UsuarioLogadoLike } from '../../shared/util.js';
import { tccRepository, type Tcc } from '../propostas/tcc.repository.js';
import { orientacaoRepository } from '../orientacao/orientacao.repository.js';
import { bancasRepository } from '../bancas/bancas.repository.js';
import { NOME_ETAPA } from '../calendario/calendario.service.js';
import { prazosDoTcc, recalcularAtraso } from './prazos.service.js';
import { lerPdf, TAMANHO_MAXIMO_PDF } from '../../shared/documentos.js';

export const TAMANHO_MAXIMO = TAMANHO_MAXIMO_PDF; // 10 MB
export type EtapaEntrega = 'QUALIFICACAO' | 'VERSAO_FINAL' | 'ENTREGA_DEFINITIVA';
const APROVADOS = ['APROVADO', 'APROVADO_PUBLICACAO'];

export interface DadosVersao {
  etapa: EtapaEntrega; comentario?: string | null; arquivoNome: string; arquivoBase64: string;
  visibilidade?: 'TEXTO_COMPLETO' | 'SOMENTE_METADADOS';
  /** "Declaro que este trabalho é de minha autoria..." – obrigatório na versão final e na entrega definitiva. */
  declaracaoAutoria?: boolean;
}

/** Membro de uma banca (agendada ou realizada) deste TCC: pode baixar a versão final para avaliar. */
async function membroDeBancaDoTcc(usuarioId: number, tccId: number) {
  const { rows } = await pool.query(
    `SELECT 1 FROM banca b JOIN banca_membro m ON m.banca_id = b.id
     WHERE b.tcc_id = $1 AND m.usuario_id = $2 AND b.status IN ('AGENDADA', 'REALIZADA') LIMIT 1`,
    [tccId, usuarioId],
  );
  return !!rows[0];
}

/** Aluno dono, orientador, coorientador ou coordenação do curso. */
function podeVer(usuario: UsuarioLogadoLike, tcc: Tcc) {
  const envolvidos = [tcc.aluno_id, tcc.orientador_id, tcc.coorientador_id].map(Number);
  return envolvidos.includes(usuario.id) || (usuario.perfil === 'COORDENACAO' && usuario.cursoId === Number(tcc.curso_id));
}

async function tccVisivel(usuario: UsuarioLogadoLike, tccId: number) {
  const tcc = await tccRepository.buscarPorId(pool, tccId);
  if (!tcc) throw naoEncontrado('TCC');
  if (!podeVer(usuario, tcc)) throw proibido();
  return tcc;
}


const COLUNAS_VERSAO = `
  v.id, v.tcc_id, v.etapa, v.numero, v.comentario, v.arquivo_nome, v.arquivo_tamanho, v.fora_do_prazo, v.enviado_em, v.declaracao_autoria,
  p.decisao AS parecer_decisao, p.texto AS parecer_texto, p.criado_em AS parecer_em, pa.nome AS parecer_autor`;

export const acompanhamentoService = {
  /** RF14 – Enviar versão do TCC (Qualificação, Versão final) ou a versão definitiva depois da aprovação. */
  async enviarVersao(alunoId: number, tccId: number, dados: DadosVersao) {
    const bytes = lerPdf(dados.arquivoNome, dados.arquivoBase64);
    return transacao(async (db) => {
      const tcc = await tccRepository.buscarPorId(db, tccId, true);
      if (!tcc) throw naoEncontrado('TCC');
      if (Number(tcc.aluno_id) !== alunoId) throw proibido();
      const definitiva = dados.etapa === 'ENTREGA_DEFINITIVA';
      if ((definitiva || dados.etapa === 'VERSAO_FINAL') && !dados.declaracaoAutoria) {
        throw new ErroNegocio(422, 'Para enviar esta versão, confirme a declaração de autoria do trabalho');
      }
      if (definitiva && !dados.visibilidade) {
        throw new ErroNegocio(422, 'Escolha se o texto completo pode ser publicado no repositório depois da aprovação', 'RF40');
      }
      if (definitiva && !APROVADOS.includes(tcc.situacao)) {
        throw new ErroNegocio(422, 'A entrega definitiva só é feita depois da aprovação do TCC', 'RF22');
      }
      if (!definitiva && !['EM_DESENVOLVIMENTO', 'APTO_DEFESA'].includes(tcc.situacao)) {
        throw new ErroNegocio(422, 'Só é possível enviar versões de um TCC em desenvolvimento, depois do aceite da orientação', 'RF14');
      }
      const hoje = diaEmManaus();
      let foraDoPrazo: boolean;
      if (definitiva && tcc.prazo_correcoes) {
        foraDoPrazo = hoje > tcc.prazo_correcoes; // aprovado com correções: vale o prazo dado pela banca
      } else {
        const { rows: cal } = await db.query(
          'SELECT data_limite FROM calendario_etapa WHERE curso_id = $1 AND semestre = $2 AND etapa = $3',
          [tcc.curso_id, semestreDe(hoje), dados.etapa],
        );
        if (!cal[0]) throw new ErroNegocio(422, 'A coordenação ainda não cadastrou o calendário deste semestre', 'RF12');
        foraDoPrazo = hoje > cal[0].data_limite;
      }

      const { rows: [{ proximo }] } = await db.query('SELECT COALESCE(MAX(numero), 0) + 1 AS proximo FROM versao_tcc WHERE tcc_id = $1', [tccId]);
      const { rows: [versao] } = await db.query(
        `INSERT INTO versao_tcc (tcc_id, etapa, numero, comentario, arquivo_nome, arquivo_tamanho, arquivo, fora_do_prazo, enviado_por, declaracao_autoria)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, tcc_id, etapa, numero, comentario, arquivo_nome, arquivo_tamanho, fora_do_prazo, enviado_em, declaracao_autoria`,
        [tccId, dados.etapa, proximo, dados.comentario?.trim() || null, dados.arquivoNome, bytes.length, bytes, foraDoPrazo, alunoId, !!dados.declaracaoAutoria],
      );
      if (definitiva && dados.visibilidade) {
        await db.query('UPDATE tcc SET visibilidade = $2 WHERE id = $1', [tccId, dados.visibilidade]); // RF40
      }
      await recalcularAtraso(db, hoje, tccId);

      const etapa = NOME_ETAPA[dados.etapa];
      await registrarEvento(db, tccId, definitiva ? 'ENTREGA_DEFINITIVA' : 'VERSAO_ENVIADA',
        `Versão ${versao.numero} enviada (${etapa})${foraDoPrazo ? ' fora do prazo' : ''}`, alunoId);
      await registrarAuditoria(db, { usuarioId: alunoId, tabela: 'versao_tcc', registroId: Number(versao.id), operacao: 'INSERT', novo: versao });
      if (tcc.orientador_id) {
        const extra = definitiva && tcc.correcoes_pendentes
          ? ' Confira se as correções pedidas pela banca foram feitas: ao aprovar esta versão, o TCC é concluído.' : '';
        await notificar(db, Number(tcc.orientador_id), `Nova versão para parecer (${etapa})`, `O TCC "${tcc.titulo}" recebeu a versão ${versao.numero}.${extra}`);
      }
      return versao;
    });
  },

  /** Versões de um TCC, com o parecer de cada uma (sem o arquivo). */
  async listarVersoes(usuario: UsuarioLogadoLike, tccId: number) {
    await tccVisivel(usuario, tccId);
    const { rows } = await pool.query(
      `SELECT ${COLUNAS_VERSAO} FROM versao_tcc v
       LEFT JOIN parecer_versao p ON p.versao_id = v.id LEFT JOIN usuario pa ON pa.id = p.autor_id
       WHERE v.tcc_id = $1 ORDER BY v.numero DESC`,
      [tccId],
    );
    return rows;
  },

  /** Versões dos TCCs que o professor orienta; as que aguardam parecer aparecem primeiro. */
  async versoesRecebidas(professorId: number) {
    const { rows } = await pool.query(
      `SELECT ${COLUNAS_VERSAO}, t.titulo, al.nome AS aluno FROM versao_tcc v
       JOIN tcc t ON t.id = v.tcc_id JOIN usuario al ON al.id = t.aluno_id
       LEFT JOIN parecer_versao p ON p.versao_id = v.id LEFT JOIN usuario pa ON pa.id = p.autor_id
       WHERE t.orientador_id = $1 ORDER BY p.id IS NULL DESC, v.enviado_em DESC`,
      [professorId],
    );
    return rows;
  },

  /**
   * Download do PDF. Podem baixar: aluno, orientador, coorientador e coordenação do curso;
   * os membros da banca baixam só a versão final. Todo download fica registrado.
   */
  async arquivo(usuario: UsuarioLogadoLike, versaoId: number) {
    const { rows } = await pool.query('SELECT tcc_id, etapa, arquivo_nome, arquivo FROM versao_tcc WHERE id = $1', [versaoId]);
    if (!rows[0]) throw naoEncontrado('Versão');
    const tcc = await tccRepository.buscarPorId(pool, Number(rows[0].tcc_id));
    if (!tcc) throw naoEncontrado('TCC');
    const daBanca = rows[0].etapa === 'VERSAO_FINAL' && await membroDeBancaDoTcc(usuario.id, tcc.id);
    if (!podeVer(usuario, tcc) && !daBanca) throw proibido();
    await pool.query('INSERT INTO download_versao (versao_id, usuario_id) VALUES ($1, $2)', [versaoId, usuario.id]);
    return rows[0] as { arquivo_nome: string; arquivo: Buffer };
  },

  /** Quem baixou os arquivos do TCC e quando (o aluno acompanha quem acessou o trabalho dele). */
  async downloads(usuario: UsuarioLogadoLike, tccId: number) {
    await tccVisivel(usuario, tccId);
    const { rows } = await pool.query(
      `SELECT d.baixado_em, v.numero, v.etapa, v.arquivo_nome, u.nome, u.perfil, u.externo, u.instituicao,
              (SELECT m.papel FROM banca_membro m JOIN banca b ON b.id = m.banca_id
               WHERE b.tcc_id = v.tcc_id AND m.usuario_id = u.id ORDER BY b.id DESC LIMIT 1) AS papel_banca
       FROM download_versao d JOIN versao_tcc v ON v.id = d.versao_id JOIN usuario u ON u.id = d.usuario_id
       WHERE v.tcc_id = $1 ORDER BY d.baixado_em DESC LIMIT 200`,
      [tccId],
    );
    return rows;
  },

  /** RF15 – Parecer do orientador sobre uma versão (aprovada ou com ajustes). */
  async darParecer(orientadorId: number, versaoId: number, dados: { decisao: 'APROVADA' | 'AJUSTES'; texto?: string | null }) {
    return transacao(async (db) => {
      const { rows } = await db.query('SELECT id, tcc_id, etapa, numero FROM versao_tcc WHERE id = $1', [versaoId]);
      const versao = rows[0];
      if (!versao) throw naoEncontrado('Versão');
      const tcc = (await tccRepository.buscarPorId(db, Number(versao.tcc_id)))!;
      if (Number(tcc.orientador_id) !== orientadorId) throw proibido('Somente o orientador do TCC pode dar parecer');
      const texto = dados.texto?.trim() || null;
      if (dados.decisao === 'AJUSTES' && !texto) throw new ErroNegocio(422, 'Descreva os ajustes que o aluno deve fazer', 'RD11');
      const { rows: existe } = await db.query('SELECT 1 FROM parecer_versao WHERE versao_id = $1', [versaoId]);
      if (existe[0]) throw new ErroNegocio(409, 'Esta versão já recebeu parecer. Peça ao aluno uma nova versão');
      const { rows: [parecer] } = await db.query(
        'INSERT INTO parecer_versao (versao_id, autor_id, decisao, texto) VALUES ($1, $2, $3, $4) RETURNING *',
        [versaoId, orientadorId, dados.decisao, texto],
      );
      const etapa = NOME_ETAPA[versao.etapa as EtapaEntrega];
      const resumo = dados.decisao === 'APROVADA' ? 'aprovada' : 'com pedido de ajustes';
      await registrarEvento(db, tcc.id, 'PARECER_REGISTRADO', `Versão ${versao.numero} (${etapa}) ${resumo}${texto ? `: ${texto}` : ''}`, orientadorId);
      await registrarAuditoria(db, { usuarioId: orientadorId, tabela: 'parecer_versao', registroId: Number(parecer.id), operacao: 'INSERT', novo: parecer });
      await notificar(db, Number(tcc.aluno_id), `Parecer da versão ${versao.numero}`, `Sua versão (${etapa}) foi ${resumo}.${texto ? ` ${texto}` : ''}`);

      // Entrega definitiva aprovada pelo orientador: o TCC está concluído (e as correções da banca, se havia, foram aceitas)
      if (versao.etapa === 'ENTREGA_DEFINITIVA' && dados.decisao === 'APROVADA' && APROVADOS.includes(tcc.situacao) && !tcc.concluido_em) {
        const { rows: [novo] } = await db.query(
          'UPDATE tcc SET correcoes_pendentes = FALSE, concluido_em = now(), atrasado = FALSE WHERE id = $1 RETURNING *', [tcc.id],
        );
        const sobreCorrecoes = tcc.correcoes_pendentes ? ' As correções pedidas pela banca foram confirmadas pelo orientador.' : '';
        await registrarEvento(db, tcc.id, 'TCC_CONCLUIDO', `TCC concluído: entrega definitiva aprovada.${sobreCorrecoes}`, orientadorId);
        await registrarAuditoria(db, { usuarioId: orientadorId, tabela: 'tcc', registroId: tcc.id, operacao: 'UPDATE', anterior: tcc, novo });
        await notificar(db, Number(tcc.aluno_id), 'TCC concluído!', `Sua entrega definitiva foi aprovada.${sobreCorrecoes} Parabéns!`);
        await notificarCoordenacao(db, Number(tcc.curso_id), 'TCC concluído', `"${tcc.titulo}" teve a entrega definitiva aprovada pelo orientador.`);
      }
      return parecer;
    });
  },

  async prazos(usuario: UsuarioLogadoLike, tccId: number) {
    const tcc = await tccVisivel(usuario, tccId);
    return prazosDoTcc(tcc);
  },

  /** RF21 – Aluno pede a conclusão do TCC por artigo publicado. */
  async pedirPublicacao(alunoId: number, tccId: number, dados: { tituloArtigo: string; veiculo: string; ano: number; link: string }) {
    return transacao(async (db) => {
      const tcc = await tccRepository.buscarPorId(db, tccId, true);
      if (!tcc) throw naoEncontrado('TCC');
      if (Number(tcc.aluno_id) !== alunoId) throw proibido();
      if (!['EM_DESENVOLVIMENTO', 'APTO_DEFESA'].includes(tcc.situacao)) {
        throw new ErroNegocio(422, 'A conclusão por publicação só pode ser pedida para um TCC em desenvolvimento', 'RF21');
      }
      const { rows: pendente } = await db.query("SELECT 1 FROM pedido_publicacao WHERE tcc_id = $1 AND status = 'PENDENTE'", [tccId]);
      if (pendente[0]) throw new ErroNegocio(409, 'Já existe um pedido de conclusão por publicação aguardando a coordenação');
      const { rows: [pedido] } = await db.query(
        'INSERT INTO pedido_publicacao (tcc_id, titulo_artigo, veiculo, ano, link) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [tccId, dados.tituloArtigo, dados.veiculo, dados.ano, dados.link],
      );
      await registrarEvento(db, tccId, 'PUBLICACAO_PEDIDA', `Pedido de conclusão por publicação: "${dados.tituloArtigo}" (${dados.veiculo}, ${dados.ano})`, alunoId);
      await notificarCoordenacao(db, Number(tcc.curso_id), 'Pedido de conclusão por publicação', `TCC "${tcc.titulo}". Artigo: "${dados.tituloArtigo}" – ${dados.veiculo}, ${dados.ano}.`);
      if (tcc.orientador_id) await notificar(db, Number(tcc.orientador_id), 'Pedido de conclusão por publicação', `Seu orientando pediu a conclusão do TCC "${tcc.titulo}" por publicação.`);
      return pedido;
    });
  },

  async publicacoesPendentes(coordenacao: UsuarioLogadoLike) {
    const { rows } = await pool.query(
      `SELECT p.*, t.titulo, t.situacao, al.nome AS aluno, o.nome AS orientador
       FROM pedido_publicacao p JOIN tcc t ON t.id = p.tcc_id JOIN usuario al ON al.id = t.aluno_id
       LEFT JOIN usuario o ON o.id = t.orientador_id
       WHERE p.status = 'PENDENTE' AND t.curso_id = $1 ORDER BY p.criado_em`,
      [coordenacao.cursoId],
    );
    return rows;
  },

  /** RF21 – Coordenação aprova (TCC fica "Aprovado para publicação") ou recusa com justificativa. */
  async decidirPublicacao(coordenacao: UsuarioLogadoLike, pedidoId: number, dados: { aprovar: boolean; justificativa?: string | null }) {
    return transacao(async (db) => {
      const { rows } = await db.query('SELECT * FROM pedido_publicacao WHERE id = $1 FOR UPDATE', [pedidoId]);
      const pedido = rows[0];
      if (!pedido) throw naoEncontrado('Pedido');
      if (pedido.status !== 'PENDENTE') throw new ErroNegocio(409, 'Este pedido já foi decidido');
      const tcc = (await tccRepository.buscarPorId(db, Number(pedido.tcc_id), true))!;
      if (coordenacao.cursoId !== Number(tcc.curso_id)) throw proibido('O pedido é de outro curso');
      const justificativa = dados.justificativa?.trim() || null;
      if (!dados.aprovar && !justificativa) throw new ErroNegocio(422, 'Informe a justificativa da recusa', 'RD11');

      const { rows: [decidido] } = await db.query(
        `UPDATE pedido_publicacao SET status = $2, justificativa = $3, decidido_por = $4, decidido_em = now()
         WHERE id = $1 RETURNING *`,
        [pedidoId, dados.aprovar ? 'APROVADA' : 'RECUSADA', justificativa, coordenacao.id],
      );
      if (!dados.aprovar) {
        await registrarEvento(db, tcc.id, 'PUBLICACAO_RECUSADA', `Conclusão por publicação recusada: ${justificativa}`, coordenacao.id);
        await notificar(db, Number(tcc.aluno_id), 'Conclusão por publicação recusada', justificativa!);
        return decidido;
      }
      if (!SITUACOES_ATIVAS.includes(tcc.situacao) || tcc.situacao === 'EM_PROPOSTA') {
        throw new ErroNegocio(422, 'O TCC não está mais em desenvolvimento');
      }
      const { rows: [novo] } = await db.query(
        "UPDATE tcc SET situacao = 'APROVADO_PUBLICACAO', justificativa_situacao = $2 WHERE id = $1 RETURNING *",
        [tcc.id, `Artigo "${pedido.titulo_artigo}" – ${pedido.veiculo}, ${pedido.ano}`],
      );
      await bancasRepository.cancelarAgendadas(db, tcc.id, 'o TCC foi concluído por publicação');
      await orientacaoRepository.encerrarVinculos(db, tcc.id);
      await registrarEvento(db, tcc.id, 'PUBLICACAO_APROVADA', `TCC aprovado por publicação do artigo "${pedido.titulo_artigo}"`, coordenacao.id);
      await registrarAuditoria(db, { usuarioId: coordenacao.id, tabela: 'tcc', registroId: Number(tcc.id), operacao: 'UPDATE', anterior: tcc, novo });
      await notificar(db, Number(tcc.aluno_id), 'TCC aprovado por publicação', 'Agora faça a entrega definitiva do texto no sistema.');
      if (tcc.orientador_id) await notificar(db, Number(tcc.orientador_id), 'TCC aprovado por publicação', `"${tcc.titulo}"`);
      return decidido;
    });
  },
};
