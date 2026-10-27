import { pool, transacao } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado, proibido } from '../../shared/errors.js';
import { registrarAuditoria, registrarEvento } from '../../shared/auditoria.js';
import { contarPalavras, type UsuarioLogadoLike } from '../../shared/util.js';
import { tccRepository } from './tcc.repository.js';

export const LIMITE_PALAVRAS_RESUMO = 250;

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
    const tcc = await tccRepository.buscarAtivoDoAluno(pool, alunoId);
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
};
