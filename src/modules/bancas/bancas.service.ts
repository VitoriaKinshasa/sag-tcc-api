import type { PoolClient } from 'pg';
import { pool, transacao } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado, proibido } from '../../shared/errors.js';
import { registrarAuditoria, registrarEvento } from '../../shared/auditoria.js';
import { emailService, notificar, notificarCoordenacao } from '../../shared/notificacao.js';
import { dataHoraBR, diaEmManaus, semestreDe, type UsuarioLogadoLike } from '../../shared/util.js';
import { tccRepository, type Tcc } from '../propostas/tcc.repository.js';
import { orientacaoRepository } from '../orientacao/orientacao.repository.js';
import { bancasRepository as repo, type Banca, type Papel } from './bancas.repository.js';

export interface MembroInformado { usuarioId: number; papel: 'TITULAR' | 'SUPLENTE' }
export interface DadosBanca { tccId: number; dataHora: Date; localOuLink: string; membros: MembroInformado[] }
export type Resultado = 'APROVADO' | 'APROVADO_COM_CORRECOES' | 'REPROVADO';

const NOME_RESULTADO: Record<Resultado, string> = {
  APROVADO: 'Aprovado', APROVADO_COM_CORRECOES: 'Aprovado com correções', REPROVADO: 'Reprovado',
};
/** Quem dá nota: presidente e titulares. Suplente só entra se substituir um titular. */
const AVALIADORES: Papel[] = ['PRESIDENTE', 'TITULAR'];

/**
 * RD09 – a defesa deve ser marcada no futuro e até a data-limite da etapa "Defesa"
 * do calendário do curso (UC13) no semestre da data escolhida.
 */
async function validarData(db: PoolClient, cursoId: number, dataHora: Date) {
  if (dataHora <= new Date()) throw new ErroNegocio(422, 'A data da defesa deve ser futura', 'RD09');
  const dia = diaEmManaus(dataHora);
  const semestre = semestreDe(dia);
  const { rows } = await db.query(
    "SELECT data_inicio, data_limite FROM calendario_etapa WHERE curso_id = $1 AND semestre = $2 AND etapa = 'DEFESA'",
    [cursoId, semestre],
  );
  const defesa = rows[0];
  const br = (d: string) => d.split('-').reverse().join('/');
  if (!defesa) {
    throw new ErroNegocio(422, `A coordenação ainda não cadastrou o calendário de ${semestre}. Sem ele não é possível marcar a defesa`, 'RD09');
  }
  if (dia > defesa.data_limite) {
    throw new ErroNegocio(422, `A defesa deve ser até ${br(defesa.data_limite)}, data-limite da etapa Defesa em ${semestre}`, 'RD09');
  }
  if (dia < defesa.data_inicio) {
    throw new ErroNegocio(422, `O período de defesas de ${semestre} começa em ${br(defesa.data_inicio)}`, 'RD09');
  }
}

/** Conflito de horário (2 horas): mesmo local ou algum membro já em outra banca. */
async function validarAgenda(db: PoolClient, dataHora: Date, local: string, membros: number[], bancaId: number | null) {
  const conflitos = await repo.conflitos(db, dataHora, local, membros, bancaId);
  if (!conflitos.length) return;
  const c = conflitos[0];
  const motivo = c.membros_em_comum ? `${c.membros_em_comum} já está em outra banca` : 'o local já está ocupado por outra banca';
  throw new ErroNegocio(409, `Conflito de agenda: ${motivo} às ${dataHoraBR(c.data_hora)}. Escolha outro horário`, 'RF17');
}

/** RD08 – banca com pelo menos 3 titulares (contando o presidente) e 1 suplente, sem repetir pessoas. */
async function validarComposicao(db: PoolClient, tcc: Tcc, membros: MembroInformado[]) {
  const ids = membros.map((m) => m.usuarioId);
  if (new Set(ids).size !== ids.length) throw new ErroNegocio(422, 'A mesma pessoa não pode aparecer duas vezes na banca', 'RD08');
  if (ids.includes(Number(tcc.orientador_id))) {
    throw new ErroNegocio(422, 'O orientador já é o presidente da banca; não o inclua de novo', 'RD08');
  }
  if (ids.includes(Number(tcc.aluno_id))) throw new ErroNegocio(422, 'O aluno não pode compor a própria banca', 'RD08');
  const titulares = 1 + membros.filter((m) => m.papel === 'TITULAR').length;
  const suplentes = membros.filter((m) => m.papel === 'SUPLENTE').length;
  if (titulares < 3 || suplentes < 1) {
    throw new ErroNegocio(422, `A banca precisa de pelo menos 3 titulares (contando o presidente) e 1 suplente. Informados: ${titulares} titular(es) e ${suplentes} suplente(s)`, 'RD08');
  }
  const usuarios = await repo.usuariosAtivos(db, ids);
  for (const id of ids) {
    const u = usuarios.find((x) => Number(x.id) === id);
    if (!u || !u.ativo || !['ORIENTADOR', 'MEMBRO_BANCA'].includes(u.perfil)) {
      throw new ErroNegocio(422, 'Os membros da banca devem ser professores ou membros de banca ativos', 'RD08');
    }
  }
}

/** A banca só pode ser vista por seus membros, pelo aluno e pela coordenação do curso. */
async function bancaVisivel(usuario: UsuarioLogadoLike, bancaId: number) {
  const banca = await repo.detalhe(pool, bancaId);
  if (!banca) throw naoEncontrado('Banca');
  const membro = banca.membros?.some((m: { usuarioId: number }) => m.usuarioId === usuario.id);
  const coordenacao = usuario.perfil === 'COORDENACAO' && usuario.cursoId === Number(banca.curso_id);
  if (!membro && !coordenacao && Number(banca.aluno_id) !== usuario.id) throw proibido();
  return banca;
}

async function papelNaBanca(db: PoolClient, bancaId: number, usuarioId: number) {
  return (await repo.membros(db, bancaId)).find((m) => Number(m.usuario_id) === usuarioId)?.papel;
}

async function bancaAgendadaDoPresidente(db: PoolClient, presidenteId: number, bancaId: number): Promise<Banca> {
  const banca = await repo.buscarPorId(db, bancaId, true);
  if (!banca) throw naoEncontrado('Banca');
  if ((await papelNaBanca(db, bancaId, presidenteId)) !== 'PRESIDENTE') throw proibido('Somente o presidente da banca pode fazer isso');
  if (banca.status !== 'AGENDADA') throw new ErroNegocio(422, 'Esta banca não está mais agendada');
  return banca;
}

export const bancasService = {
  membrosDisponiveis: () => repo.membrosDisponiveis(pool),
  minhas: (usuario: UsuarioLogadoLike) => repo.doUsuario(pool, usuario),
  detalhe: bancaVisivel,
  agendaPublica: (filtros: { cursoId?: number; mes?: string }) => repo.agendaPublica(pool, filtros),

  /** UC19 – Cadastrar banca de defesa (RF17, RD07, RD08, RD09). */
  async cadastrar(orientadorId: number, dados: DadosBanca) {
    return transacao(async (db) => {
      const tcc = await tccRepository.buscarPorId(db, dados.tccId, true);
      if (!tcc) throw naoEncontrado('TCC');
      if (Number(tcc.orientador_id) !== orientadorId) throw proibido('Somente o orientador do TCC pode cadastrar a banca');
      if (tcc.situacao !== 'APTO_DEFESA') {
        throw new ErroNegocio(422, 'A banca só pode ser cadastrada quando o TCC estiver "Apto à defesa"', 'RD07');
      }
      if (await repo.agendadaDoTcc(db, tcc.id)) throw new ErroNegocio(409, 'Este TCC já tem uma banca agendada. Use a opção de remarcar');
      await validarComposicao(db, tcc, dados.membros);
      await validarData(db, Number(tcc.curso_id), dados.dataHora);
      const todos = [orientadorId, ...dados.membros.map((m) => m.usuarioId)];
      await validarAgenda(db, dados.dataHora, dados.localOuLink, todos, null);

      const banca = await repo.inserir(db, { tccId: tcc.id, dataHora: dados.dataHora, localOuLink: dados.localOuLink, criadoPor: orientadorId });
      await repo.inserirMembro(db, banca.id, orientadorId, 'PRESIDENTE');
      for (const m of dados.membros) await repo.inserirMembro(db, banca.id, m.usuarioId, m.papel);

      const quando = `${dataHoraBR(dados.dataHora)}, ${dados.localOuLink}`;
      await registrarEvento(db, tcc.id, 'BANCA_AGENDADA', `Banca de defesa agendada para ${quando}`, orientadorId);
      await registrarAuditoria(db, { usuarioId: orientadorId, tabela: 'banca', registroId: Number(banca.id), operacao: 'INSERT', novo: { ...banca, membros: dados.membros } });
      for (const m of dados.membros) {
        await notificar(db, m.usuarioId, 'Convite para banca de defesa',
          `Você foi indicado(a) como ${m.papel === 'TITULAR' ? 'titular' : 'suplente'} na banca do TCC "${tcc.titulo}". Data: ${quando}`);
      }
      await notificar(db, Number(tcc.aluno_id), 'Sua defesa foi agendada', `Data: ${quando}`);
      if (tcc.coorientador_id) await notificar(db, Number(tcc.coorientador_id), 'Defesa agendada', `TCC "${tcc.titulo}". Data: ${quando}`);
      return repo.detalhe(db, banca.id);
    });
  },

  /** UC19 A1 – Remarcar a banca (presidente). */
  async remarcar(presidenteId: number, bancaId: number, dados: { dataHora: Date; localOuLink: string }) {
    return transacao(async (db) => {
      const banca = await bancaAgendadaDoPresidente(db, presidenteId, bancaId);
      const tcc = (await tccRepository.buscarPorId(db, Number(banca.tcc_id)))!;
      await validarData(db, Number(tcc.curso_id), dados.dataHora);
      const membros = await repo.membros(db, bancaId);
      await validarAgenda(db, dados.dataHora, dados.localOuLink, membros.map((m) => Number(m.usuario_id)), bancaId);
      const nova = await repo.remarcar(db, bancaId, dados.dataHora, dados.localOuLink);
      const quando = `${dataHoraBR(dados.dataHora)}, ${dados.localOuLink}`;
      await registrarEvento(db, tcc.id, 'BANCA_REMARCADA', `Banca remarcada para ${quando}`, presidenteId);
      await registrarAuditoria(db, { usuarioId: presidenteId, tabela: 'banca', registroId: bancaId, operacao: 'UPDATE', anterior: banca, novo: nova });
      for (const id of [Number(tcc.aluno_id), ...membros.map((m) => Number(m.usuario_id)).filter((id) => id !== presidenteId)]) {
        await notificar(db, id, 'Banca remarcada', `A banca do TCC "${tcc.titulo}" foi remarcada para ${quando}`);
      }
      return repo.detalhe(db, bancaId);
    });
  },

  /** UC20 passo 1 – cada titular (e o presidente) registra sua nota depois da defesa (RF18). */
  async registrarNota(membroId: number, bancaId: number, dados: { nota: number; parecer?: string | null }) {
    return transacao(async (db) => {
      const banca = await repo.buscarPorId(db, bancaId, true);
      if (!banca) throw naoEncontrado('Banca');
      const papel = await papelNaBanca(db, bancaId, membroId);
      if (!papel) throw proibido('Somente membros desta banca podem lançar nota');
      if (!AVALIADORES.includes(papel)) throw new ErroNegocio(422, 'Suplentes não lançam nota', 'RD08');
      if (banca.status !== 'AGENDADA') throw new ErroNegocio(422, 'O resultado desta banca já foi registrado');
      if (new Date(banca.data_hora) > new Date()) throw new ErroNegocio(422, 'A nota só pode ser lançada depois do horário da defesa');
      if ((await repo.notas(db, bancaId)).some((n) => Number(n.membro_id) === membroId)) {
        throw new ErroNegocio(409, 'Você já registrou sua nota nesta banca');
      }
      const nota = await repo.inserirNota(db, bancaId, membroId, dados.nota, dados.parecer ?? null);
      await registrarAuditoria(db, { usuarioId: membroId, tabela: 'nota_banca', registroId: bancaId, operacao: 'INSERT', novo: nota });

      const membros = await repo.membros(db, bancaId);
      const avaliadores = membros.filter((m) => AVALIADORES.includes(m.papel));
      const notas = await repo.notas(db, bancaId);
      if (notas.length === avaliadores.length) {
        const presidente = membros.find((m) => m.papel === 'PRESIDENTE')!;
        await notificar(db, Number(presidente.usuario_id), 'Todas as notas foram lançadas', 'Você já pode registrar o resultado da defesa.');
      }
      return { ...nota, faltam: avaliadores.length - notas.length };
    });
  },

  /** UC20 – Registrar resultado da defesa (RF19, RF20). */
  async registrarResultado(presidenteId: number, bancaId: number, dados: { resultado: Resultado; observacao?: string | null; ataUrl?: string | null }) {
    return transacao(async (db) => {
      const banca = await bancaAgendadaDoPresidente(db, presidenteId, bancaId);
      const membros = await repo.membros(db, bancaId);
      const notas = await repo.notas(db, bancaId);
      const faltando = membros.filter((m) => AVALIADORES.includes(m.papel) && !notas.some((n) => Number(n.membro_id) === Number(m.usuario_id)));
      if (faltando.length) {
        throw new ErroNegocio(422, `Ainda faltam as notas de: ${faltando.map((m) => m.nome).join(', ')}`, 'RF18');
      }
      const observacao = dados.observacao?.trim() || null;
      if (dados.resultado !== 'APROVADO' && !observacao) {
        throw new ErroNegocio(422, dados.resultado === 'REPROVADO'
          ? 'Informe a justificativa da reprovação' : 'Descreva as correções exigidas pela banca', 'RD11');
      }
      const notaFinal = Math.round((notas.reduce((s, n) => s + Number(n.nota), 0) / notas.length) * 100) / 100;
      const resultado = await repo.inserirResultado(db, {
        bancaId, resultado: dados.resultado, notaFinal, observacao, ataUrl: dados.ataUrl?.trim() || null, registradoPor: presidenteId,
      });
      await repo.mudarStatus(db, bancaId, 'REALIZADA');

      // Situação final do TCC: aprovado (com ou sem correções para a entrega definitiva) ou reprovado
      const tcc = (await tccRepository.buscarPorId(db, Number(banca.tcc_id), true))!;
      const situacao = dados.resultado === 'REPROVADO' ? 'REPROVADO' : 'APROVADO';
      const { rows } = await db.query(
        'UPDATE tcc SET situacao = $2, justificativa_situacao = $3 WHERE id = $1 RETURNING *',
        [tcc.id, situacao, observacao],
      );
      await orientacaoRepository.encerrarVinculos(db, tcc.id); // libera as vagas do orientador (RD05)

      const texto = `${NOME_RESULTADO[dados.resultado]} – nota final ${notaFinal.toFixed(2).replace('.', ',')}${observacao ? `. ${observacao}` : ''}`;
      await registrarEvento(db, tcc.id, 'DEFESA_REALIZADA', `Defesa realizada: ${texto}`, presidenteId);
      await registrarAuditoria(db, { usuarioId: presidenteId, tabela: 'resultado_defesa', registroId: bancaId, operacao: 'INSERT', novo: resultado });
      await registrarAuditoria(db, { usuarioId: presidenteId, tabela: 'tcc', registroId: Number(tcc.id), operacao: 'UPDATE', anterior: tcc, novo: rows[0] });
      await notificar(db, Number(tcc.aluno_id), 'Resultado da sua defesa', texto);
      await notificarCoordenacao(db, Number(tcc.curso_id), 'Resultado de defesa registrado', `TCC "${tcc.titulo}": ${texto}`);
      return repo.detalhe(db, bancaId);
    });
  },

  /** UC20 A1 – dados da ata de defesa (a tela gera o PDF com "Imprimir"). */
  async ata(usuario: UsuarioLogadoLike, bancaId: number) {
    const banca = await bancaVisivel(usuario, bancaId);
    if (banca.status !== 'REALIZADA') throw new ErroNegocio(422, 'A ata só fica disponível depois do registro do resultado');
    const notas = await repo.notas(pool, bancaId);
    return { ...banca, notas };
  },

  /** UC21 A1 – aluno ou orientador convidam a audiência por e-mail (até 20 endereços). */
  async convidar(usuario: UsuarioLogadoLike, bancaId: number, emails: string[]) {
    const banca = await bancaVisivel(usuario, bancaId);
    const ehPresidente = banca.membros.some((m: { usuarioId: number; papel: string }) => m.usuarioId === usuario.id && m.papel === 'PRESIDENTE');
    if (Number(banca.aluno_id) !== usuario.id && !ehPresidente) throw proibido('Somente o aluno ou o orientador podem enviar convites');
    if (banca.status !== 'AGENDADA' || new Date(banca.data_hora) < new Date()) throw new ErroNegocio(422, 'Só é possível convidar para defesas futuras');
    const unicos = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
    const texto = `Você está convidado(a) para a defesa do TCC "${banca.titulo}", de ${banca.aluno} (${banca.curso}).\n`
      + `Data: ${dataHoraBR(banca.data_hora)}\nLocal ou link: ${banca.local_ou_link}`;
    for (const e of unicos) await emailService.enviar(e, '[SAG-TCC] Convite para defesa de TCC', texto);
    await registrarEvento(pool, Number(banca.tcc_id), 'CONVITES_ENVIADOS', `${unicos.length} convite(s) enviado(s) para a defesa`, usuario.id);
    return { enviados: unicos.length };
  },
};
