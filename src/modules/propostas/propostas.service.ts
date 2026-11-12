import { pool, transacao } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado, proibido } from '../../shared/errors.js';
import { registrarAuditoria, registrarEvento } from '../../shared/auditoria.js';
import { notificar } from '../../shared/notificacao.js';
import { contarPalavras, NOME_SITUACAO, type UsuarioLogadoLike } from '../../shared/util.js';
import { tccRepository } from './tcc.repository.js';
import { orientacaoRepository } from '../orientacao/orientacao.repository.js';
import { bancasRepository } from '../bancas/bancas.repository.js';

export const LIMITE_PALAVRAS_RESUMO = 250;

/**
 * UC17 – mudanças de situação permitidas. Aprovado e Reprovado só pelo resultado da defesa (UC20);
 * Cancelado por desistência também pelo UC12.
 */
export const TRANSICOES: Record<string, string[]> = {
  EM_PROPOSTA: ['CANCELADO'],
  EM_DESENVOLVIMENTO: ['APTO_DEFESA', 'NAO_APRESENTADO', 'CANCELADO'],
  APTO_DEFESA: ['EM_DESENVOLVIMENTO', 'NAO_APRESENTADO', 'CANCELADO'],
};
const FINAIS = ['NAO_APRESENTADO', 'CANCELADO'];

export interface DadosProposta { titulo: string; subtitulo?: string | null; resumo: string; areaId: number }

async function validarProposta(dados: DadosProposta) {
  if (contarPalavras(dados.resumo) > LIMITE_PALAVRAS_RESUMO) {
    throw new ErroNegocio(422, `O resumo deve ter no máximo ${LIMITE_PALAVRAS_RESUMO} palavras`, 'RF06');
  }
  const { rows } = await pool.query('SELECT 1 FROM area_conhecimento WHERE id = $1 AND ativo', [dados.areaId]);
  if (!rows[0]) throw new ErroNegocio(422, 'Área do conhecimento inválida');
}

export const propostasService = {
  /** UC06 – Submeter proposta de TCC (RF06, RD01). */
  async submeter(alunoId: number, cursoId: number | null, dados: DadosProposta) {
    if (!cursoId) throw new ErroNegocio(422, 'Aluno sem curso vinculado. Procure a coordenação', 'RF32');
    if (await tccRepository.buscarAtivoDoAluno(pool, alunoId)) {
      throw new ErroNegocio(409, 'Você já possui um TCC em andamento neste curso', 'RD01');
    }
    await validarProposta(dados);
    return transacao(async (db) => {
      const tcc = await tccRepository.inserir(db, {
        alunoId, cursoId, areaId: dados.areaId, titulo: dados.titulo, subtitulo: dados.subtitulo ?? null, resumo: dados.resumo,
      });
      await registrarEvento(db, tcc.id, 'PROPOSTA_ENVIADA', `Proposta "${tcc.titulo}" enviada`, alunoId);
      await registrarAuditoria(db, { usuarioId: alunoId, tabela: 'tcc', registroId: Number(tcc.id), operacao: 'INSERT', novo: tcc });
      return tcc;
    });
  },

  /** UC06 A4 – a proposta pode ser editada até o aceite da orientação. */
  async editar(alunoId: number, tccId: number, dados: DadosProposta) {
    const anterior = await tccRepository.buscarPorId(pool, tccId);
    if (!anterior) throw naoEncontrado('TCC');
    if (Number(anterior.aluno_id) !== alunoId) throw proibido();
    if (anterior.situacao !== 'EM_PROPOSTA' || anterior.orientador_id) {
      throw new ErroNegocio(422, 'A proposta só pode ser editada antes do aceite da orientação');
    }
    await validarProposta(dados);
    return transacao(async (db) => {
      const tcc = await tccRepository.atualizarProposta(db, tccId, {
        areaId: dados.areaId, titulo: dados.titulo, subtitulo: dados.subtitulo ?? null, resumo: dados.resumo,
      });
      await registrarEvento(db, tccId, 'PROPOSTA_EDITADA', 'Proposta editada pelo aluno', alunoId);
      await registrarAuditoria(db, { usuarioId: alunoId, tabela: 'tcc', registroId: tccId, operacao: 'UPDATE', anterior, novo: tcc });
      return tcc;
    });
  },

  async meuTcc(alunoId: number) {
    // TCC em andamento; se não houver, o último aprovado (para a entrega definitiva)
    const tcc = await tccRepository.buscarAtivoDoAluno(pool, alunoId) ?? await tccRepository.buscarAprovadoDoAluno(pool, alunoId);
    if (!tcc) throw naoEncontrado('TCC em andamento');
    return tcc;
  },

  /** RF36 – linha do tempo do TCC (aluno dono, orientador, coorientador ou coordenação). */
  async historico(usuario: UsuarioLogadoLike, tccId: number) {
    const tcc = await tccRepository.buscarPorId(pool, tccId);
    if (!tcc) throw naoEncontrado('TCC');
    const envolvidos = [tcc.aluno_id, tcc.orientador_id, tcc.coorientador_id].map(Number);
    if (usuario.perfil !== 'COORDENACAO' && !envolvidos.includes(usuario.id)) throw proibido();
    return tccRepository.historico(pool, tccId);
  },

  /** Lista os TCCs do curso da coordenação (tela "TCCs do curso"). */
  async doCurso(coordenacao: UsuarioLogadoLike) {
    const { rows } = await pool.query(
      `SELECT t.id, t.titulo, t.situacao, t.justificativa_situacao, t.atrasado, al.nome AS aluno, o.nome AS orientador, a.nome AS area,
              (SELECT json_build_object('id', b.id, 'dataHora', b.data_hora, 'status', b.status) FROM banca b
               WHERE b.tcc_id = t.id ORDER BY b.criado_em DESC LIMIT 1) AS banca
       FROM tcc t JOIN usuario al ON al.id = t.aluno_id LEFT JOIN usuario o ON o.id = t.orientador_id
       JOIN area_conhecimento a ON a.id = t.area_id
       WHERE t.curso_id = $1 ORDER BY t.situacao, al.nome`,
      [coordenacao.cursoId],
    );
    return rows;
  },

  /** UC17 – Alterar situação do TCC (RF15, RD10, RD11). */
  async alterarSituacao(usuario: UsuarioLogadoLike, tccId: number, dados: { situacao: string; justificativa?: string | null }) {
    return transacao(async (db) => {
      const tcc = await tccRepository.buscarPorId(db, tccId, true);
      if (!tcc) throw naoEncontrado('TCC');
      const ehOrientador = Number(tcc.orientador_id) === usuario.id;
      const ehCoordenacao = usuario.perfil === 'COORDENACAO' && usuario.cursoId === Number(tcc.curso_id);
      if (!ehOrientador && !ehCoordenacao) {
        throw new ErroNegocio(403, 'Somente o orientador do TCC ou a coordenação do curso podem alterar a situação', 'RD10');
      }
      const permitidas = TRANSICOES[tcc.situacao] ?? [];
      if (!permitidas.includes(dados.situacao)) {
        throw new ErroNegocio(422, `Não é possível passar de "${NOME_SITUACAO[tcc.situacao]}" para "${NOME_SITUACAO[dados.situacao]}"`
          + (permitidas.length ? `. Opções: ${permitidas.map((s) => NOME_SITUACAO[s]).join(', ')}` : '. Esta situação é final'), 'RF15');
      }
      const justificativa = dados.justificativa?.trim() || null;
      if (dados.situacao !== 'APTO_DEFESA' && !justificativa) {
        throw new ErroNegocio(422, 'Informe a justificativa da mudança de situação', 'RD11');
      }

      const { rows } = await db.query(
        'UPDATE tcc SET situacao = $2, justificativa_situacao = $3 WHERE id = $1 RETURNING *',
        [tccId, dados.situacao, justificativa],
      );
      if (tcc.situacao === 'APTO_DEFESA') {
        await bancasRepository.cancelarAgendadas(db, tccId, `o TCC passou para "${NOME_SITUACAO[dados.situacao]}"`);
      }
      if (FINAIS.includes(dados.situacao)) {
        await orientacaoRepository.encerrarVinculos(db, tccId);   // libera a vaga do orientador (RD05)
        await db.query("UPDATE solicitacao_orientacao SET status = 'CANCELADA', respondido_em = now() WHERE tcc_id = $1 AND status = 'PENDENTE'", [tccId]);
      }
      const texto = `Situação alterada de ${NOME_SITUACAO[tcc.situacao]} para ${NOME_SITUACAO[dados.situacao]}`
        + (justificativa ? `. Justificativa: ${justificativa}` : '');
      await registrarEvento(db, tccId, 'SITUACAO_ALTERADA', texto, usuario.id);
      await registrarAuditoria(db, { usuarioId: usuario.id, tabela: 'tcc', registroId: tccId, operacao: 'UPDATE', anterior: tcc, novo: rows[0] });
      await notificar(db, Number(tcc.aluno_id), 'Situação do TCC alterada', texto);
      if (!ehOrientador && tcc.orientador_id) await notificar(db, Number(tcc.orientador_id), 'Situação de orientando alterada', `"${tcc.titulo}": ${texto}`);
      return rows[0];
    });
  },
};
