import { Check, ChevronDown, ChevronUp, Clock, Download, FileText, FileUp, PencilLine } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, baixar, lerBase64 } from '../../api';
import { CampoSelecao, Estado, Pagina, Selo, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { talvez, useCarregar } from '../../hooks';
import type { Etapa, Tcc, Versao } from '../../types';
import { dataHora, dia, NOME_ETAPA, PAPEIS, PERFIS, tamanho } from '../../util';
import type { PapelBanca, Perfil } from '../../types';
import { buscarMeuTcc } from './MeuTcc';

const LIMITE = 10 * 1024 * 1024;

export function SeloParecer({ v }: { v: Versao }) {
  if (!v.parecer_decisao) return <Selo cor="cinza"><Clock className="ic" aria-hidden="true" />Aguardando parecer</Selo>;
  return v.parecer_decisao === 'APROVADA'
    ? <Selo cor="verde"><Check className="ic" aria-hidden="true" />Aprovada</Selo>
    : <Selo cor="amarelo"><PencilLine className="ic" aria-hidden="true" />Ajustes solicitados</Selo>;
}

export const baixarVersao = (v: Versao) => baixar(`/versoes/${v.id}/arquivo`, v.arquivo_nome);

export function Versoes() {
  const c = useCarregar(buscarMeuTcc, []);
  return (
    <Pagina titulo="Versões do TCC" descricao="Seus envios em PDF e o parecer do orientador sobre cada um.">
      <Estado c={c}>
        {(tcc) => {
          if (!tcc) return <Vazio>Você ainda não tem TCC. <Link to="/meu-tcc">Envie sua proposta</Link>.</Vazio>;
          if (!tcc.orientador_id) return <Vazio>Você poderá enviar versões depois que um orientador aceitar o seu TCC.</Vazio>;
          return <ConteudoVersoes tcc={tcc} />;
        }}
      </Estado>
    </Pagina>
  );
}

function ConteudoVersoes({ tcc }: { tcc: Tcc }) {
  const c = useCarregar(() => Promise.all([
    api<Versao[]>('GET', `/tccs/${tcc.id}/versoes`),
    talvez(api<Download[]>('GET', `/tccs/${tcc.id}/downloads`)),
  ]), [tcc.id]);
  const aprovado = tcc.situacao === 'APROVADO' || tcc.situacao === 'APROVADO_PUBLICACAO';
  const encerrado = ['REPROVADO', 'NAO_APRESENTADO', 'CANCELADO'].includes(tcc.situacao);
  const [busca, setBusca] = useSearchParams();
  const [aberto, setAberto] = useState(busca.get('enviar') === '1');
  const [historico, setHistorico] = useState(false);
  const fechar = () => { setAberto(false); if (busca.has('enviar')) setBusca({}, { replace: true }); };
  const podeEnviar = !encerrado && !tcc.concluido_em;

  let titulo: ReactNode = 'Você pode enviar uma nova versão do seu TCC';
  let detalhe: ReactNode = null;
  let botao = 'Enviar nova versão';
  if (tcc.concluido_em) {
    titulo = 'Seu TCC está concluído';
    detalhe = <>A entrega definitiva foi aprovada. A folha de aprovação está em <Link to="/declaracoes">Declarações</Link>.</>;
  } else if (encerrado) {
    titulo = 'Não é possível enviar novas versões';
    detalhe = 'O TCC está encerrado.';
  } else if (tcc.correcoes_pendentes && tcc.prazo_correcoes) {
    titulo = `Envie o texto corrigido até ${dia(tcc.prazo_correcoes)}`;
    detalhe = 'A banca aprovou o seu TCC com correções. Quando o orientador aprovar esta entrega, o TCC é concluído.';
    botao = 'Enviar entrega definitiva';
  } else if (aprovado) {
    titulo = 'Você pode enviar a entrega definitiva do seu TCC';
    detalhe = 'Quando o orientador aprovar, o TCC é concluído.';
    botao = 'Enviar entrega definitiva';
  }

  return (
    <Estado c={c}>
      {([lista, downloads]) => (
        <>
          <section className={`caixa-envio ${tcc.correcoes_pendentes && podeEnviar ? 'alerta' : ''}`} aria-label="Enviar versão">
            <div className="caixa-envio-topo">
              <div>
                <p className="caixa-envio-titulo">{titulo}</p>
                {detalhe && <p className="caixa-envio-detalhe">{detalhe}</p>}
              </div>
              {podeEnviar && !aberto && <button className="botao" onClick={() => setAberto(true)}>{botao}</button>}
            </div>
            {podeEnviar && aberto && (
              <div className="caixa-envio-corpo">
                <EnviarVersao tcc={tcc} definitiva={aprovado} versoes={lista} aoCancelar={fechar} aoEnviar={() => { fechar(); setHistorico(true); c.recarregar(); }} />
              </div>
            )}
          </section>

          {lista.length === 0 ? <p className="texto-calmo">Nenhuma versão enviada ainda.</p> : (
            <section className="secao">
              <button className="botao-historico" aria-expanded={historico} onClick={() => setHistorico(!historico)}>
                {historico ? 'Ocultar histórico de versões' : `Ver histórico de versões (${lista.length})`}
                {historico ? <ChevronUp className="ic" aria-hidden="true" /> : <ChevronDown className="ic" aria-hidden="true" />}
              </button>
              {historico && (
                <ol className="cartoes-versao">
                  {lista.map((v) => <ItemVersao key={v.id} v={v} downloads={(downloads ?? []).filter((d) => d.numero === v.numero)} />)}
                </ol>
              )}
            </section>
          )}
        </>
      )}
    </Estado>
  );
}

interface Download { baixado_em: string; numero: number; etapa: Versao['etapa']; arquivo_nome: string; nome: string; perfil: Perfil; externo: boolean; instituicao: string | null; papel_banca: PapelBanca | null }

const FUSO = 'America/Manaus';
const enviadaEm = (v: string) => {
  const d = new Date(v);
  return `${d.toLocaleDateString('pt-BR', { timeZone: FUSO })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })}`;
};

/** Uma versão: etapa e data em cima; situação e botão à direita; comentários num bloco separado. */
function ItemVersao({ v, downloads }: { v: Versao; downloads: Download[] }) {
  const { executar } = useFeedback();
  const [verDownloads, setVerDownloads] = useState(false);
  const pessoas = new Set(downloads.map((d) => d.nome)).size;
  return (
    <li className="cartao-versao">
      <div className="versao-cabeca">
        <div>
          <strong>Versão {v.numero} · {NOME_ETAPA[v.etapa]}</strong>
          <small className="bloco">Enviada em {enviadaEm(v.enviado_em)}{v.fora_do_prazo && ' · fora do prazo'}</small>
        </div>
        <div className="versao-acoes">
          <SeloParecer v={v} />
          <button className="botao pequeno secundario com-icone-botao" onClick={() => executar(() => baixarVersao(v))}>
            <Download className="ic" aria-hidden="true" />Baixar PDF
          </button>
        </div>
      </div>
      {(v.parecer_texto || v.comentario) && (
        <div className="versao-comentarios">
          {v.parecer_texto && <div><span className="etiqueta-orientador">Parecer do orientador</span><p>{v.parecer_texto}</p></div>}
          {v.comentario && <div><span className="etiqueta-aluno">Seu comentário</span><p>{v.comentario}</p></div>}
        </div>
      )}
      {downloads.length > 0 && (
        <div className="versao-downloads">
          <button className="botao-texto" aria-expanded={verDownloads} onClick={() => setVerDownloads(!verDownloads)}>
            Baixada {downloads.length} vez{downloads.length > 1 ? 'es' : ''} por {pessoas} pessoa{pessoas > 1 ? 's' : ''} · {verDownloads ? 'esconder' : 'ver quem'}
          </button>
          {verDownloads && (
            <ul>
              {downloads.map((d) => (
                <li key={d.baixado_em + d.nome}>
                  <strong>{d.nome}</strong> ({d.papel_banca ? `banca, ${PAPEIS[d.papel_banca].toLowerCase()}` : PERFIS[d.perfil].toLowerCase()}{d.externo && d.instituicao ? `, ${d.instituicao}` : ''}) · {dataHora(d.baixado_em)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function EnviarVersao({ tcc, definitiva, versoes, aoEnviar, aoCancelar }: { tcc: Tcc; definitiva: boolean; versoes: Versao[]; aoEnviar: () => void; aoCancelar: () => void }) {
  const opcoes: Etapa[] = definitiva ? ['ENTREGA_DEFINITIVA'] : ['QUALIFICACAO', 'VERSAO_FINAL'];
  // Se a qualificação já foi aprovada, a próxima é a versão final
  const qualificacaoOk = versoes.some((v) => v.etapa === 'QUALIFICACAO' && v.parecer_decisao === 'APROVADA');
  const [etapa, setEtapa] = useState<Etapa>(definitiva ? 'ENTREGA_DEFINITIVA' : qualificacaoOk ? 'VERSAO_FINAL' : 'QUALIFICACAO');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [comentario, setComentario] = useState('');
  const [visibilidade, setVisibilidade] = useState('TEXTO_COMPLETO');
  const [autoria, setAutoria] = useState(false);
  const exigeAutoria = etapa !== 'QUALIFICACAO';
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { executar } = useFeedback();

  const escolher = (f: File | undefined) => {
    setErro(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) { setErro('O arquivo precisa ser PDF.'); return; }
    if (f.size > LIMITE) { setErro('O arquivo passa de 10 MB. Diminua o tamanho (por exemplo, comprimindo as imagens) e tente de novo.'); return; }
    setArquivo(f);
  };

  const enviar = async () => {
    if (!arquivo) { setErro('Escolha o arquivo PDF.'); return; }
    if (exigeAutoria && !autoria) { setErro('Marque a declaração de autoria para enviar esta versão.'); return; }
    setEnviando(true);
    const r = await executar(async () => api<Versao>('POST', `/tccs/${tcc.id}/versoes`, {
      etapa, arquivoNome: arquivo.name, arquivoBase64: await lerBase64(arquivo), comentario: comentario.trim() || null,
      declaracaoAutoria: exigeAutoria ? autoria : undefined,
      ...(definitiva ? { visibilidade } : {}),
    }), (v) => `Versão ${v.numero} enviada${v.fora_do_prazo ? ' (fora do prazo)' : ''}. O orientador foi avisado.`);
    setEnviando(false);
    if (r) { setArquivo(null); setComentario(''); setAutoria(false); if (input.current) input.current.value = ''; aoEnviar(); }
  };

  return (
    <div className="form-envio">
      <div className="campo">
        <span className="rotulo" id="rotulo-etapa">Etapa</span>
        <div className="segmentado" role="radiogroup" aria-labelledby="rotulo-etapa">
          {opcoes.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={etapa === o} onClick={() => setEtapa(o)}>{NOME_ETAPA[o]}</button>
          ))}
        </div>
      </div>

      <div className="campo">
        <span className="rotulo">Arquivo do TCC</span>
        <label className={`area-pdf ${arrastando ? 'arrastando' : ''} ${arquivo ? 'com-arquivo' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files[0]); }}>
          <input ref={input} type="file" accept="application/pdf,.pdf" className="visualmente-oculto" onChange={(e) => escolher(e.target.files?.[0])} />
          {arquivo ? <FileText className="ic-pdf" aria-hidden="true" /> : <FileUp className="ic-pdf" aria-hidden="true" />}
          {arquivo
            ? <span><strong>{arquivo.name}</strong> · {tamanho(arquivo.size)} · <span className="link-falso">trocar arquivo</span></span>
            : <span>Arraste o PDF aqui ou <span className="link-falso">clique para escolher</span></span>}
        </label>
        {erro ? <span className="erro-campo">{erro}</span> : <span className="ajuda">Somente PDF, até 10 MB</span>}
      </div>

      {definitiva && (
        <CampoSelecao rotulo="Quem pode ver o texto completo depois de aprovado?" value={visibilidade} onChange={(e) => setVisibilidade(e.target.value)}>
          <option value="TEXTO_COMPLETO">Qualquer pessoa pode ler o texto completo</option>
          <option value="SOMENTE_METADADOS">Mostrar só título, autor e resumo</option>
        </CampoSelecao>
      )}

      <div className="campo">
        <label className="rotulo" htmlFor="comentario-versao">Comentário para o orientador <span className="opcional">(opcional)</span></label>
        <textarea id="comentario-versao" rows={4} value={comentario} onChange={(e) => setComentario(e.target.value)} />
      </div>

      {exigeAutoria && (
        <label className="caixa-marcar declaracao-autoria">
          <input type="checkbox" checked={autoria} onChange={(e) => setAutoria(e.target.checked)} />
          <span>Declaro que este trabalho é de minha autoria{definitiva && ' e autorizo a publicação no repositório da UEA conforme a opção acima'}</span>
        </label>
      )}

      <div className="acoes">
        <button className="botao" onClick={enviar} disabled={enviando}>{enviando ? 'Enviando...' : 'Enviar versão'}</button>
        <button className="botao secundario" onClick={aoCancelar} disabled={enviando}>Cancelar</button>
      </div>
    </div>
  );
}
