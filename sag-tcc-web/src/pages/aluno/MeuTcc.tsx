import { CalendarDays, Check, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { Modal } from '../../components/Modal';
import { Ficha, Secao } from '../../components/blocos';
import { Campo, CampoSelecao, CampoTexto, Estado, Pagina, Selo } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { talvez, useCarregar } from '../../hooks';
import type { Area, Banca, Evento, Id, Orientador, Tcc } from '../../types';
import { type Cor, dataHoraLonga, dia, mesmoId, nota, RESULTADOS } from '../../util';

/** Carrega o TCC do aluno logado (ou null se ainda não tem). Usado em várias telas do aluno. */
export const buscarMeuTcc = () => talvez(api<Tcc>('GET', '/tccs/meu'));

interface Me { curso: string | null }

/** Selo e frase da situação do TCC, mostrados logo abaixo do título da página. */
function frasesSituacao(tcc: Tcc): { selo: string; cor: Cor; frase: string } {
  if (tcc.concluido_em) return { selo: 'Concluído', cor: 'verde', frase: 'Seu TCC foi aprovado e a entrega definitiva foi concluída. A folha de aprovação está em Declarações.' };
  switch (tcc.situacao) {
    case 'EM_PROPOSTA': return tcc.orientador_id
      ? { selo: 'Proposta aceita', cor: 'azul', frase: 'O orientador aceitou a sua proposta.' }
      : { selo: 'Proposta enviada', cor: 'azul', frase: 'Agora escolha um professor para orientar o seu trabalho.' };
    case 'EM_DESENVOLVIMENTO': return { selo: 'Em andamento', cor: 'azul', frase: 'Você está desenvolvendo o trabalho com o seu orientador.' };
    case 'APTO_DEFESA': return { selo: 'Apto à defesa', cor: 'verde', frase: 'Seu orientador liberou o trabalho. A banca será marcada por ele.' };
    case 'APROVADO': return tcc.correcoes_pendentes
      ? { selo: 'Aprovado com correções', cor: 'verde', frase: `Entregue o texto corrigido em Versões até ${dia(tcc.prazo_correcoes)}.` }
      : { selo: 'Aprovado', cor: 'verde', frase: 'A banca aprovou o seu TCC. Envie a entrega definitiva em Versões.' };
    case 'APROVADO_PUBLICACAO': return { selo: 'Aprovado por publicação', cor: 'verde', frase: 'A coordenação aceitou o seu artigo publicado no lugar da banca.' };
    case 'REPROVADO': return { selo: 'Reprovado', cor: 'vermelho', frase: 'Converse com o seu orientador e com a coordenação sobre os próximos passos.' };
    case 'NAO_APRESENTADO': return { selo: 'Não apresentado', cor: 'vermelho', frase: 'A defesa não aconteceu. Procure a coordenação do seu curso.' };
    case 'CANCELADO': return { selo: 'Cancelado', cor: 'cinza', frase: 'Este TCC foi cancelado.' };
  }
}

/** "Orientadora" / "Orientador" pelo título do nome. */
const rotuloOrientador = (nome?: string) => (nome && /^profa\.?\s/i.test(nome) ? 'Orientadora' : nome && /^prof\.?\s/i.test(nome) ? 'Orientador' : 'Orientador(a)');

export function MeuTcc() {
  const c = useCarregar(() => Promise.all([
    buscarMeuTcc(), api<Area[]>('GET', '/areas'), api<Orientador[]>('GET', '/orientacao/orientadores'),
    talvez(api<Me>('GET', '/me')), api<Banca[]>('GET', '/bancas/minhas'),
  ]), []);
  const [editando, setEditando] = useState(false);
  const [busca] = useSearchParams();
  const [propondo, setPropondo] = useState(busca.get('proposta') === '1');

  return (
    <Estado c={c}>
      {([tcc, areas, orientadores, me, bancas]) => {
        const descricao = me?.curso ? `${me.curso} · Escola Superior de Tecnologia` : undefined;
        if (!tcc) {
          return (
            <Pagina titulo="Meu TCC" descricao={descricao}>
              {!propondo ? (
                <div className="vazio-pagina">
                  <FileText className="vazio-icone" aria-hidden="true" strokeWidth={1.5} />
                  <h2>Você ainda não tem um TCC</h2>
                  <p>Primeiro faça a sua proposta: o título, um resumo e a área do trabalho. Depois você escolhe o professor que vai orientar.</p>
                  <button className="botao" onClick={() => setPropondo(true)}>Fazer proposta</button>
                </div>
              ) : (
                <Secao titulo="Proposta de TCC">
                  <div className="caixa">
                    <FormProposta areas={areas} aoSalvar={c.recarregar} aoCancelar={() => setPropondo(false)} />
                  </div>
                </Secao>
              )}
            </Pagina>
          );
        }
        const nome = (id: Tcc['orientador_id']) => orientadores.find((o) => mesmoId(o.id, id))?.nome;
        const banca = bancas.find((b) => b.status === 'AGENDADA') ?? bancas.find((b) => b.status === 'REALIZADA');
        const orientador = nome(tcc.orientador_id) ?? banca?.membros.find((m) => m.papel === 'PRESIDENTE')?.nome;
        const area = areas.find((a) => mesmoId(a.id, tcc.area_id))?.nome;
        const semOrientador = !tcc.orientador_id;
        const sit = frasesSituacao(tcc);
        const nada = (t: string) => <span className="texto-calmo">{t}</span>;

        return (
          <Pagina titulo="Meu TCC" descricao={descricao}>
            <div className="situacao-linha">
              <Selo cor={sit.cor}>{sit.cor === 'verde' && <Check className="ic" aria-hidden="true" />}{sit.selo}</Selo>
              {tcc.atrasado && <Selo cor="vermelho">Atrasado</Selo>}
              <span>{sit.frase}{tcc.atrasado && <> Há uma entrega atrasada, veja em <Link to="/prazos">Prazos</Link>.</>}</span>
            </div>

            <Secao titulo="Dados do trabalho" extra={semOrientador && <button className="botao-texto" onClick={() => setEditando(true)}>Editar proposta</button>}>
              <div className="caixa caixa-ficha">
                <Ficha linhas={[
                  ['Título', tcc.titulo],
                  ['Subtítulo', tcc.subtitulo || nada('Não tem')],
                  ['Área', area ?? nada('Não informada')],
                  [rotuloOrientador(orientador), orientador ?? nada('Ainda não escolhido')],
                  ['Coorientador', (tcc.coorientador_id && nome(tcc.coorientador_id)) || nada('Não tem')],
                ]} />
              </div>
            </Secao>

            {semOrientador && <EscolherOrientador areas={areas} areaInicial={String(tcc.area_id ?? '')} aoSolicitar={c.recarregar} />}

            <Secao titulo="Resumo">
              <p className="texto-resumo">{tcc.resumo}</p>
            </Secao>

            {!semOrientador && <ResultadoDefesa banca={banca} />}

            <Historico tccId={tcc.id} />

            {editando && (
              <Modal titulo="Editar proposta" aoFechar={() => setEditando(false)}>
                <FormProposta areas={areas} tcc={tcc} aoSalvar={() => { setEditando(false); c.recarregar(); }} />
              </Modal>
            )}
          </Pagina>
        );
      }}
    </Estado>
  );
}

function ResultadoDefesa({ banca }: { banca: Banca | undefined }) {
  if (!banca || banca.status === 'CANCELADA') {
    return <Secao titulo="Resultado da defesa"><p className="linha-icone"><CalendarDays className="ic" aria-hidden="true" /><span><span className="texto-calmo">Defesa:</span> ainda não realizada</span></p></Secao>;
  }
  if (banca.status === 'AGENDADA') {
    return (
      <Secao titulo="Resultado da defesa">
        <p className="linha-icone"><CalendarDays className="ic" aria-hidden="true" />
          {new Date(banca.data_hora) <= new Date()
            ? <span><span className="texto-calmo">Defesa:</span> realizada em {dia(banca.data_hora)}, aguardando o resultado da banca</span>
            : <span><span className="texto-calmo">Defesa marcada:</span> {dataHoraLonga(banca.data_hora)} · {banca.local_ou_link}</span>}</p>
      </Secao>
    );
  }
  return (
    <Secao titulo="Resultado da defesa" extra={<Link to="/defesa" className="link-secao">Ver a ata da defesa</Link>}>
      <div className="caixa caixa-ficha">
        <Ficha linhas={[
          ['Data', dia(banca.data_hora)],
          ['Resultado', banca.resultado ? RESULTADOS[banca.resultado][0] : '—'],
          ['Nota final', banca.nota_final != null ? <strong className="nota-final" key="n">{nota(banca.nota_final)}</strong> : '—'],
          ...(banca.prazo_correcoes ? [['Prazo das correções', `até ${dia(banca.prazo_correcoes)}`] as [string, string]] : []),
        ]} />
      </div>
    </Secao>
  );
}

/** Histórico escondido: só aparece quando o aluno clica. */
function Historico({ tccId }: { tccId: Id }) {
  const [aberto, setAberto] = useState(false);
  return (
    <section className="secao">
      <button className="botao-texto botao-abrir" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        {aberto ? 'Ocultar histórico do TCC' : 'Ver histórico do TCC'}
        {aberto ? <ChevronUp className="ic" aria-hidden="true" /> : <ChevronDown className="ic" aria-hidden="true" />}
      </button>
      {aberto && <ListaHistorico tccId={tccId} />}
    </section>
  );
}

function ListaHistorico({ tccId }: { tccId: Id }) {
  const c = useCarregar(() => api<Evento[]>('GET', `/tccs/${tccId}/historico`), [tccId]);
  return (
    <Estado c={c}>
      {(eventos) => eventos.length === 0 ? <p className="texto-calmo">Nenhum registro ainda.</p> : (
        // Em ordem de acontecimento: o mais antigo em cima, o mais recente (bolinha cheia) embaixo
        <ol className="historico">
          {[...eventos].sort((a, b) => a.criado_em.localeCompare(b.criado_em)).map((e, i, todos) => (
            <li key={i} className={i === todos.length - 1 ? 'ultimo' : ''}>
              <time>{new Date(e.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Manaus' })}</time>
              <span>{e.descricao || e.tipo}</span>
            </li>
          ))}
        </ol>
      )}
    </Estado>
  );
}

function FormProposta({ areas, tcc, aoSalvar, aoCancelar }: { areas: Area[]; tcc?: Tcc; aoSalvar: () => void; aoCancelar?: () => void }) {
  const [titulo, setTitulo] = useState(tcc?.titulo ?? '');
  const [subtitulo, setSubtitulo] = useState(tcc?.subtitulo ?? '');
  const [resumo, setResumo] = useState(tcc?.resumo ?? '');
  const [area, setArea] = useState(tcc?.area_id ? String(tcc.area_id) : '');
  const { executar } = useFeedback();
  const palavras = resumo.trim().split(/\s+/).filter(Boolean).length;

  const salvar = async () => {
    const corpo = { titulo, subtitulo: subtitulo || null, resumo, areaId: Number(area) || undefined };
    const r = await executar(() => tcc ? api('PUT', `/tccs/${tcc.id}`, corpo) : api('POST', '/tccs', corpo),
      tcc ? 'Proposta atualizada.' : 'Proposta enviada! Agora escolha o seu orientador.');
    if (r) aoSalvar();
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); salvar(); }}>
      <Campo rotulo="Título" obrigatorio maxLength={250} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <Campo rotulo="Subtítulo" maxLength={250} value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} ajuda="Opcional" />
      <CampoTexto rotulo="Resumo" obrigatorio rows={7} value={resumo} onChange={(e) => setResumo(e.target.value)}
        ajuda={<span className={palavras > 250 ? 'texto-erro' : ''}>{palavras} de 250 palavras</span>} />
      <CampoSelecao rotulo="Área do conhecimento" obrigatorio value={area} onChange={(e) => setArea(e.target.value)}>
        <option value="">Selecione...</option>
        {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
      </CampoSelecao>
      {tcc && <p className="ajuda">A proposta só pode ser editada enquanto nenhum orientador aceitou.</p>}
      <div className="acoes">
        <button className="botao" type="submit">{tcc ? 'Salvar alterações' : 'Enviar proposta'}</button>
        {aoCancelar && <button className="botao secundario" type="button" onClick={aoCancelar}>Cancelar</button>}
      </div>
    </form>
  );
}

function EscolherOrientador({ areas, areaInicial, aoSolicitar }: { areas: Area[]; areaInicial: string; aoSolicitar: () => void }) {
  const [area, setArea] = useState(areaInicial);
  const c = useCarregar(() => api<Orientador[]>('GET', '/orientacao/orientadores' + (area ? `?areaId=${area}` : '')), [area]);
  const { executar, perguntar } = useFeedback();

  const solicitar = async (o: Orientador) => {
    if (!(await perguntar({ titulo: 'Pedir orientação?', texto: `Seu pedido vai para ${o.nome}. Você só pode ter um pedido aguardando resposta por vez.`, confirmar: 'Enviar pedido' }))) return;
    const r = await executar(() => api('POST', '/orientacao/solicitacoes', { professorId: Number(o.id) }), `Pedido enviado para ${o.nome}. Você será avisado da resposta.`);
    if (r) aoSolicitar();
  };

  return (
    <Secao titulo="Escolher orientador(a)">
      <p className="texto-calmo">Veja os professores e envie o pedido. Se for recusado, você pode pedir a outro professor.</p>
      <CampoSelecao rotulo="Filtrar por área" value={area} onChange={(e) => setArea(e.target.value)}>
        <option value="">Todas as áreas</option>
        {areas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
      </CampoSelecao>
      <Estado c={c}>
        {(lista) => lista.length === 0 ? <p className="texto-calmo">Nenhum professor com essa área.</p> : (
          <ul className="linhas lista-orientadores">
            {lista.map((o) => (
              <li key={o.id}>
                <span>{o.nome}<small className="bloco">{(o.areas || []).join(', ') || 'Sem áreas cadastradas'}</small></span>
                <span className="linha-direita">
                  {o.disponivel ? <Selo cor="verde">{o.limite - o.orientandos} vaga(s)</Selo> : <Selo cor="cinza">Sem vagas</Selo>}
                  {o.disponivel && <button className="botao pequeno" onClick={() => solicitar(o)}>Pedir orientação</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Estado>
    </Secao>
  );
}
