import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { pool, transacao } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado, proibido } from '../../shared/errors.js';
import { registrarAuditoria, registrarEvento } from '../../shared/auditoria.js';
import { emailService, notificar, notificarCoordenacao } from '../../shared/notificacao.js';
import { dataHoraBR, diaEmManaus, semestreDe, type UsuarioLogadoLike } from '../../shared/util.js';
import { gerarCodigo, hashDe, lerPdf } from '../../shared/documentos.js';
import { tccRepository, type Tcc } from '../propostas/tcc.repository.js';
import { orientacaoRepository } from '../orientacao/orientacao.repository.js';
import { bancasRepository as repo, type Banca, type Papel } from './bancas.repository.js';

export interface MembroInformado { usuarioId: number; papel: 'TITULAR' | 'SUPLENTE' }
export interface DadosBanca { tccId: number; dataHora: Date; localOuLink: string; membros: MembroInformado[] }
export type Resultado = 'APROVADO' | 'APROVADO_COM_CORRECOES' | 'REPROVADO';

/** Regras que cada curso configura (tela Cursos e regras). */
async function regrasDoCurso(db: PoolClient | typeof pool, cursoId: number) {
  const { rows } = await db.query(
    'SELECT nota_minima, min_titulares, min_suplentes, dias_correcoes, notas_individuais_aluno FROM curso WHERE id = $1', [cursoId],
  );
  return rows[0] as { nota_minima: number; min_titulares: number; min_suplentes: number; dias_correcoes: number; notas_individuais_aluno: boolean };
}

const somaDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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

/** RD08 – banca com o mínimo de titulares (contando o presidente) e de suplentes do curso (padrão: 3 e 1), sem repetir pessoas. */
async function validarComposicao(db: PoolClient, tcc: Tcc, membros: MembroInformado[]) {
  const ids = membros.map((m) => m.usuarioId);
  if (new Set(ids).size !== ids.length) throw new ErroNegocio(422, 'A mesma pessoa não pode aparecer duas vezes na banca', 'RD08');
  if (ids.includes(Number(tcc.orientador_id))) {
    throw new ErroNegocio(422, 'O orientador já é o presidente da banca; não o inclua de novo', 'RD08');
  }
  if (ids.includes(Number(tcc.aluno_id))) throw new ErroNegocio(422, 'O aluno não pode compor a própria banca', 'RD08');
  const titulares = 1 + membros.filter((m) => m.papel === 'TITULAR').length;
  const suplentes = membros.filter((m) => m.papel === 'SUPLENTE').length;
  const regras = await regrasDoCurso(db, Number(tcc.curso_id));
  if (titulares < regras.min_titulares || suplentes < regras.min_suplentes) {
    throw new ErroNegocio(422, `A banca precisa de pelo menos ${regras.min_titulares} titulares (contando o presidente) e ${regras.min_suplentes} suplente(s). Informados: ${titulares} titular(es) e ${suplentes} suplente(s)`, 'RD08');
  }
  const usuarios = await repo.usuariosAtivos(db, ids);
  for (const id of ids) {
    const u = usuarios.find((x) => Number(x.id) === id);
    if (!u || !u.ativo || !['ORIENTADOR', 'MEMBRO_BANCA', 'COORDENACAO'].includes(u.perfil)) {
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

/**
 * Conteúdo da ata que é assinado. O hash deste conteúdo fica guardado em cada assinatura:
 * se uma nota for corrigida depois, o hash muda e a assinatura antiga deixa de valer.
 */
async function conteudoAta(db: PoolClient | typeof pool, bancaId: number) {
  const banca = await repo.detalhe(db, bancaId);
  const notas = await repo.notas(db, bancaId);
  return {
    banca: Number(banca.id), titulo: banca.titulo, subtitulo: banca.subtitulo, aluno: banca.aluno, curso: banca.curso_nome,
    dataHora: new Date(banca.data_hora).toISOString(), local: banca.local_ou_link,
    resultado: banca.resultado, notaFinal: Number(banca.nota_final), observacao: banca.observacao,
    notas: notas.map((n) => ({ membro: Number(n.membro_id), nota: Number(n.nota), parecer: n.parecer ?? null }))
      .sort((a, b) => a.membro - b.membro),
  };
}

/** Situação das assinaturas da ata: quem já assinou (e se ainda vale) e quem falta. */
async function situacaoAssinaturas(db: PoolClient | typeof pool, bancaId: number) {
  const hashAtual = hashDe(await conteudoAta(db, bancaId));
  const membros = await repo.membros(db, bancaId);
  const assinaturas = await repo.assinaturas(db, bancaId);
  const avaliadores = membros.filter((m) => AVALIADORES.includes(m.papel));
  const lista = avaliadores.map((m) => {
    const a = assinaturas.find((x) => Number(x.usuario_id) === Number(m.usuario_id));
    return {
      usuarioId: Number(m.usuario_id), nome: m.nome, papel: m.papel,
      assinadoEm: a?.assinado_em ?? null, valida: !!a && a.hash_conteudo === hashAtual,
    };
  });
  const completa = lista.every((a) => a.valida);
  return { hashAtual, assinaturas: lista, completa };
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
  async registrarResultado(presidenteId: number, bancaId: number, dados: { resultado: Resultado; observacao?: string | null; ataUrl?: string | null; prazoCorrecoes?: string | null }) {
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
      const tcc = (await tccRepository.buscarPorId(db, Number(banca.tcc_id), true))!;
      const regras = await regrasDoCurso(db, Number(tcc.curso_id));
      const virgula = (n: number) => n.toFixed(2).replace('.', ',');
      if (dados.resultado !== 'REPROVADO' && notaFinal < Number(regras.nota_minima)) {
        throw new ErroNegocio(422, `A média das notas (${virgula(notaFinal)}) ficou abaixo da nota mínima do curso (${virgula(Number(regras.nota_minima))}). Com essa média o resultado deve ser "Reprovado"`);
      }
      // Aprovado com correções: a banca dá um prazo para a entrega definitiva corrigida (padrão do curso se não informar)
      let prazoCorrecoes: string | null = null;
      if (dados.resultado === 'APROVADO_COM_CORRECOES') {
        prazoCorrecoes = dados.prazoCorrecoes || somaDias(diaEmManaus(), regras.dias_correcoes);
        if (prazoCorrecoes <= diaEmManaus()) throw new ErroNegocio(422, 'O prazo para as correções deve ser uma data futura');
      }
      const resultado = await repo.inserirResultado(db, {
        bancaId, resultado: dados.resultado, notaFinal, observacao, ataUrl: dados.ataUrl?.trim() || null, registradoPor: presidenteId,
      });
      await repo.mudarStatus(db, bancaId, 'REALIZADA');
      await db.query('UPDATE banca SET codigo_verificacao = $2 WHERE id = $1', [bancaId, gerarCodigo()]);

      // Situação final do TCC: aprovado (com ou sem correções para a entrega definitiva) ou reprovado
      const situacao = dados.resultado === 'REPROVADO' ? 'REPROVADO' : 'APROVADO';
      const { rows } = await db.query(
        `UPDATE tcc SET situacao = $2, justificativa_situacao = $3, correcoes_pendentes = $4, prazo_correcoes = $5, correcoes_alerta = NULL
         WHERE id = $1 RETURNING *`,
        [tcc.id, situacao, observacao, !!prazoCorrecoes, prazoCorrecoes],
      );
      await orientacaoRepository.encerrarVinculos(db, tcc.id); // libera as vagas do orientador (RD05)

      const prazoTexto = prazoCorrecoes ? `. Prazo para entregar o TCC corrigido: ${prazoCorrecoes.split('-').reverse().join('/')}` : '';
      const texto = `${NOME_RESULTADO[dados.resultado]} – nota final ${virgula(notaFinal)}${observacao ? `. ${observacao}` : ''}${prazoTexto}`;
      await registrarEvento(db, tcc.id, 'DEFESA_REALIZADA', `Defesa realizada: ${texto}`, presidenteId);
      await registrarAuditoria(db, { usuarioId: presidenteId, tabela: 'resultado_defesa', registroId: bancaId, operacao: 'INSERT', novo: resultado });
      await registrarAuditoria(db, { usuarioId: presidenteId, tabela: 'tcc', registroId: Number(tcc.id), operacao: 'UPDATE', anterior: tcc, novo: rows[0] });
      await notificar(db, Number(tcc.aluno_id), 'Resultado da sua defesa', texto);
      await notificarCoordenacao(db, Number(tcc.curso_id), 'Resultado de defesa registrado', `TCC "${tcc.titulo}": ${texto}`);
      for (const m of membros.filter((x) => AVALIADORES.includes(x.papel))) {
        await notificar(db, Number(m.usuario_id), 'Assine a ata da defesa', `A ata da defesa do TCC "${tcc.titulo}" está pronta. Abra a ata no sistema e assine eletronicamente.`);
      }
      return repo.detalhe(db, bancaId);
    });
  },

  /** UC20 A1 – dados da ata de defesa (a tela gera o PDF com "Imprimir"). */
  async ata(usuario: UsuarioLogadoLike, bancaId: number) {
    const banca = await bancaVisivel(usuario, bancaId);
    if (banca.status !== 'REALIZADA') throw new ErroNegocio(422, 'A ata só fica disponível depois do registro do resultado');
    const notas = await repo.notas(pool, bancaId);
    // Privacidade: o aluno vê a nota final e os pareceres; a nota de cada membro só se o curso permitir
    const ehAluno = Number(banca.aluno_id) === usuario.id;
    const notasIndividuaisOcultas = ehAluno && !banca.notas_individuais_aluno;
    const { assinaturas, completa } = await situacaoAssinaturas(pool, bancaId);
    return {
      ...banca,
      notas: notas.map((n) => ({ ...n, nota: notasIndividuaisOcultas ? null : n.nota })),
      notasIndividuaisOcultas,
      assinaturas,
      assinaturaCompleta: completa,
      ataDigitalizada: banca.ata_digitalizada_nome ? { nome: banca.ata_digitalizada_nome, enviadaEm: banca.ata_digitalizada_em } : null,
    };
  },

  /** Assinatura eletrônica da ata: o avaliador confirma com a própria senha (Lei 14.063/2020, assinatura simples). */
  async assinarAta(usuarioId: number, bancaId: number, senha: string) {
    return transacao(async (db) => {
      const banca = await repo.buscarPorId(db, bancaId, true);
      if (!banca) throw naoEncontrado('Banca');
      if (banca.status !== 'REALIZADA') throw new ErroNegocio(422, 'A ata só pode ser assinada depois do registro do resultado');
      const papel = await papelNaBanca(db, bancaId, usuarioId);
      if (!papel || !AVALIADORES.includes(papel)) throw proibido('Somente o presidente e os titulares que avaliaram assinam a ata');
      const { rows } = await db.query('SELECT senha_hash FROM usuario WHERE id = $1', [usuarioId]);
      // 422 (e não 401) para a tela não entender como "sessão expirada"
      if (!rows[0]?.senha_hash || !(await bcrypt.compare(senha, rows[0].senha_hash))) throw new ErroNegocio(422, 'Senha incorreta');

      const { hashAtual, assinaturas } = await situacaoAssinaturas(db, bancaId);
      if (assinaturas.find((a) => a.usuarioId === usuarioId)?.valida) throw new ErroNegocio(409, 'Você já assinou esta ata');
      await db.query(
        `INSERT INTO ata_assinatura (banca_id, usuario_id, hash_conteudo) VALUES ($1, $2, $3)
         ON CONFLICT (banca_id, usuario_id) DO UPDATE SET hash_conteudo = EXCLUDED.hash_conteudo, assinado_em = now()`,
        [bancaId, usuarioId, hashAtual],
      );
      await registrarAuditoria(db, { usuarioId, tabela: 'ata_assinatura', registroId: bancaId, operacao: 'INSERT', novo: { bancaId, usuarioId, hash: hashAtual } });
      const depois = await situacaoAssinaturas(db, bancaId);
      const detalhe = await repo.detalhe(db, bancaId);
      const quem = depois.assinaturas.find((a) => a.usuarioId === usuarioId)!;
      await registrarEvento(db, Number(banca.tcc_id), 'ATA_ASSINADA', `Ata da defesa assinada eletronicamente por ${quem.nome}`, usuarioId);
      if (depois.completa) {
        await registrarEvento(db, Number(banca.tcc_id), 'ATA_COMPLETA', 'A ata da defesa foi assinada por todos os avaliadores', null);
        await notificar(db, Number(detalhe.aluno_id), 'Ata da defesa assinada', 'Todos os membros da banca assinaram a ata. Ela já pode ser consultada no sistema.');
        await notificarCoordenacao(db, Number(detalhe.curso_id), 'Ata de defesa assinada', `A ata do TCC "${detalhe.titulo}" foi assinada por todos.`);
      }
      return { assinaturas: depois.assinaturas, assinaturaCompleta: depois.completa };
    });
  },

  /** Alternativa à assinatura eletrônica: a ata impressa, assinada à mão e escaneada em PDF. */
  async enviarAtaDigitalizada(usuario: UsuarioLogadoLike, bancaId: number, arquivo: { arquivoNome: string; arquivoBase64: string }) {
    const bytes = lerPdf(arquivo.arquivoNome, arquivo.arquivoBase64);
    return transacao(async (db) => {
      const banca = await repo.buscarPorId(db, bancaId, true);
      if (!banca) throw naoEncontrado('Banca');
      const detalhe = await repo.detalhe(db, bancaId);
      const presidente = (await papelNaBanca(db, bancaId, usuario.id)) === 'PRESIDENTE';
      const coordenacao = usuario.perfil === 'COORDENACAO' && usuario.cursoId === Number(detalhe.curso_id);
      if (!presidente && !coordenacao) throw proibido('Somente o presidente da banca ou a coordenação enviam a ata assinada');
      if (banca.status !== 'REALIZADA') throw new ErroNegocio(422, 'A ata só existe depois do registro do resultado');
      await db.query(
        'UPDATE banca SET ata_digitalizada = $2, ata_digitalizada_nome = $3, ata_digitalizada_em = now(), ata_digitalizada_por = $4 WHERE id = $1',
        [bancaId, bytes, arquivo.arquivoNome, usuario.id],
      );
      await registrarAuditoria(db, { usuarioId: usuario.id, tabela: 'banca', registroId: bancaId, operacao: 'UPDATE', novo: { ataDigitalizada: arquivo.arquivoNome, tamanho: bytes.length } });
      await registrarEvento(db, Number(banca.tcc_id), 'ATA_DIGITALIZADA', 'Ata assinada à mão enviada em PDF', usuario.id);
      await notificar(db, Number(detalhe.aluno_id), 'Ata da defesa disponível', 'A ata assinada pela banca foi enviada em PDF e já pode ser baixada no sistema.');
      return { nome: arquivo.arquivoNome, enviadaEm: new Date() };
    });
  },

  async ataDigitalizada(usuario: UsuarioLogadoLike, bancaId: number) {
    await bancaVisivel(usuario, bancaId);
    const { rows } = await pool.query('SELECT ata_digitalizada AS arquivo, ata_digitalizada_nome AS arquivo_nome FROM banca WHERE id = $1', [bancaId]);
    if (!rows[0]?.arquivo) throw naoEncontrado('Ata assinada');
    return rows[0] as { arquivo: Buffer; arquivo_nome: string };
  },

  /**
   * Correção de nota já lançada: só a coordenação do curso, com justificativa (fica na auditoria).
   * Se a defesa já tem resultado, a média é recalculada e as assinaturas da ata precisam ser refeitas.
   */
  async corrigirNota(coordenacao: UsuarioLogadoLike, bancaId: number, membroId: number, dados: { nota: number; justificativa: string }) {
    return transacao(async (db) => {
      const banca = await repo.buscarPorId(db, bancaId, true);
      if (!banca) throw naoEncontrado('Banca');
      const detalhe = await repo.detalhe(db, bancaId);
      if (coordenacao.cursoId !== Number(detalhe.curso_id)) throw proibido('A banca é de outro curso');
      if (banca.status === 'CANCELADA') throw new ErroNegocio(422, 'Esta banca foi cancelada');
      const justificativa = dados.justificativa?.trim();
      if (!justificativa) throw new ErroNegocio(422, 'Informe a justificativa da correção', 'RD11');
      const { rows: [anterior] } = await db.query('SELECT * FROM nota_banca WHERE banca_id = $1 AND membro_id = $2 FOR UPDATE', [bancaId, membroId]);
      if (!anterior) throw naoEncontrado('Nota');
      const { rows: [nova] } = await db.query(
        'UPDATE nota_banca SET nota = $3 WHERE banca_id = $1 AND membro_id = $2 RETURNING *', [bancaId, membroId, dados.nota],
      );
      await registrarAuditoria(db, { usuarioId: coordenacao.id, tabela: 'nota_banca', registroId: bancaId, operacao: 'UPDATE', anterior, novo: { ...nova, justificativa } });

      let notaFinal: number | null = null;
      if (banca.status === 'REALIZADA') {
        const notas = await repo.notas(db, bancaId);
        notaFinal = Math.round((notas.reduce((s, n) => s + Number(n.nota), 0) / notas.length) * 100) / 100;
        await db.query('UPDATE resultado_defesa SET nota_final = $2 WHERE banca_id = $1', [bancaId, notaFinal]);
        for (const m of (await repo.membros(db, bancaId)).filter((x) => AVALIADORES.includes(x.papel))) {
          await notificar(db, Number(m.usuario_id), 'Ata alterada: assine de novo',
            `A coordenação corrigiu uma nota na ata do TCC "${detalhe.titulo}". Motivo: ${justificativa}. Confira e assine a ata novamente.`);
        }
      }
      await registrarEvento(db, Number(banca.tcc_id), 'NOTA_CORRIGIDA', `A coordenação corrigiu uma nota da banca. Justificativa: ${justificativa}`, coordenacao.id);
      return { ...nova, notaFinal };
    });
  },

  /** O suplente assume o lugar de um titular que não pode participar (presidente, banca agendada). */
  async substituir(presidenteId: number, bancaId: number, dados: { titularId: number; suplenteId: number }) {
    return transacao(async (db) => {
      const banca = await bancaAgendadaDoPresidente(db, presidenteId, bancaId);
      const membros = await repo.membros(db, bancaId);
      const titular = membros.find((m) => Number(m.usuario_id) === dados.titularId);
      const suplente = membros.find((m) => Number(m.usuario_id) === dados.suplenteId);
      if (!titular || titular.papel !== 'TITULAR') throw new ErroNegocio(422, 'Escolha um titular desta banca (o presidente não pode ser substituído)');
      if (!suplente || suplente.papel !== 'SUPLENTE') throw new ErroNegocio(422, 'Escolha um suplente desta banca');
      if ((await repo.notas(db, bancaId)).some((n) => Number(n.membro_id) === dados.titularId)) {
        throw new ErroNegocio(422, 'Este titular já lançou nota e não pode mais ser substituído');
      }
      await db.query("UPDATE banca_membro SET papel = 'SUPLENTE' WHERE banca_id = $1 AND usuario_id = $2", [bancaId, dados.titularId]);
      await db.query("UPDATE banca_membro SET papel = 'TITULAR' WHERE banca_id = $1 AND usuario_id = $2", [bancaId, dados.suplenteId]);
      await registrarAuditoria(db, { usuarioId: presidenteId, tabela: 'banca_membro', registroId: bancaId, operacao: 'UPDATE',
        anterior: { titular: dados.titularId, suplente: dados.suplenteId }, novo: { titular: dados.suplenteId, suplente: dados.titularId } });
      await registrarEvento(db, Number(banca.tcc_id), 'BANCA_SUBSTITUICAO', `${suplente.nome} (suplente) assumiu o lugar de ${titular.nome} na banca`, presidenteId);
      const detalhe = await repo.detalhe(db, bancaId);
      await notificar(db, dados.suplenteId, 'Você agora é titular da banca', `Você vai avaliar o TCC "${detalhe.titulo}" no lugar de ${titular.nome}. Data: ${dataHoraBR(banca.data_hora)}.`);
      await notificar(db, dados.titularId, 'Você foi substituído(a) na banca', `${suplente.nome} assumiu o seu lugar na banca do TCC "${detalhe.titulo}".`);
      return detalhe;
    });
  },

  /** Cancelar a banca agendada (presidente ou coordenação do curso), com motivo. */
  async cancelar(usuario: UsuarioLogadoLike, bancaId: number, motivo: string) {
    return transacao(async (db) => {
      const banca = await repo.buscarPorId(db, bancaId, true);
      if (!banca) throw naoEncontrado('Banca');
      const detalhe = await repo.detalhe(db, bancaId);
      const presidente = (await papelNaBanca(db, bancaId, usuario.id)) === 'PRESIDENTE';
      const coordenacao = usuario.perfil === 'COORDENACAO' && usuario.cursoId === Number(detalhe.curso_id);
      if (!presidente && !coordenacao) throw proibido('Somente o presidente da banca ou a coordenação podem cancelar');
      if (banca.status !== 'AGENDADA') throw new ErroNegocio(422, 'Só é possível cancelar uma banca agendada');
      if (!motivo?.trim()) throw new ErroNegocio(422, 'Informe o motivo do cancelamento', 'RD11');
      await db.query("UPDATE banca SET status = 'CANCELADA', motivo_cancelamento = $2 WHERE id = $1", [bancaId, motivo.trim()]);
      await registrarAuditoria(db, { usuarioId: usuario.id, tabela: 'banca', registroId: bancaId, operacao: 'UPDATE', anterior: banca, novo: { ...banca, status: 'CANCELADA', motivo_cancelamento: motivo.trim() } });
      await registrarEvento(db, Number(banca.tcc_id), 'BANCA_CANCELADA', `Banca de ${dataHoraBR(banca.data_hora)} cancelada. Motivo: ${motivo.trim()}`, usuario.id);
      const avisar = [Number(detalhe.aluno_id), ...(await repo.membros(db, bancaId)).map((m) => Number(m.usuario_id))].filter((id) => id !== usuario.id);
      for (const id of avisar) {
        await notificar(db, id, 'Banca cancelada', `A banca do TCC "${detalhe.titulo}" marcada para ${dataHoraBR(banca.data_hora)} foi cancelada. Motivo: ${motivo.trim()}`);
      }
      return repo.detalhe(db, bancaId);
    });
  },

  /** Arquivo de agenda (.ics) para a pessoa colocar a defesa no calendário do celular ou do Google. */
  async arquivoAgenda(usuario: UsuarioLogadoLike, bancaId: number) {
    const b = await bancaVisivel(usuario, bancaId);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const inicio = new Date(b.data_hora);
    const fim = new Date(inicio.getTime() + 2 * 3600 * 1000);
    const esc = (t: string) => String(t).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UEA//SAG-TCC//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:banca-${b.id}@sag-tcc`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(inicio)}`, `DTEND:${fmt(fim)}`,
      `SUMMARY:${esc(`Defesa de TCC – ${b.aluno}`)}`,
      `DESCRIPTION:${esc(`TCC: ${b.titulo}\nCurso: ${b.curso_nome}`)}`,
      `LOCATION:${esc(b.local_ou_link)}`,
      'BEGIN:VALARM', 'TRIGGER:-PT24H', 'ACTION:DISPLAY', 'DESCRIPTION:Defesa de TCC amanhã', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
  },

  /** Verificação pública de uma ata pelo código (sem login). Mostra só o necessário para conferir a autenticidade. */
  async verificarAta(codigo: string) {
    const { rows } = await pool.query('SELECT id FROM banca WHERE codigo_verificacao = $1', [codigo]);
    if (!rows[0]) return null;
    const bancaId = Number(rows[0].id);
    const b = await repo.detalhe(pool, bancaId);
    const { assinaturas, completa } = await situacaoAssinaturas(pool, bancaId);
    return {
      tipo: 'ATA_DEFESA', codigo, titulo: b.titulo, aluno: b.aluno, curso: b.curso_nome, dataHora: b.data_hora,
      resultado: b.resultado, assinaturas: assinaturas.map(({ nome, papel, assinadoEm, valida }) => ({ nome, papel, assinadoEm, valida })),
      assinaturaCompleta: completa, ataDigitalizada: !!b.ata_digitalizada_nome,
    };
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
