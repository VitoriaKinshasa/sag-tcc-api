// Tela inicial de cada perfil: saudação, "Para fazer" (só quando há algo), etapas do TCC e avisos recentes.
import { Check, ClipboardList, FileText, Send, Upload, UserRoundSearch } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useUsuario } from '../auth';
import { ParaFazer, Secao, type ItemFazer } from '../components/blocos';
import { Estado, SeloSituacao } from '../components/ui';
import { talvez, useCarregar } from '../hooks';
import type { Banca, Calendario, Notificacao, Orientando, PrazoEtapa, Prazos, Tcc, TccCurso, Usuario, Versao } from '../types';
import { dia, mesmoId, NOME_ETAPA, primeiroNome, semestreAtual, SITUACOES } from '../util';
import { buscarMeuTcc } from './aluno/MeuTcc';

const FUSO = 'America/Manaus';
const diaMes = (v: string) => new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO });
const hora = (v: string) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function saudacao() {
  const h = Number(new Date().toLocaleString('pt-BR', { hour: 'numeric', hour12: false, timeZone: FUSO }));
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

interface Me { nome: string; curso: string | null; externo: boolean; instituicao: string | null }

/** "Professora" / "Professor" pelo título do nome (Profa./Prof.); sem título, "Professor(a)". */
function tituloProfessor(nome: string) {
  if (/^profa\.?\s/i.test(nome)) return 'Professora';
  if (/^prof\.?\s/i.test(nome)) return 'Professor';
  return 'Professor(a)';
}

/** A linha embaixo da saudação: curso do aluno ou "Professor(a)". */
function subtitulo(u: Usuario, me: Me | null) {
  const est = 'Escola Superior de Tecnologia';
  switch (u.perfil) {
    case 'ALUNO': return me?.curso ? `${me.curso} · ${est}` : est;
    case 'ORIENTADOR': return `${tituloProfessor(u.nome)} · ${est}`;
    case 'COORDENACAO': return `${tituloProfessor(u.nome)} · Coordenação${me?.curso ? ` de ${me.curso}` : ''}`;
    case 'MEMBRO_BANCA': return me?.externo ? `Membro de banca${me.instituicao ? ` · ${me.instituicao}` : ''}` : `${tituloProfessor(u.nome)} · ${est}`;
  }
}

export function Inicio() {
  const u = useUsuario();
  const me = useCarregar(() => talvez(api<Me>('GET', '/me')), []);
  const conteudo: Record<typeof u.perfil, ReactNode> = {
    ALUNO: <InicioAluno />, ORIENTADOR: <InicioOrientador />, MEMBRO_BANCA: <InicioMembro />, COORDENACAO: <InicioCoordenacao />,
  };
  return (
    <section className="pagina inicio">
      <div className="boas-vindas">
        <h1>{saudacao()}, {primeiroNome(u.nome)}</h1>
        <p>{subtitulo(u, me.dados ?? null)}</p>
      </div>
      {conteudo[u.perfil]}
    </section>
  );
}

/** Avisos recentes: lista simples com a data à direita. Aparece para todos os perfis. */
function AvisosRecentes({ notificacoes }: { notificacoes: Notificacao[] }) {
  return (
    <Secao titulo="Avisos recentes">
      {notificacoes.length === 0 ? <p className="texto-calmo">Nenhum aviso por enquanto.</p> : (
        <>
          <ul className="linhas">
            {notificacoes.slice(0, 5).map((n) => (
              <li key={n.id} className={n.lida ? '' : 'nao-lida'}>
                <span>{n.titulo}</span>
                <time className="linha-data">{diaMes(n.criado_em)}</time>
              </li>
            ))}
          </ul>
          <Link to="/notificacoes" className="link-depois">Ver todos os avisos</Link>
        </>
      )}
    </Secao>
  );
}

/* ---------------------------------------------------------------- Aluno */

type EstadoEtapa = 'feito' | 'atual' | 'atrasado' | 'futuro';
interface Etapa { nome: string; estado: EstadoEtapa }

const DEPOIS_DA_DEFESA = ['APROVADO', 'APROVADO_PUBLICACAO', 'REPROVADO', 'NAO_APRESENTADO'];

/** Etapas do TCC: proposta → orientador → qualificação → versão final → defesa → entrega definitiva. */
function montarEtapas(tcc: Tcc, prazos: Prazos | null, defesa: Banca | undefined): Etapa[] {
  const prazo = (e: PrazoEtapa['etapa']) => prazos?.etapas.find((x) => x.etapa === e);
  const jaPassou = tcc.situacao === 'APTO_DEFESA' || DEPOIS_DA_DEFESA.includes(tcc.situacao);
  const entrega = (nome: string, e: PrazoEtapa['etapa']): Etapa => {
    const p = prazo(e);
    if (p?.situacao === 'ENTREGUE' || jaPassou) return { nome, estado: 'feito' };
    return { nome, estado: p?.situacao === 'ATRASADA' ? 'atrasado' : 'futuro' };
  };
  const etapas: Etapa[] = [
    { nome: 'Proposta', estado: 'feito' },
    { nome: 'Orientador', estado: tcc.orientador_id ? 'feito' : 'futuro' },
    entrega('Qualificação', 'QUALIFICACAO'),
    entrega('Versão final', 'VERSAO_FINAL'),
    { nome: 'Defesa', estado: defesa?.status === 'REALIZADA' || DEPOIS_DA_DEFESA.includes(tcc.situacao) ? 'feito' : 'futuro' },
    { nome: 'Entrega definitiva', estado: tcc.concluido_em ? 'feito' : 'futuro' },
  ];
  // A primeira etapa ainda não feita é onde o aluno está
  const atual = etapas.find((e) => e.estado !== 'feito');
  if (atual && atual.estado === 'futuro') atual.estado = 'atual';
  return etapas;
}

function Etapas({ etapas }: { etapas: Etapa[] }) {
  return (
    <ol className="etapas">
      {etapas.map((e) => (
        <li key={e.nome} className={e.estado} aria-current={e.estado === 'atual' ? 'step' : undefined}>
          <span className="etapa-circulo" aria-hidden="true">{e.estado === 'feito' ? <Check /> : <span />}</span>
          <span className="etapa-nome">
            {e.nome}
            {e.estado === 'atual' && <small>Você está aqui</small>}
            {e.estado === 'atrasado' && <small>Atrasada</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** O que o aluno precisa fazer agora. Lista vazia = nada a fazer (o bloco não aparece). */
function fazerAluno(tcc: Tcc, prazos: Prazos | null): ItemFazer[] {
  if (tcc.concluido_em || ['REPROVADO', 'NAO_APRESENTADO', 'CANCELADO'].includes(tcc.situacao)) return [];
  const faltam = (dias: number | null | undefined) =>
    dias == null ? null : dias < 0 ? 'prazo vencido' : dias === 0 ? 'vence hoje' : `faltam ${plural(dias, 'dia', 'dias')}`;

  if (tcc.correcoes_pendentes && tcc.prazo_correcoes) {
    const dias = prazos?.correcoes?.dias;
    return [{ titulo: 'Enviar o texto corrigido', prazo: `até ${dia(tcc.prazo_correcoes)}`, destaque: faltam(dias), urgente: dias != null && dias <= 3,
      acao: { texto: 'Enviar', para: '/versoes?enviar=1', icone: Upload } }];
  }
  if (!tcc.orientador_id) {
    return [{ titulo: 'Escolher o seu orientador', prazo: 'a sua proposta já foi enviada', acao: { texto: 'Escolher', para: '/meu-tcc', icone: UserRoundSearch } }];
  }
  const pendente = prazos?.etapas.find((e) => e.exigeEntrega && (e.situacao === 'PENDENTE' || e.situacao === 'ATRASADA'));
  if (pendente) {
    const atrasada = pendente.situacao === 'ATRASADA';
    return [{ titulo: `Enviar a ${NOME_ETAPA[pendente.etapa].toLowerCase()}`, prazo: `até ${dia(pendente.dataLimite)}`,
      destaque: atrasada ? 'prazo vencido' : faltam(pendente.dias), urgente: atrasada || (pendente.dias != null && pendente.dias <= 3),
      acao: { texto: 'Enviar', para: '/versoes?enviar=1', icone: Upload } }];
  }
  if (tcc.situacao === 'APROVADO' || tcc.situacao === 'APROVADO_PUBLICACAO') {
    return [{ titulo: 'Enviar a entrega definitiva', prazo: 'o TCC é concluído quando o orientador aprovar', acao: { texto: 'Enviar', para: '/versoes?enviar=1', icone: Upload } }];
  }
  return [];
}

function InicioAluno() {
  const c = useCarregar(async () => {
    const [tcc, notificacoes] = await Promise.all([buscarMeuTcc(), api<Notificacao[]>('GET', '/notificacoes')]);
    if (!tcc) return { tcc: null, notificacoes } as const;
    const [prazos, bancas] = await Promise.all([talvez(api<Prazos>('GET', `/tccs/${tcc.id}/prazos`)), api<Banca[]>('GET', '/bancas/minhas')]);
    return { tcc, prazos, bancas, notificacoes };
  }, []);

  return (
    <Estado c={c}>
      {(d) => {
        if (!d.tcc) {
          return (
            <>
              <ParaFazer itens={[{ titulo: 'Enviar a sua proposta de TCC', prazo: 'título, resumo e área do trabalho', acao: { texto: 'Fazer proposta', para: '/meu-tcc?proposta=1', icone: FileText } }]} />
              <AvisosRecentes notificacoes={d.notificacoes} />
            </>
          );
        }
        const { tcc, prazos, bancas, notificacoes } = d;
        const defesa = bancas.find((b) => b.status === 'AGENDADA') ?? bancas.find((b) => b.status === 'REALIZADA');
        return (
          <>
            <ParaFazer itens={fazerAluno(tcc, prazos)} />
            <Secao titulo="Etapas do TCC">
              <Etapas etapas={montarEtapas(tcc, prazos, defesa)} />
            </Secao>
            <AvisosRecentes notificacoes={notificacoes} />
          </>
        );
      }}
    </Estado>
  );
}

/* ---------------------------------------------------------------- Professores */

function ProximasBancas({ bancas, vazio }: { bancas: Banca[]; vazio: string }) {
  const proximas = bancas.filter((b) => b.status === 'AGENDADA').slice(0, 5);
  return (
    <Secao titulo="Próximas bancas">
      {!proximas.length ? <p className="texto-calmo">{vazio}</p> : (
        <>
          <ul className="linhas">
            {proximas.map((b) => (
              <li key={b.id}>
                <span>{b.aluno}<small className="bloco">{b.titulo}</small></span>
                <time className="linha-data">{diaMes(b.data_hora)} · {hora(b.data_hora)}</time>
              </li>
            ))}
          </ul>
          <Link to="/bancas" className="link-depois">Ver todas as bancas</Link>
        </>
      )}
    </Secao>
  );
}

const esperandoNota = (b: Banca) => b.status === 'AGENDADA' && new Date(b.data_hora) <= new Date();

/** Tarefas com contagem viram itens de "Para fazer" (só as que têm algo). */
function itensContados(lista: { n: number; titulo: string; para: string; urgente?: boolean }[]): ItemFazer[] {
  return lista.filter((x) => x.n > 0).map((x) => ({ titulo: x.titulo, urgente: x.urgente, acao: { texto: 'Ver', para: x.para, icone: ClipboardList } }));
}

function tarefasDeProfessor(versoes: Versao[], solicitacoes: { status: string }[], desistencias: unknown[]) {
  const v = versoes.filter((x) => !x.parecer_decisao).length;
  const s = solicitacoes.filter((x) => x.status === 'PENDENTE').length;
  return [
    { n: v, titulo: `Dar parecer em ${plural(v, 'versão', 'versões')} de orientando`, para: '/versoes-recebidas' },
    { n: s, titulo: `Responder ${plural(s, 'pedido', 'pedidos')} de orientação`, para: '/solicitacoes' },
    { n: desistencias.length, titulo: `Analisar ${plural(desistencias.length, 'pedido', 'pedidos')} de desistência`, para: '/desistencias' },
  ];
}

function InicioOrientador() {
  const c = useCarregar(() => Promise.all([
    api<{ status: string }[]>('GET', '/orientacao/solicitacoes/recebidas'),
    api<Versao[]>('GET', '/versoes/recebidas'),
    api<Orientando[]>('GET', '/orientacao/orientandos'),
    api<Banca[]>('GET', '/bancas/minhas'),
    api<unknown[]>('GET', '/orientacao/desistencias/pendentes'),
    api<Notificacao[]>('GET', '/notificacoes'),
  ]), []);
  return (
    <Estado c={c}>
      {([solicitacoes, versoes, orientandos, bancas, desistencias, notificacoes]) => {
        const notas = bancas.filter((b) => esperandoNota(b) && (b.meuPapel === 'PRESIDENTE' || b.meuPapel === 'TITULAR')).length;
        const atrasados = orientandos.filter((o) => o.atrasado).length;
        return (
          <>
            <ParaFazer itens={itensContados([
              { n: notas, titulo: `Lançar a nota de ${plural(notas, 'banca', 'bancas')}`, para: '/bancas', urgente: true },
              ...tarefasDeProfessor(versoes, solicitacoes, desistencias),
              { n: atrasados, titulo: `${plural(atrasados, 'orientando está', 'orientandos estão')} com prazo atrasado`, para: '/orientandos', urgente: true },
            ])} />
            <ProximasBancas bancas={bancas} vazio="Nenhuma banca agendada." />
            <Secao titulo="Orientandos">
              {orientandos.length === 0 ? <p className="texto-calmo">Você ainda não tem orientandos.</p> : (
                <>
                  <ul className="linhas">
                    {orientandos.slice(0, 6).map((o) => (
                      <li key={o.id}>
                        <span>{o.aluno}<small className="bloco">{o.curso}</small></span>
                        <SeloSituacao situacao={o.situacao} atrasado={o.atrasado} />
                      </li>
                    ))}
                  </ul>
                  <Link to="/orientandos" className="link-depois">Ver todos os orientandos</Link>
                </>
              )}
            </Secao>
            <AvisosRecentes notificacoes={notificacoes} />
          </>
        );
      }}
    </Estado>
  );
}

function InicioMembro() {
  const u = useUsuario();
  const c = useCarregar(() => Promise.all([api<Banca[]>('GET', '/bancas/minhas'), api<Notificacao[]>('GET', '/notificacoes')]), []);
  return (
    <Estado c={c}>
      {([bancas, notificacoes]) => {
        const notas = bancas.filter((b) => esperandoNota(b) && b.meuPapel !== 'SUPLENTE' && !b.membros.find((m) => mesmoId(m.usuarioId, u.id))?.notaRegistrada).length;
        return (
          <>
            <ParaFazer itens={itensContados([{ n: notas, titulo: `Lançar a sua nota em ${plural(notas, 'defesa', 'defesas')}`, para: '/bancas', urgente: true }])} />
            <ProximasBancas bancas={bancas} vazio="Você não tem bancas agendadas." />
            <AvisosRecentes notificacoes={notificacoes} />
          </>
        );
      }}
    </Estado>
  );
}

/* ---------------------------------------------------------------- Coordenação */

function InicioCoordenacao() {
  const c = useCarregar(() => Promise.all([
    api<TccCurso[]>('GET', '/tccs'),
    api<unknown[]>('GET', '/orientacao/trocas/pendentes'),
    api<unknown[]>('GET', '/publicacoes/pendentes'),
    api<unknown[]>('GET', '/orientacao/desistencias/pendentes'),
    api<Calendario[]>('GET', '/calendarios'),
    api<{ status: string }[]>('GET', '/orientacao/solicitacoes/recebidas'),
    api<Versao[]>('GET', '/versoes/recebidas'),
    api<Notificacao[]>('GET', '/notificacoes'),
  ]), []);
  return (
    <Estado c={c}>
      {([tccs, trocas, publicacoes, desistencias, cals, solicitacoes, versoes, notificacoes]) => {
        const atrasados = tccs.filter((t) => t.atrasado);
        const semCalendario = !cals.some((x) => x.semestre === semestreAtual());
        const porSituacao = Object.entries(SITUACOES).map(([s, [nome]]) => [nome, tccs.filter((t) => t.situacao === s).length] as const).filter(([, n]) => n > 0);
        const max = Math.max(1, ...porSituacao.map(([, n]) => n));
        const itens: ItemFazer[] = [
          ...(semCalendario ? [{ titulo: `Cadastrar o calendário de ${semestreAtual()}`, prazo: 'sem ele os alunos não têm prazos e as bancas não podem ser marcadas', urgente: true,
            acao: { texto: 'Cadastrar', para: '/calendario', icone: Send } }] : []),
          ...itensContados([
            { n: trocas.length, titulo: `Analisar ${plural(trocas.length, 'pedido', 'pedidos')} de troca de orientador`, para: '/trocas' },
            { n: publicacoes.length, titulo: `Analisar ${plural(publicacoes.length, 'pedido', 'pedidos')} de conclusão por artigo`, para: '/publicacoes' },
            ...tarefasDeProfessor(versoes, solicitacoes, desistencias),
          ]),
        ];
        return (
          <>
            <ParaFazer itens={itens} />
            <Secao titulo="TCCs do curso">
              {porSituacao.length === 0 ? <p className="texto-calmo">Nenhum TCC cadastrado ainda.</p> : (
                <>
                  <ul className="barras">
                    {porSituacao.map(([nome, n]) => (
                      <li key={nome}><span>{nome}</span><span className="barra"><span style={{ width: `${(n / max) * 100}%` }} /></span><strong>{n}</strong></li>
                    ))}
                  </ul>
                  <Link to="/tccs" className="link-depois">Ver todos os TCCs</Link>
                </>
              )}
            </Secao>
            {atrasados.length > 0 && (
              <Secao titulo="Alunos com prazo atrasado">
                <ul className="linhas">
                  {atrasados.slice(0, 5).map((t) => (
                    <li key={t.id}><span>{t.aluno}<small className="bloco">{t.orientador ?? 'sem orientador'}</small></span></li>
                  ))}
                </ul>
              </Secao>
            )}
            <AvisosRecentes notificacoes={notificacoes} />
          </>
        );
      }}
    </Estado>
  );
}
