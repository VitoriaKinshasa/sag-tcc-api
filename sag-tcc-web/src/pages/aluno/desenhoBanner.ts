// Desenho do banner (UC25) num <canvas>. O mesmo desenho serve para a prévia na tela,
// para a imagem e para o PDF de 90 × 120 cm (que leva a imagem em alta resolução).
//
// Segue as normas de formatação do pôster:
//   título 60, CAIXA ALTA e negrito · nomes 40, CAIXA ALTA e negrito ·
//   instituição e área temática 48, CAIXA ALTA e negrito ·
//   títulos das seções 54, CAIXA ALTA, negrito e centralizados · corpo 35 em negrito · referências 30.
// Todas as medidas abaixo estão em pontos (pt) do banner de verdade; o canvas é ampliado por ESCALA.
import type { ConteudoBanner, SituacaoBanner } from '../../types';

/** Banner de 90 × 120 cm em pé. */
const LARGURA_PT = 2551.18;
const ALTURA_PT = 3401.57;
/** Tamanho da imagem em pixels (proporção 3:4, cerca de 85 pontos por polegada no tamanho real). */
export const LARGURA_BANNER = 3000;
export const ALTURA_BANNER = 4000;
const ESCALA = LARGURA_BANNER / LARGURA_PT;

const COR = {
  verdeEscuro: '#004d2b', verde: '#006638', verdeMedio: '#008349', verdeClaro: '#3fae73',
  texto: '#1b2129', cinza: '#4a525c', branco: '#ffffff', borda: '#006638',
};
const FONTE = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

const TAM = { titulo: 60, nomes: 40, instituicao: 48, secao: 54, corpo: 35, referencias: 30, legenda: 28, fonte: 24, rodape: 28 };
const ENTRELINHA = 1.5;

export type ChaveSecao = 'introducao' | 'objetivo' | 'metodologia' | 'resultados' | 'conclusao' | 'agradecimentos' | 'referencias';

export const SECOES: { chave: ChaveSecao; titulo: string; rotulo: string; coluna: 0 | 1; opcional?: boolean }[] = [
  { chave: 'introducao', titulo: 'Introdução', rotulo: 'Introdução', coluna: 0 },
  { chave: 'objetivo', titulo: 'Objetivos', rotulo: 'Objetivos', coluna: 0 },
  { chave: 'metodologia', titulo: 'Metodologia da pesquisa', rotulo: 'Metodologia da pesquisa', coluna: 0 },
  { chave: 'resultados', titulo: 'Resultados e/ou discussão', rotulo: 'Resultados e/ou discussão', coluna: 1 },
  { chave: 'conclusao', titulo: 'Conclusões', rotulo: 'Conclusões', coluna: 1 },
  { chave: 'agradecimentos', titulo: 'Agradecimentos', rotulo: 'Agradecimentos (opcional)', coluna: 1, opcional: true },
  { chave: 'referencias', titulo: 'Referências', rotulo: 'Referências', coluna: 1 },
];

/** Figura, quadro ou tabela colocada numa seção. */
export interface ImagemBanner {
  id: string;
  secao: ChaveSecao;
  img: HTMLImageElement;
  legenda: string;
  fonte: string;
}

/** Resultado do desenho: diz se tudo coube nas colunas. */
export interface ResultadoDesenho { cabe: boolean; colunasCheias: number[] }

// ------------------------------------------------------------------ texto

type Linha = { t: string; topico: boolean; continua: boolean; novoParagrafo: boolean };

function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number) {
  const linhas: Linha[] = [];
  let primeiroParagrafo = true;
  for (const bruto of texto.split(/\r?\n/)) {
    const p = bruto.trim();
    if (!p) continue;
    const topico = /^[•\-*]\s+/.test(p);
    const limpo = p.replace(/^[•\-*]\s+/, '');
    const recuo = topico ? ctx.measureText('•  ').width : 0;
    let atual = '';
    let primeira = true;
    for (const palavra of limpo.split(/\s+/)) {
      const teste = atual ? atual + ' ' + palavra : palavra;
      if (ctx.measureText(teste).width <= largura - recuo || !atual) atual = teste;
      else {
        linhas.push({ t: atual, topico, continua: !primeira, novoParagrafo: primeira && !primeiroParagrafo });
        primeira = false; atual = palavra;
      }
    }
    if (atual) linhas.push({ t: atual, topico, continua: !primeira, novoParagrafo: primeira && !primeiroParagrafo });
    primeiroParagrafo = false;
  }
  return linhas;
}

const fonte = (tam: number, negrito: boolean) => `${negrito ? '700 ' : ''}${tam}px ${FONTE}`;

/** Mede (e, se pedir, escreve) um bloco de texto. Devolve a altura usada. */
function texto(ctx: CanvasRenderingContext2D, conteudo: string, x: number, y: number, largura: number,
  tam: number, negrito: boolean, escrever: boolean, cor = COR.texto) {
  ctx.font = fonte(tam, negrito);
  const linhas = quebrar(ctx, conteudo, largura);
  const passo = tam * ENTRELINHA;
  const espacoParagrafo = tam * 0.4;
  const recuo = ctx.measureText('•  ').width;
  let yy = y;
  for (const l of linhas) {
    if (l.novoParagrafo) yy += espacoParagrafo;
    if (escrever) {
      ctx.textBaseline = 'top';
      if (l.topico && !l.continua) { ctx.fillStyle = COR.verdeMedio; ctx.fillText('•', x, yy + tam * 0.1); }
      ctx.fillStyle = cor;
      ctx.fillText(l.t, x + (l.topico ? recuo : 0), yy + tam * 0.1);
    }
    yy += passo;
  }
  return yy - y;
}

/** Linhas centralizadas (para título, nomes e instituição). Devolve a altura usada. */
function centralizado(ctx: CanvasRenderingContext2D, conteudo: string, xCentro: number, y: number, largura: number,
  tam: number, cor: string, escrever = true, entrelinha = 1.2) {
  ctx.font = fonte(tam, true);
  const linhas = quebrar(ctx, conteudo, largura);
  if (escrever) {
    ctx.fillStyle = cor; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    linhas.forEach((l, i) => ctx.fillText(l.t, xCentro, y + i * tam * entrelinha));
    ctx.textAlign = 'left';
  }
  return linhas.length * tam * entrelinha;
}

const maiusculas = (s: string) => s.toLocaleUpperCase('pt-BR');

// ------------------------------------------------------------------ logo

let logo: HTMLImageElement | null = null;
/** Carrega a logo da UEA antes de desenhar. */
export function carregarLogo(): Promise<HTMLImageElement | null> {
  if (logo?.complete) return Promise.resolve(logo);
  return new Promise((ok) => {
    const img = new Image();
    img.onload = () => { logo = img; ok(img); };
    img.onerror = () => ok(null);
    img.src = '/uea.png';
  });
}

// ------------------------------------------------------------------ peças do desenho

function degradeVerde(ctx: CanvasRenderingContext2D, x0: number, x1: number) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, COR.verdeEscuro);
  g.addColorStop(0.55, COR.verdeMedio);
  g.addColorStop(1, COR.verdeClaro);
  return g;
}

/** Faixa do topo com a borda de baixo em onda. */
function faixaTopo(ctx: CanvasRenderingContext2D, altura: number) {
  const W = LARGURA_PT;
  ctx.fillStyle = degradeVerde(ctx, 0, W);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, altura - 40);
  ctx.bezierCurveTo(W * 0.7, altura + 40, W * 0.35, altura - 90, 0, altura);
  ctx.closePath(); ctx.fill();
  // fio claro acompanhando a onda
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(W, altura - 70);
  ctx.bezierCurveTo(W * 0.7, altura + 10, W * 0.35, altura - 120, 0, altura - 30); ctx.stroke();
}

/** Faixa do rodapé com a borda de cima em onda. */
function faixaRodape(ctx: CanvasRenderingContext2D, altura: number, frase: string) {
  const W = LARGURA_PT; const H = ALTURA_PT; const topo = H - altura;
  ctx.fillStyle = degradeVerde(ctx, W, 0);
  ctx.beginPath();
  ctx.moveTo(0, topo + 30);
  ctx.bezierCurveTo(W * 0.3, topo - 60, W * 0.65, topo + 90, W, topo);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = COR.branco; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = fonte(TAM.rodape, false);
  ctx.fillText(frase, W / 2, H - altura * 0.38);
  ctx.textAlign = 'left';
}

/** Cabeçalho verde de uma seção, com o nome centralizado. */
function cabecalhoSecao(ctx: CanvasRenderingContext2D, titulo: string, x: number, y: number, largura: number, altura: number) {
  ctx.fillStyle = degradeVerde(ctx, x, x + largura);
  ctx.fillRect(x, y, largura, altura);
  ctx.fillStyle = COR.branco; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let tam = TAM.secao;
  ctx.font = fonte(tam, true);
  while (ctx.measureText(maiusculas(titulo)).width > largura - 40 && tam > 36) { tam -= 2; ctx.font = fonte(tam, true); }
  ctx.fillText(maiusculas(titulo), x + largura / 2, y + altura / 2 + 3);
  ctx.textAlign = 'left';
}

// ------------------------------------------------------------------ desenho completo

const ALTURA_CABECALHO_SECAO = TAM.secao * 1.7;
const PADDING = 26;
const ALTURA_MAX_IMAGEM = 760;

interface Bloco {
  chave: ChaveSecao; titulo: string; texto: string; tamTexto: number; negrito: boolean;
  alturaTexto: number;
  imagens: { im: ImagemBanner; numero: number; proporcao: number; alturaLegenda: number; alturaFonte: number }[];
}

/**
 * Desenha o banner inteiro. Devolve se o conteúdo coube nas duas colunas
 * (as letras seguem o tamanho da norma, então quem se ajusta são as imagens).
 */
export function desenharBanner(canvas: HTMLCanvasElement, c: ConteudoBanner, d: SituacaoBanner['dados'], imagens: ImagemBanner[]): ResultadoDesenho {
  canvas.width = LARGURA_BANNER; canvas.height = ALTURA_BANNER;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(ESCALA, 0, 0, ESCALA, 0, 0);
  const W = LARGURA_PT; const H = ALTURA_PT; const M = 70;

  ctx.fillStyle = COR.branco; ctx.fillRect(0, 0, W, H);

  // ---- Topo: logo da UEA à esquerda e o título
  const ladoLogo = 300;
  const xTitulo = M + ladoLogo + 50;
  const larguraTitulo = W - xTitulo - M;
  const titulo = maiusculas(c.titulo || d.titulo);
  const alturaTitulo = centralizado(ctx, titulo, xTitulo + larguraTitulo / 2, 0, larguraTitulo, TAM.titulo, COR.branco, false);
  const alturaFaixa = Math.max(ladoLogo + 2 * 55, alturaTitulo + 2 * 70) + 40;
  faixaTopo(ctx, alturaFaixa);

  const yLogo = (alturaFaixa - 40 - ladoLogo) / 2;
  ctx.fillStyle = COR.branco;
  ctx.beginPath(); ctx.roundRect(M, yLogo, ladoLogo, ladoLogo, 24); ctx.fill();
  if (logo) ctx.drawImage(logo, M + 18, yLogo + 18, ladoLogo - 36, ladoLogo - 36);
  centralizado(ctx, titulo, xTitulo + larguraTitulo / 2, (alturaFaixa - 40 - alturaTitulo) / 2, larguraTitulo, TAM.titulo, COR.branco);

  // ---- Autores, área temática e instituição
  let y = alturaFaixa + 50;
  const autores = [d.aluno, ...c.coautores.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)].join('; ');
  y += centralizado(ctx, maiusculas(autores), W / 2, y, W - 2 * M, TAM.nomes, COR.texto);
  const orientacao = [d.orientador && `Orientador(a): ${d.orientador}`, d.coorientador && `Coorientador(a): ${d.coorientador}`].filter(Boolean).join('   ·   ');
  if (orientacao) y += centralizado(ctx, maiusculas(orientacao), W / 2, y + 6, W - 2 * M, TAM.nomes, COR.texto) + 6;
  y += 18;
  y += centralizado(ctx, maiusculas(`Área temática: ${c.areaTematica || d.area}`), W / 2, y, W - 2 * M, TAM.instituicao, COR.verde);
  y += centralizado(ctx, 'UNIVERSIDADE DO ESTADO DO AMAZONAS – ESCOLA SUPERIOR DE TECNOLOGIA', W / 2, y, W - 2 * M, TAM.instituicao, COR.verde);
  y += 40;

  // ---- Seções em duas colunas
  const alturaRodape = 210;
  const fimColunas = H - alturaRodape - 40;
  const gap = 50;
  const col = (W - 2 * M - gap) / 2;
  const larguraTexto = col - 2 * PADDING;

  let numero = 0;
  const colunas: Bloco[][] = [[], []];
  for (const s of SECOES) {
    const conteudo = (c[s.chave] ?? '').trim();
    const imgs = imagens.filter((i) => i.secao === s.chave);
    if (s.opcional && !conteudo && !imgs.length) continue;
    const ehRef = s.chave === 'referencias';
    const tamTexto = ehRef ? TAM.referencias : TAM.corpo;
    const alturaTexto = conteudo ? texto(ctx, conteudo, 0, 0, larguraTexto, tamTexto, !ehRef, false) : tamTexto * ENTRELINHA;
    colunas[s.coluna].push({
      chave: s.chave, titulo: s.titulo, texto: conteudo, tamTexto, negrito: !ehRef, alturaTexto,
      imagens: imgs.map((im) => {
        numero += 1;
        const legenda = `Figura ${numero}${im.legenda.trim() ? ` – ${im.legenda.trim()}` : ''}`;
        return {
          im, numero, proporcao: im.img.naturalHeight / im.img.naturalWidth,
          alturaLegenda: texto(ctx, legenda, 0, 0, larguraTexto, TAM.legenda, true, false),
          alturaFonte: im.fonte.trim() ? texto(ctx, `Fonte: ${im.fonte.trim()}`, 0, 0, larguraTexto, TAM.fonte, false, false) : 0,
        };
      }),
    });
  }

  const resultado: ResultadoDesenho = { cabe: true, colunasCheias: [] };
  colunas.forEach((blocos, i) => {
    const x = M + i * (col + gap);
    const disponivel = fimColunas - y;
    const espacoEntre = 36;
    // parte fixa de cada bloco: cabeçalho, texto, legendas e espaços
    const fixo = (b: Bloco) => ALTURA_CABECALHO_SECAO + 2 * PADDING + b.alturaTexto
      + b.imagens.reduce((s, im) => s + im.alturaLegenda + im.alturaFonte + 30, 0);
    const alturaNatural = (largura: number, proporcao: number) => Math.min(largura * proporcao, ALTURA_MAX_IMAGEM);
    const somaFixa = blocos.reduce((s, b) => s + fixo(b), 0) + espacoEntre * (blocos.length - 1);
    const somaImagens = blocos.reduce((s, b) => s + b.imagens.reduce((t, im) => t + alturaNatural(larguraTexto, im.proporcao), 0), 0);
    // se não couber, as imagens diminuem (até um quarto do tamanho; menos que isso ficariam ilegíveis)
    let fatorImagens = 1;
    if (somaFixa + somaImagens > disponivel && somaImagens > 0) fatorImagens = Math.max((disponivel - somaFixa) / somaImagens, 0.25);
    const alturas = blocos.map((b) => fixo(b) + b.imagens.reduce((s, im) => s + alturaNatural(larguraTexto, im.proporcao) * fatorImagens, 0));
    const usado = alturas.reduce((s, a) => s + a, 0) + espacoEntre * (blocos.length - 1);
    if (usado > disponivel + 1) { resultado.cabe = false; resultado.colunasCheias.push(i); }
    // a sobra é dividida entre as caixas, para as duas colunas terminarem juntas
    const sobra = Math.max(disponivel - usado, 0) / Math.max(blocos.length, 1);

    let yy = y;
    blocos.forEach((b, k) => {
      const alturaCaixa = alturas[k] + sobra;
      ctx.strokeStyle = COR.borda; ctx.lineWidth = 3;
      ctx.strokeRect(x, yy, col, alturaCaixa);
      cabecalhoSecao(ctx, b.titulo, x, yy, col, ALTURA_CABECALHO_SECAO);
      let yt = yy + ALTURA_CABECALHO_SECAO + PADDING;
      if (b.texto) yt += texto(ctx, b.texto, x + PADDING, yt, larguraTexto, b.tamTexto, b.negrito, true);
      else yt += b.tamTexto * ENTRELINHA;
      for (const im of b.imagens) {
        yt += 30;
        const legenda = `Figura ${im.numero}${im.im.legenda.trim() ? ` – ${im.im.legenda.trim()}` : ''}`;
        // legenda centralizada acima (ABNT), fonte abaixo
        ctx.font = fonte(TAM.legenda, true);
        const umaLinha = ctx.measureText(legenda).width <= larguraTexto;
        if (umaLinha) { ctx.fillStyle = COR.texto; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(legenda, x + col / 2, yt + TAM.legenda * 0.1); ctx.textAlign = 'left'; }
        else texto(ctx, legenda, x + PADDING, yt, larguraTexto, TAM.legenda, true, true);
        yt += im.alturaLegenda;
        const alt = alturaNatural(larguraTexto, im.proporcao) * fatorImagens;
        const larg = alt / im.proporcao;
        ctx.drawImage(im.im.img, x + (col - larg) / 2, yt, larg, alt);
        yt += alt;
        if (im.alturaFonte) {
          ctx.font = fonte(TAM.fonte, false); ctx.fillStyle = COR.cinza; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
          ctx.fillText(`Fonte: ${im.im.fonte.trim()}`, x + col / 2, yt + 6, larguraTexto); ctx.textAlign = 'left';
          yt += im.alturaFonte;
        }
      }
      yy += alturaCaixa + espacoEntre;
    });
  });

  // ---- Rodapé
  faixaRodape(ctx, alturaRodape,
    `Universidade do Estado do Amazonas · Escola Superior de Tecnologia · Av. Darcy Vargas, 1200 – Parque Dez de Novembro – Manaus/AM · ${d.curso} · ${d.ano}`);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return resultado;
}

/** Lê o arquivo de imagem escolhido e reduz para no máximo 1600 px, para o banner não ficar pesado demais. */
export function lerImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo);
    const original = new Image();
    original.onload = () => {
      const maior = Math.max(original.naturalWidth, original.naturalHeight);
      const fator = Math.min(1, 1600 / maior);
      const c = document.createElement('canvas');
      c.width = Math.round(original.naturalWidth * fator); c.height = Math.round(original.naturalHeight * fator);
      const cx = c.getContext('2d')!;
      cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(original, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const reduzida = new Image();
      reduzida.onload = () => ok(reduzida);
      reduzida.onerror = () => falha(new Error('Não foi possível ler a imagem.'));
      reduzida.src = c.toDataURL('image/jpeg', 0.9);
    };
    original.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Esse arquivo não é uma imagem que o navegador consegue abrir.')); };
    original.src = url;
  });
}
