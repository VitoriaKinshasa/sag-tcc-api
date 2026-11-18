import crypto from 'node:crypto';
import { ErroNegocio } from './errors.js';

export const TAMANHO_MAXIMO_PDF = 10 * 1024 * 1024; // 10 MB

/** Confere se o arquivo é um PDF de até 10 MB e devolve os bytes. */
export function lerPdf(nome: string, base64: string) {
  if (!/\.pdf$/i.test(nome)) throw new ErroNegocio(422, 'Envie o arquivo em PDF', 'RF14');
  const bytes = Buffer.from(base64.replace(/^data:[^,]*,/, ''), 'base64');
  if (!bytes.length) throw new ErroNegocio(422, 'O arquivo está vazio');
  if (bytes.length > TAMANHO_MAXIMO_PDF) throw new ErroNegocio(422, 'O arquivo deve ter no máximo 10 MB', 'RF14');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ErroNegocio(422, 'O arquivo não é um PDF válido', 'RF14');
  return bytes;
}

// Sem letras e números que se confundem (0/O, 1/I/L), para a pessoa digitar o código sem errar.
const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Código de verificação de documento, ex.: SAG-7F3K-92QA. */
export function gerarCodigo() {
  const bytes = crypto.randomBytes(8);
  const letras = [...bytes].map((b) => ALFABETO[b % ALFABETO.length]).join('');
  return `SAG-${letras.slice(0, 4)}-${letras.slice(4, 8)}`;
}

/** Normaliza o código digitado: "sag 7f3k 92qa" → "SAG-7F3K-92QA". */
export function normalizarCodigo(codigo: string) {
  const limpo = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const corpo = limpo.startsWith('SAG') ? limpo.slice(3) : limpo;
  return corpo.length === 8 ? `SAG-${corpo.slice(0, 4)}-${corpo.slice(4)}` : codigo.trim().toUpperCase();
}

/** "Impressão digital" (SHA-256) de um conteúdo: se qualquer coisa mudar, o resultado muda. */
export const hashDe = (conteudo: unknown) => crypto.createHash('sha256').update(JSON.stringify(conteudo)).digest('hex');
