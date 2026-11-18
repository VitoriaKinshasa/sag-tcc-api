import { Download, FileText, Image as IconeImagem, ImagePlus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, baixar, ErroApi } from '../../api';
import { Secao } from '../../components/blocos';
import { Carregando, Dica, Estado, Pagina } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { ConteudoBanner, Id, SituacaoBanner, TextosBanner } from '../../types';
import { dataHora } from '../../util';
import { buscarMeuTcc } from './MeuTcc';
import { ALTURA_BANNER, carregarLogo, desenharBanner, LARGURA_BANNER, lerImagem, SECOES, type ChaveSecao, type ImagemBanner, type ResultadoDesenho } from './desenhoBanner';

const LIMITE = 600;

/** UC25 – Gerar banner com IA (aluno com TCC aprovado). */
export function Banner() {
  const c = useCarregar(async () => {
    const tcc = await buscarMeuTcc();
    if (!tcc) return null;
    try {
      return { tccId: tcc.id, situacao: await api<SituacaoBanner>('GET', `/tccs/${tcc.id}/banner`) };
    } catch (e) {
      if (e instanceof ErroApi && e.status === 422) return { tccId: tcc.id, situacao: null, erro: e.message };
      throw e;
    }
  }, []);

  return (
    <Pagina titulo="Banner do TCC" descricao="Monte o banner (90 × 120 cm) para mostras e eventos. A inteligência artificial sugere os textos, você revisa, coloca as figuras e as referências e gera o arquivo.">
      <Estado c={c}>
        {(r) => !r || !r.situacao ? (
          <div className="vazio-pagina">
            <IconeImagem className="vazio-icone" aria-hidden="true" strokeWidth={1.5} />
            <h2>O banner só pode ser gerado para TCC aprovado</h2>
            <p>Quando a banca aprovar o seu trabalho, esta opção fica disponível em Meu TCC.</p>
            <Link className="botao secundario" to="/meu-tcc">Voltar para Meu TCC</Link>
          </div>
        ) : <Editor tccId={r.tccId} inicial={r.situacao} />}
      </Estado>
    </Pagina>
  );
}

const LIMITES: Partial<Record<keyof ConteudoBanner, number>> = { referencias: 1500, agradecimentos: 400, coautores: 300, areaTematica: 150 };
const limiteDe = (chave: keyof ConteudoBanner) => LIMITES[chave] ?? LIMITE;
const MAX_FIGURAS_SECAO = 2;
const MAX_FIGURAS = 6;
/** O envio inteiro precisa caber em 4,5 MB na hospedagem (o arquivo vai em base64). */
const LIMITE_ENVIO = 3_600_000;

function Editor({ tccId, inicial }: { tccId: Id; inicial: SituacaoBanner }) {
  const d = inicial.dados;
  const [textos, setTextos] = useState<ConteudoBanner>(() => ({
    titulo: d.titulo, introducao: d.resumo.slice(0, LIMITE), objetivo: '', metodologia: '', resultados: '', conclusao: '',
    areaTematica: d.area, coautores: '', agradecimentos: '', referencias: '',
    ...(inicial.ultimo?.conteudo ?? {}),
  }));
  const [imagens, setImagens] = useState<ImagemBanner[]>([]);
  const [desenho, setDesenho] = useState<ResultadoDesenho>({ cabe: true, colunasCheias: [] });
  const [usadas, setUsadas] = useState(inicial.usadasHoje);
  const [sugerindo, setSugerindo] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'info' | 'alerta' | 'sucesso'; texto: string } | null>(null);
  const [gerado, setGerado] = useState<{ id: Id; em: string } | null>(inicial.ultimo ? { id: inicial.ultimo.id, em: inicial.ultimo.gerado_em } : null);
  const [gerando, setGerando] = useState(false);
  const [logoPronta, setLogoPronta] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { avisar, executar } = useFeedback();
  const pediuAutomatico = useRef(false);
  const esgotou = usadas >= inicial.limite;

  useEffect(() => { carregarLogo().then(() => setLogoPronta(true)); }, []);
  useEffect(() => { if (canvas.current) setDesenho(desenharBanner(canvas.current, textos, d, imagens)); }, [textos, d, imagens, logoPronta]);

  const sugerir = async () => {
    setSugerindo(true); setAviso(null);
    try {
      const r = await api<{ origem: 'IA' | 'MANUAL'; textos: TextosBanner; aviso?: string; usadasHoje: number }>('POST', `/tccs/${tccId}/banner/sugestao`);
      setUsadas(r.usadasHoje);
      if (r.origem === 'IA') {
        // a IA só sugere as seções de texto: referências, agradecimentos, coautores e área ficam como o aluno deixou
        setTextos((t) => ({ ...t, ...r.textos }));
        setAviso({ tipo: 'info', texto: 'Textos sugeridos pela inteligência artificial. Leia com atenção e ajuste o que precisar: o conteúdo final é de sua responsabilidade. As referências você preenche com as do seu TCC.' });
      } else {
        // E03: sem IA, a prévia fica com o título e o resumo para preencher à mão
        if (!inicial.ultimo) setTextos((t) => ({ ...t, ...r.textos }));
        setAviso({ tipo: 'alerta', texto: r.aviso ?? 'Não foi possível gerar a sugestão agora. Você pode preencher o banner manualmente' });
      }
    } catch (e) {
      setAviso({ tipo: 'alerta', texto: e instanceof Error ? e.message : 'Não foi possível gerar a sugestão agora.' });
    } finally {
      setSugerindo(false);
    }
  };

  // P1 a P4: ao abrir pela primeira vez (sem banner salvo), já pede a sugestão
  useEffect(() => {
    if (pediuAutomatico.current || inicial.ultimo) return;
    pediuAutomatico.current = true;
    if (inicial.iaConfigurada && !esgotou) sugerir();
    else setAviso({ tipo: 'alerta', texto: 'Não foi possível gerar a sugestão agora. Você pode preencher o banner manualmente' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const adicionarFigura = async (secao: ChaveSecao, arquivo: File | undefined) => {
    if (!arquivo) return;
    if (imagens.length >= MAX_FIGURAS) return avisar(`O banner pode ter até ${MAX_FIGURAS} figuras.`, 'erro');
    try {
      const img = await lerImagem(arquivo);
      setImagens((l) => [...l, { id: crypto.randomUUID(), secao, img, legenda: arquivo.name.replace(/\.[^.]+$/, ''), fonte: 'Autoria própria (' + d.ano + ')' }]);
    } catch (e) {
      avisar(e instanceof Error ? e.message : 'Não foi possível ler a imagem.', 'erro');
    }
  };
  const mudarFigura = (id: string, campo: 'legenda' | 'fonte', valor: string) =>
    setImagens((l) => l.map((i) => (i.id === id ? { ...i, [campo]: valor.slice(0, 150) } : i)));
  const tirarFigura = (id: string) => setImagens((l) => l.filter((i) => i.id !== id));

  const faltando = SECOES.filter((s) => !s.opcional && !textos[s.chave].trim()).map((s) => s.titulo);

  const gerarArquivo = async () => {
    if (!textos.titulo.trim()) return avisar('Informe o título do banner.', 'erro');
    if (faltando.length) return avisar(`Preencha as seções obrigatórias: ${faltando.join(', ')}.`, 'erro');
    if (!imagens.length) return avisar('A norma pede pelo menos uma figura, quadro ou tabela no banner. Adicione uma imagem em alguma seção.', 'erro');
    if (!canvas.current) return;
    const r0 = desenharBanner(canvas.current, textos, d, imagens);
    if (!r0.cabe) return avisar('O conteúdo não cabe no banner. Diminua os textos ou tire uma figura da coluna indicada.', 'erro');
    setGerando(true);
    // JPEG: bem menor que PNG. Se ainda ficar grande, a qualidade baixa um pouco.
    let qualidade = 0.88;
    let jpeg = canvas.current.toDataURL('image/jpeg', qualidade);
    while (jpeg.length > LIMITE_ENVIO && qualidade > 0.5) { qualidade -= 0.08; jpeg = canvas.current.toDataURL('image/jpeg', qualidade); }
    if (jpeg.length > LIMITE_ENVIO) { setGerando(false); return avisar('O banner ficou pesado demais. Tente usar imagens mais simples (prints, gráficos) ou menos figuras.', 'erro'); }
    const r = await executar(() => api<{ id: Id; gerado_em: string; mensagem: string }>('POST', `/tccs/${tccId}/banner`,
      { conteudo: textos, jpeg, largura: LARGURA_BANNER, altura: ALTURA_BANNER }), (x) => x.mensagem);
    setGerando(false);
    if (r) setGerado({ id: r.id, em: r.gerado_em });
  };

  const mudar = (chave: keyof ConteudoBanner, valor: string) => setTextos((t) => ({ ...t, [chave]: valor.slice(0, limiteDe(chave)) }));

  return (
    <>
      {gerado && (
        <div className="caixa-envio">
          <div className="caixa-envio-topo">
            <div>
              <p className="caixa-envio-titulo">Banner pronto</p>
              <p className="caixa-envio-detalhe">Gerado em {dataHora(gerado.em)}. O PDF tem 90 × 120 cm, para impressão na gráfica; a imagem serve para divulgar.</p>
            </div>
            <div className="acoes" style={{ margin: 0 }}>
              <button className="botao secundario" onClick={() => executar(() => baixar(`/tccs/${tccId}/banner/${gerado.id}/pdf`, 'banner-tcc.pdf'))}><FileText className="ic" aria-hidden="true" />Baixar PDF</button>
              <button className="botao secundario" onClick={() => executar(() => baixar(`/tccs/${tccId}/banner/${gerado.id}/png`, 'banner-tcc.jpg'))}><Download className="ic" aria-hidden="true" />Baixar imagem</button>
            </div>
          </div>
        </div>
      )}

      <div className="banner-editor">
        <div>
          <Secao titulo="Conteúdo do banner" extra={inicial.iaConfigurada && (
            <span className="texto-calmo pequeno">{usadas} de {inicial.limite} sugestões usadas hoje</span>
          )}>
            {aviso && <Dica tipo={aviso.tipo}>{aviso.texto}</Dica>}
            {sugerindo ? <Carregando texto="A inteligência artificial está escrevendo a sugestão..." /> : (
              <div className="banner-campos">
                <Campo2 rotulo="Título" valor={textos.titulo} limite={limiteDe('titulo')} aoMudar={(v) => mudar('titulo', v)} linhas={2} />
                <Campo2 rotulo="Coautor(es) (opcional)" valor={textos.coautores} limite={limiteDe('coautores')} aoMudar={(v) => mudar('coautores', v)} linhas={1}
                  dica={`Você (${d.aluno}) e o orientador já aparecem. Se tiver mais de um coautor, separe com ponto e vírgula.`} />
                <Campo2 rotulo="Área temática" valor={textos.areaTematica} limite={limiteDe('areaTematica')} aoMudar={(v) => mudar('areaTematica', v)} linhas={1}
                  dica="Já vem com a área do seu TCC. Se o evento pedir outra área, troque aqui." />
                {SECOES.map((s) => (
                  <div key={s.chave} className="banner-secao">
                    <Campo2 rotulo={s.rotulo} valor={textos[s.chave]} limite={limiteDe(s.chave)} aoMudar={(v) => mudar(s.chave, v)} linhas={s.chave === 'referencias' ? 6 : 4}
                      dica={s.chave === 'introducao' ? 'Comece cada tópico com “• ” para virar um item no banner.'
                        : s.chave === 'referencias' ? 'Use as mesmas referências citadas no texto, no padrão ABNT. Uma por linha.' : undefined} />
                    {s.chave !== 'referencias' && s.chave !== 'agradecimentos' && (
                      <Figuras secao={s.chave} imagens={imagens.filter((i) => i.secao === s.chave)} podeAdicionar={imagens.length < MAX_FIGURAS}
                        aoAdicionar={adicionarFigura} aoMudar={mudarFigura} aoTirar={tirarFigura} />
                    )}
                  </div>
                ))}
              </div>
            )}
            {!desenho.cabe && (
              <Dica tipo="alerta">
                O conteúdo não cabe na coluna {desenho.colunasCheias.map((c) => (c === 0 ? 'da esquerda' : 'da direita')).join(' e na coluna ')}.
                As letras seguem o tamanho da norma, então diminua os textos ou tire uma figura dessa coluna.
              </Dica>
            )}
            {!imagens.length && <Dica tipo="info">A norma pede pelo menos uma figura, quadro ou tabela. Use “Adicionar figura” em alguma seção.</Dica>}
            <div className="acoes">
              {inicial.iaConfigurada && (
                <button className="botao secundario" onClick={sugerir} disabled={sugerindo || esgotou} title={esgotou ? 'Você atingiu o limite de 5 gerações hoje' : undefined}>
                  {usadas ? <RefreshCw className="ic" aria-hidden="true" /> : <Sparkles className="ic" aria-hidden="true" />}{usadas ? 'Gerar outra sugestão' : 'Sugerir textos com IA'}
                </button>
              )}
              <button className="botao" onClick={gerarArquivo} disabled={gerando || sugerindo}>{gerando ? 'Gerando...' : 'Gerar arquivo'}</button>
            </div>
            {esgotou && <p className="ajuda">Você atingiu o limite de 5 gerações hoje. Tente novamente amanhã.</p>}
            <p className="ajuda">As figuras não ficam guardadas no sistema: se sair desta página, adicione de novo antes de gerar outro banner.</p>
          </Secao>
        </div>
        <div>
          <Secao titulo="Prévia">
            <div className="banner-previa"><canvas ref={canvas} aria-label="Prévia do banner" role="img" /></div>
            <p className="ajuda">Banner de 90 × 120 cm. A prévia muda enquanto você edita. A IA só recebe os dados públicos do trabalho (nada de matrícula, e-mail ou notas).</p>
          </Secao>
        </div>
      </div>
    </>
  );
}

function Figuras({ secao, imagens, podeAdicionar, aoAdicionar, aoMudar, aoTirar }: {
  secao: ChaveSecao; imagens: ImagemBanner[]; podeAdicionar: boolean;
  aoAdicionar: (secao: ChaveSecao, arquivo: File | undefined) => void;
  aoMudar: (id: string, campo: 'legenda' | 'fonte', valor: string) => void;
  aoTirar: (id: string) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <div className="banner-figuras">
      {imagens.map((im) => (
        <div key={im.id} className="banner-figura">
          <img src={im.img.src} alt="" />
          <div className="banner-figura-campos">
            <label className="rotulo" htmlFor={'leg-' + im.id}>Legenda</label>
            <input id={'leg-' + im.id} value={im.legenda} maxLength={150} onChange={(e) => aoMudar(im.id, 'legenda', e.target.value)} />
            <label className="rotulo" htmlFor={'fon-' + im.id}>Fonte</label>
            <input id={'fon-' + im.id} value={im.fonte} maxLength={150} onChange={(e) => aoMudar(im.id, 'fonte', e.target.value)} />
          </div>
          <button className="botao pequeno secundario" onClick={() => aoTirar(im.id)} aria-label="Tirar figura"><Trash2 className="ic" aria-hidden="true" />Tirar</button>
        </div>
      ))}
      {imagens.length < MAX_FIGURAS_SECAO && podeAdicionar && (
        <>
          <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" hidden
            onChange={(e) => { aoAdicionar(secao, e.target.files?.[0]); e.target.value = ''; }} />
          <button className="botao pequeno secundario" onClick={() => entrada.current?.click()}><ImagePlus className="ic" aria-hidden="true" />Adicionar figura</button>
        </>
      )}
    </div>
  );
}

function Campo2({ rotulo, valor, aoMudar, linhas, dica, limite }: { rotulo: string; valor: string; aoMudar: (v: string) => void; linhas: number; dica?: string; limite: number }) {
  const id = 'banner-' + rotulo.toLowerCase().replace(/\W+/g, '-');
  return (
    <div className="campo">
      <label className="rotulo rotulo-contador" htmlFor={id}>{rotulo}<span className="contador">{valor.length}/{limite}</span></label>
      {linhas === 1
        ? <input id={id} value={valor} maxLength={limite} onChange={(e) => aoMudar(e.target.value)} />
        : <textarea id={id} rows={linhas} value={valor} maxLength={limite} onChange={(e) => aoMudar(e.target.value)} />}
      {dica && <span className="ajuda">{dica}</span>}
    </div>
  );
}
