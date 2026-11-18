/**
 * Gerador de PDF simples, sem bibliotecas: texto em Helvetica, linhas, retângulos e imagem JPEG.
 * Usado na exportação da busca de TCCs (UC23) e no banner (UC25).
 * As letras com acento funcionam porque o texto é gravado na codificação WinAnsi (Latin-1).
 */

// Larguras das letras (em milésimos do tamanho da fonte), dos códigos 32 a 255.
const LARG_N = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,761,761,761,761,761,1000,761,761,761,761,761,761,761,761,761,761,761,222,222,333,333,350,556,1000,761,761,761,761,761,761,761,761,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const LARG_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,761,761,761,761,761,1000,761,761,761,761,761,761,761,761,761,761,761,278,278,500,500,350,556,1000,761,761,761,761,761,761,761,761,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

const ESPECIAIS: Record<string, number> = { '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };

/** Converte o texto para os códigos WinAnsi (o que não existe vira "?"). */
function codigos(texto: string): number[] {
  return [...texto].map((c) => {
    if (ESPECIAIS[c]) return ESPECIAIS[c];
    const n = c.charCodeAt(0);
    return n >= 32 && n <= 255 && !(n >= 127 && n < 160) ? n : 63;
  });
}

/** Largura do texto em pontos. */
export function larguraTexto(texto: string, tamanho: number, negrito = false) {
  const tabela = negrito ? LARG_B : LARG_N;
  return codigos(texto).reduce((s, c) => s + (tabela[c - 32] ?? 556), 0) * tamanho / 1000;
}

/** Quebra o texto em linhas que cabem na largura. */
export function quebrarLinhas(texto: string, largura: number, tamanho: number, negrito = false): string[] {
  const linhas: string[] = [];
  for (const paragrafo of String(texto ?? '').split(/\r?\n/)) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const teste = atual ? atual + ' ' + palavra : palavra;
      if (larguraTexto(teste, tamanho, negrito) <= largura || !atual) atual = teste;
      else { linhas.push(atual); atual = palavra; }
    }
    linhas.push(atual);
  }
  return linhas;
}

/** Corta o texto com "…" se ele não couber na largura. */
export function cortar(texto: string, largura: number, tamanho: number, negrito = false) {
  if (larguraTexto(texto, tamanho, negrito) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && larguraTexto(t + '…', tamanho, negrito) > largura) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const corPdf = (hex: string) => [1, 3, 5].map((i) => num(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');

function textoPdf(texto: string) {
  return codigos(texto).map((c) => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c)
    : c < 128 ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0'))).join('');
}

interface Imagem { nome: string; jpeg: Buffer; largura: number; altura: number }

/**
 * Documento PDF. As coordenadas são em pontos (1 cm ≈ 28,35 pt), com (0, 0) no canto de CIMA à esquerda,
 * como numa tela (o PDF usa o canto de baixo; a conversão é feita aqui).
 */
export class DocumentoPdf {
  private paginas: string[][] = [];
  private imagens: Imagem[] = [];
  constructor(readonly largura: number, readonly altura: number) { this.novaPagina(); }

  novaPagina() { this.paginas.push([]); }
  private get atual() { return this.paginas[this.paginas.length - 1]; }

  texto(x: number, y: number, texto: string, { tamanho = 10, negrito = false, cor = '#1b2129' } = {}) {
    this.atual.push(`BT ${corPdf(cor)} rg /${negrito ? 'F2' : 'F1'} ${num(tamanho)} Tf ${num(x)} ${num(this.altura - y - tamanho * 0.8)} Td (${textoPdf(texto)}) Tj ET`);
  }
  linha(x1: number, y1: number, x2: number, y2: number, { cor = '#dde1e6', espessura = 0.6 } = {}) {
    this.atual.push(`${corPdf(cor)} RG ${num(espessura)} w ${num(x1)} ${num(this.altura - y1)} m ${num(x2)} ${num(this.altura - y2)} l S`);
  }
  retangulo(x: number, y: number, l: number, a: number, cor: string) {
    this.atual.push(`${corPdf(cor)} rg ${num(x)} ${num(this.altura - y - a)} ${num(l)} ${num(a)} re f`);
  }
  /** Coloca uma imagem JPEG (largura e altura da imagem em pixels). */
  imagem(jpeg: Buffer, px: { largura: number; altura: number }, x: number, y: number, l: number, a: number) {
    const nome = 'Im' + (this.imagens.length + 1);
    this.imagens.push({ nome, jpeg, ...px });
    this.atual.push(`q ${num(l)} 0 0 ${num(a)} ${num(x)} ${num(this.altura - y - a)} cm /${nome} Do Q`);
  }
  get totalPaginas() { return this.paginas.length; }

  gerar(): Buffer {
    const objetos: (string | Buffer)[] = [];
    const add = (o: string | Buffer) => { objetos.push(o); return objetos.length; };
    const catalogo = add(''); const paginas = add('');
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const imgs = this.imagens.map((im) => {
      const cab = `<< /Type /XObject /Subtype /Image /Width ${im.largura} /Height ${im.altura} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`;
      return { nome: im.nome, id: add(Buffer.concat([Buffer.from(cab, 'latin1'), im.jpeg, Buffer.from('\nendstream', 'latin1')])) };
    });
    const recursos = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${imgs.length ? ` /XObject << ${imgs.map((i) => `/${i.nome} ${i.id} 0 R`).join(' ')} >>` : ''} >>`;
    const kids = this.paginas.map((comandos) => {
      const conteudo = Buffer.from(comandos.join('\n'), 'latin1');
      const c = add(Buffer.concat([Buffer.from(`<< /Length ${conteudo.length} >>\nstream\n`, 'latin1'), conteudo, Buffer.from('\nendstream', 'latin1')]));
      return add(`<< /Type /Page /Parent ${paginas} 0 R /MediaBox [0 0 ${num(this.largura)} ${num(this.altura)}] /Resources ${recursos} /Contents ${c} 0 R >>`);
    });
    objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${paginas} 0 R >>`;
    objetos[paginas - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;

    const partes: Buffer[] = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    let pos = partes[0].length;
    const xref: number[] = [];
    objetos.forEach((o, i) => {
      xref.push(pos);
      const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), typeof o === 'string' ? Buffer.from(o, 'latin1') : o, Buffer.from('\nendobj\n', 'latin1')]);
      partes.push(b); pos += b.length;
    });
    const tabela = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${xref.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('')}`
      + `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
    partes.push(Buffer.from(tabela, 'latin1'));
    return Buffer.concat(partes);
  }
}

/** Tamanhos de página em pontos. */
export const A4_DEITADO = { largura: 841.89, altura: 595.28 };
export const A1_EM_PE = { largura: 1683.78, altura: 2383.94 };
/** Banner de 90 × 120 cm em pé (norma de pôster usada no UC25). */
export const BANNER_90X120 = { largura: 2551.18, altura: 3401.57 };
