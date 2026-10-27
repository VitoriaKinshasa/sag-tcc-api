import type { PoolClient } from 'pg';
import { pool, transacao } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado, proibido } from '../../shared/errors.js';
import { registrarAuditoria, registrarEvento } from '../../shared/auditoria.js';
import { notificar, notificarCoordenacao } from '../../shared/notificacao.js';
import type { UsuarioLogadoLike } from '../../shared/util.js';
import { tccRepository, type Tcc } from '../propostas/tcc.repository.js';
import { orientacaoRepository as repo } from './orientacao.repository.js';

/**
 * RD02 – o orientador deve ser professor ativo do NUCOMP (não externo).
 * RD05 – o professor não pode passar do limite de orientandos do curso.
 */
async function garantirOrientadorDisponivel(db: PoolClient, professorId: number) {
  const professor = await repo.buscarProfessorComCarga(db, professorId);
  if (!professor || professor.perfil !== 'ORIENTADOR' || !professor.ativo || professor.externo) {
    throw new ErroNegocio(422, 'O orientador deve ser um professor ativo do NUCOMP', 'RD02');
  }
  if (professor.orientandos >= professor.limite) {
    throw new ErroNegocio(422, `${professor.nome} atingiu o limite de ${professor.limite} orientandos`, 'RD05');
  }
  return professor;
}

/** Busca o TCC em andamento do aluno ou interrompe com a mensagem adequada. */
async function tccAtivoDoAluno(db: PoolClient, alunoId: number): Promise<Tcc> {
  const tcc = await tccRepository.buscarAtivoDoAluno(db, alunoId);
  if (!tcc) throw new ErroNegocio(422, 'Você não possui TCC em andamento. Envie sua proposta primeiro');
  return (await tccRepository.buscarPorId(db, Number(tcc.id), true))!; // trava o TCC durante a operação
}

export const orientacaoService = {
  /** UC07 passo 2 – lista orientadores, com indicação de disponibilidade (RD05). */
  listarOrientadores: (areaId?: number) => repo.listarOrientadores(pool, areaId),

  solicitacoesRecebidas: (professorId: number) => repo.solicitacoesDoProfessor(pool, professorId),

  /** UC07 – Solicitar orientação (RF07, RD02, RD04, RD05). */
  async solicitar(alunoId: number, professorId: number) {
    return transacao(async (db) => {
      const tcc = await tccAtivoDoAluno(db, alunoId);
      if (tcc.orientador_id) throw new ErroNegocio(422, 'Seu TCC já possui orientador', 'RD04');
      if (await repo.existeSolicitacaoPendente(db, tcc.id)) {
        throw new ErroNegocio(409, 'Você já possui uma solicitação de orientação pendente', 'RD04');
      }
      const professor = await garantirOrientadorDisponivel(db, professorId);

      const solicitacao = await repo.inserirSolicitacao(db, tcc.id, professorId);
      await registrarEvento(db, tcc.id, 'ORIENTACAO_SOLICITADA', `Orientação solicitada a ${professor.nome}`, alunoId);
      await registrarAuditoria(db, { usuarioId: alunoId, tabela: 'solicitacao_orientacao', registroId: Number(solicitacao.id), operacao: 'INSERT', novo: solicitacao });
      await notificar(db, professorId, 'Nova solicitação de orientação', `Você recebeu um pedido de orientação para o TCC "${tcc.titulo}".`);
      return solicitacao;
    });
  },

  /** UC08 – Responder solicitação de orientação (RF08, RF09, RD02, RD03, RD05). */
  async responder(professorId: number, solicitacaoId: number, dados: { aceitar: boolean; justificativa?: string | null; coorientadorId?: number | null }) {
    return transacao(async (db) => {
      const solicitacao = await repo.buscarSolicitacao(db, solicitacaoId);
      if (!solicitacao) throw naoEncontrado('Solicitação');
      if (Number(solicitacao.professor_id) !== professorId) throw proibido();
      if (solicitacao.status !== 'PENDENTE') throw new ErroNegocio(409, 'Esta solicitação já foi respondida');
      const tcc = (await tccRepository.buscarPorId(db, Number(solicitacao.tcc_id), true))!;

      if (!dados.aceitar) {
        const justificativa = dados.justificativa?.trim();
        if (!justificativa) throw new ErroNegocio(422, 'A justificativa é obrigatória para recusar a solicitação', 'RF08');
        const recusada = await repo.responderSolicitacao(db, solicitacaoId, 'RECUSADA', justificativa);
        await registrarEvento(db, tcc.id, 'ORIENTACAO_RECUSADA', `Solicitação recusada: ${justificativa}`, professorId);
        await registrarAuditoria(db, { usuarioId: professorId, tabela: 'solicitacao_orientacao', registroId: solicitacaoId, operacao: 'UPDATE', anterior: solicitacao, novo: recusada });
        await notificar(db, Number(tcc.aluno_id), 'Solicitação de orientação recusada', `Motivo: ${justificativa}. Você pode solicitar outro orientador.`);
        return recusada;
      }

      await garantirOrientadorDisponivel(db, professorId); // RD05 conferido de novo no momento do aceite
      const coorientadorId = dados.coorientadorId ?? null;
      if (coorientadorId) {
        if (coorientadorId === professorId) throw new ErroNegocio(422, 'O coorientador deve ser diferente do orientador', 'RD03');
        const { rows } = await db.query(
          "SELECT 1 FROM usuario WHERE id = $1 AND ativo AND (perfil = 'ORIENTADOR' OR externo)", [coorientadorId]);
        if (!rows[0]) throw new ErroNegocio(422, 'Coorientador inválido', 'RD03');
      }

      const aceita = await repo.responderSolicitacao(db, solicitacaoId, 'ACEITA', null);
      const tccAtualizado = await tccRepository.definirOrientacao(db, tcc.id, professorId, coorientadorId);
      await repo.iniciarVinculo(db, tcc.id, professorId, 'ORIENTADOR');
      if (coorientadorId) await repo.iniciarVinculo(db, tcc.id, coorientadorId, 'COORIENTADOR');

      await registrarEvento(db, tcc.id, 'ORIENTACAO_ACEITA', 'Orientação aceita. TCC em desenvolvimento', professorId);
      await registrarAuditoria(db, { usuarioId: professorId, tabela: 'tcc', registroId: Number(tcc.id), operacao: 'UPDATE', anterior: tcc, novo: tccAtualizado });
      await notificar(db, Number(tcc.aluno_id), 'Orientação aceita', 'Seu pedido de orientação foi aceito. Bom trabalho!');
      return aceita;
    });
  },

  /** UC09 – Agendar reunião de alinhamento (RF33, RD15). */
  async agendarReuniao(orientadorId: number, tccId: number, dados: { dataHora: Date; localOuLink: string; confirmarConflito?: boolean }) {
    return transacao(async (db) => {
      const tcc = await tccRepository.buscarPorId(db, tccId);
      if (!tcc) throw naoEncontrado('TCC');
      if (Number(tcc.orientador_id) !== orientadorId) {
        throw new ErroNegocio(422, 'A reunião só pode ser agendada pelo orientador, depois do aceite da orientação', 'RD15');
      }
      if (dados.dataHora <= new Date()) throw new ErroNegocio(422, 'A data da reunião deve ser futura');
      const conflitos = await repo.conflitosDeAgenda(db, orientadorId, dados.dataHora);
      if (conflitos.length > 0 && !dados.confirmarConflito) {
        throw new ErroNegocio(409, 'Você já tem uma reunião próxima deste horário. Altere o horário ou confirme mesmo assim');
      }
      const reuniao = await repo.inserirReuniao(db, {
        tccId, tipo: 'ALINHAMENTO', dataHora: dados.dataHora, localOuLink: dados.localOuLink, resumo: null, criadoPor: orientadorId,
      });
      await registrarEvento(db, tccId, 'REUNIAO_AGENDADA', `Reunião de alinhamento em ${dados.dataHora.toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}`, orientadorId);
      await notificar(db, Number(tcc.aluno_id), 'Reunião de alinhamento agendada',
        `Data: ${dados.dataHora.toLocaleString('pt-BR', { timeZone: 'America/Manaus' })}. Local ou link: ${dados.localOuLink}`);
      return reuniao;
    });
  },

  /** UC09 A1 – Registrar encontro de orientação (RF16). */
  async registrarEncontro(orientadorId: number, tccId: number, dados: { data: Date; resumo: string }) {
    return transacao(async (db) => {
      const tcc = await tccRepository.buscarPorId(db, tccId);
      if (!tcc) throw naoEncontrado('TCC');
      if (Number(tcc.orientador_id) !== orientadorId) throw proibido('Apenas o orientador do TCC pode registrar encontros');
      const encontro = await repo.inserirReuniao(db, {
        tccId, tipo: 'ENCONTRO', dataHora: dados.data, localOuLink: null, resumo: dados.resumo, criadoPor: orientadorId,
      });
      await registrarEvento(db, tccId, 'ENCONTRO_REGISTRADO', `Encontro de orientação: ${dados.resumo}`, orientadorId);
      return encontro;
    });
  },

  /** UC10 – Solicitar troca de orientador (RF34, RD05, RD14). */
  async solicitarTroca(alunoId: number, dados: { novoOrientadorId: number; motivo: string }) {
    return transacao(async (db) => {
      const tcc = await tccAtivoDoAluno(db, alunoId);
      if (!tcc.orientador_id) throw new ErroNegocio(422, 'Seu TCC ainda não tem orientador. Use a solicitação de orientação');
      if (Number(tcc.orientador_id) === dados.novoOrientadorId) throw new ErroNegocio(422, 'Escolha um orientador diferente do atual');
      if (await repo.existeTrocaPendente(db, tcc.id)) {
        throw new ErroNegocio(409, 'Já existe uma solicitação de troca aguardando a coordenação', 'RD14');
      }
      const novo = await garantirOrientadorDisponivel(db, dados.novoOrientadorId);
      const troca = await repo.inserirTroca(db, { tccId: tcc.id, atualId: Number(tcc.orientador_id), novoId: dados.novoOrientadorId, motivo: dados.motivo });
      await registrarEvento(db, tcc.id, 'TROCA_SOLICITADA', `Troca de orientador solicitada para ${novo.nome}. Motivo: ${dados.motivo}`, alunoId);
      await registrarAuditoria(db, { usuarioId: alunoId, tabela: 'solicitacao_troca', registroId: Number(troca.id), operacao: 'INSERT', novo: troca });
      await notificarCoordenacao(db, Number(tcc.curso_id), 'Pedido de troca de orientador', `O TCC "${tcc.titulo}" tem um pedido de troca aguardando análise.`);
      return troca;
    });
  },

  /** UC11 – Aprovar ou recusar troca de orientador (RF34, RD05, RD14). */
  async decidirTroca(coordenacao: UsuarioLogadoLike, trocaId: number, dados: { aprovar: boolean; justificativa?: string | null }) {
    return transacao(async (db) => {
      const troca = await repo.buscarTroca(db, trocaId);
      if (!troca) throw naoEncontrado('Solicitação de troca');
      if (troca.status !== 'PENDENTE') throw new ErroNegocio(409, 'Esta solicitação já foi decidida');
      const tcc = (await tccRepository.buscarPorId(db, Number(troca.tcc_id), true))!;
      if (Number(tcc.curso_id) !== coordenacao.cursoId) throw proibido('A troca deve ser decidida pela coordenação do curso do aluno');

      if (!dados.aprovar) {
        const justificativa = dados.justificativa?.trim();
        if (!justificativa) throw new ErroNegocio(422, 'A justificativa é obrigatória para recusar a troca');
        const recusada = await repo.decidirTroca(db, trocaId, 'RECUSADA', justificativa, coordenacao.id);
        await registrarEvento(db, tcc.id, 'TROCA_RECUSADA', `Troca de orientador recusada: ${justificativa}`, coordenacao.id);
        await notificar(db, Number(tcc.aluno_id), 'Troca de orientador recusada', `Motivo: ${justificativa}`);
        return recusada;
      }

      await garantirOrientadorDisponivel(db, Number(troca.novo_orientador_id));
      const aprovada = await repo.decidirTroca(db, trocaId, 'APROVADA', dados.justificativa ?? null, coordenacao.id);
      await repo.encerrarVinculos(db, tcc.id, 'ORIENTADOR');                                  // RD14: o anterior fica no histórico
      await repo.iniciarVinculo(db, tcc.id, Number(troca.novo_orientador_id), 'ORIENTADOR');
      const tccAtualizado = await tccRepository.trocarOrientador(db, tcc.id, Number(troca.novo_orientador_id));

      await registrarEvento(db, tcc.id, 'TROCA_APROVADA', 'Troca de orientador aprovada pela coordenação', coordenacao.id);
      await registrarAuditoria(db, { usuarioId: coordenacao.id, tabela: 'tcc', registroId: Number(tcc.id), operacao: 'UPDATE', anterior: tcc, novo: tccAtualizado });
      for (const id of [tcc.aluno_id, troca.orientador_atual_id, troca.novo_orientador_id]) {
        await notificar(db, Number(id), 'Troca de orientador aprovada', `O TCC "${tcc.titulo}" teve o orientador alterado.`);
      }
      return aprovada;
    });
  },

  /** UC12 – Registrar desistência (RF35). */
  async pedirDesistencia(alunoId: number, motivo: string) {
    return transacao(async (db) => {
      const tcc = await tccAtivoDoAluno(db, alunoId);
      if (await repo.existeDesistenciaPendente(db, tcc.id)) throw new ErroNegocio(409, 'Já existe um pedido de desistência aguardando confirmação');
      const pedido = await repo.inserirDesistencia(db, tcc.id, motivo);
      await registrarEvento(db, tcc.id, 'DESISTENCIA_SOLICITADA', `Desistência solicitada. Motivo: ${motivo}`, alunoId);
      if (tcc.orientador_id) await notificar(db, Number(tcc.orientador_id), 'Pedido de desistência', `O aluno pediu desistência do TCC "${tcc.titulo}".`);
      await notificarCoordenacao(db, Number(tcc.curso_id), 'Pedido de desistência', `O aluno pediu desistência do TCC "${tcc.titulo}".`);
      return pedido;
    });
  },

  /** UC12 passo 3 – Orientador ou coordenação confirma a desistência (RD10, RD11). */
  async decidirDesistencia(usuario: UsuarioLogadoLike, pedidoId: number, confirmar: boolean) {
    return transacao(async (db) => {
      const pedido = await repo.buscarDesistencia(db, pedidoId);
      if (!pedido) throw naoEncontrado('Pedido de desistência');
      if (pedido.status !== 'PENDENTE') throw new ErroNegocio(409, 'Este pedido já foi decidido');
      const tcc = (await tccRepository.buscarPorId(db, Number(pedido.tcc_id), true))!;
      const ehOrientador = Number(tcc.orientador_id) === usuario.id;
      const ehCoordenacaoDoCurso = usuario.perfil === 'COORDENACAO' && usuario.cursoId === Number(tcc.curso_id);
      if (!ehOrientador && !ehCoordenacaoDoCurso) throw proibido('Somente o orientador ou a coordenação do curso podem confirmar', );

      if (!confirmar) {
        const recusado = await repo.decidirDesistencia(db, pedidoId, 'RECUSADA', usuario.id);
        await registrarEvento(db, tcc.id, 'DESISTENCIA_NAO_CONFIRMADA', 'Pedido de desistência não confirmado', usuario.id);
        await notificar(db, Number(tcc.aluno_id), 'Desistência não confirmada', 'Seu TCC continua em andamento.');
        return recusado;
      }

      const confirmado = await repo.decidirDesistencia(db, pedidoId, 'APROVADA', usuario.id);
      const tccCancelado = await tccRepository.cancelar(db, tcc.id, pedido.motivo); // RD11: cancelamento sempre com justificativa
      await repo.encerrarVinculos(db, tcc.id);                                       // libera a vaga do orientador (RD05)
      await registrarEvento(db, tcc.id, 'TCC_CANCELADO', `TCC cancelado por desistência. Motivo: ${pedido.motivo}`, usuario.id);
      await registrarAuditoria(db, { usuarioId: usuario.id, tabela: 'tcc', registroId: Number(tcc.id), operacao: 'UPDATE', anterior: tcc, novo: tccCancelado });
      await notificar(db, Number(tcc.aluno_id), 'Desistência confirmada', 'Seu TCC foi cancelado. Você pode enviar uma nova proposta quando quiser.');
      return confirmado;
    });
  },
};
