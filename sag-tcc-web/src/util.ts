import type { Etapa, Id, PapelBanca, Perfil, Resultado, Situacao } from './types';

/** Compara dois ids (um pode vir como texto e o outro como número). */
export const mesmoId = (a: Id | null | undefined, b: Id | null | undefined) => a != null && b != null && String(a) === String(b);

const FUSO = 'America/Manaus';

/** 12/11/2026 14:30 */
export const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' }) : '—';

/** quinta-feira, 12 de novembro de 2026 às 14:30 */
export const dataHoraLonga = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { timeZone: FUSO, dateStyle: 'full', timeStyle: 'short' }) : '—';

/** "2026-11-12" -> "12/11/2026" (datas sem hora, como as do calendário) */
export const dia = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');

/** 7.5 -> "7,50" */
export const nota = (n?: number | null) => (n == null ? '—' : Number(n).toFixed(2).replace('.', ','));

export const tamanho = (b: number) =>
  b > 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

/** Semestre do dia de hoje, ex.: 2026.2 */
export const semestreAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}.${d.getMonth() < 6 ? 1 : 2}`;
};

/** Converte o valor de um <input type="datetime-local"> para o formato da API. */
export const paraISO = (local: string) => new Date(local).toISOString();

/** Hoje + n dias no formato do <input type="datetime-local"> (para o atributo min). */
export const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

// ---------------------------------------------------------------------------
// Nomes que aparecem na tela (cor: verde, vermelho, amarelo, azul ou cinza)
// ---------------------------------------------------------------------------
export type Cor = 'verde' | 'vermelho' | 'amarelo' | 'azul' | 'cinza';

export const PERFIS: Record<Perfil, string> = {
  ALUNO: 'Aluno(a)', ORIENTADOR: 'Professor(a) orientador(a)', COORDENACAO: 'Coordenação', MEMBRO_BANCA: 'Membro de banca',
};

export const SITUACOES: Record<Situacao, [string, Cor]> = {
  EM_PROPOSTA: ['Em proposta', 'amarelo'],
  EM_DESENVOLVIMENTO: ['Em desenvolvimento', 'azul'],
  APTO_DEFESA: ['Apto à defesa', 'azul'],
  APROVADO: ['Aprovado', 'verde'],
  APROVADO_PUBLICACAO: ['Aprovado por publicação', 'verde'],
  REPROVADO: ['Reprovado', 'vermelho'],
  NAO_APRESENTADO: ['Não apresentado', 'vermelho'],
  CANCELADO: ['Cancelado', 'cinza'],
};

/** Para quais situações o orientador ou a coordenação pode mudar o TCC. */
export const TRANSICOES: Partial<Record<Situacao, Situacao[]>> = {
  EM_PROPOSTA: ['CANCELADO'],
  EM_DESENVOLVIMENTO: ['APTO_DEFESA', 'NAO_APRESENTADO', 'CANCELADO'],
  APTO_DEFESA: ['EM_DESENVOLVIMENTO', 'NAO_APRESENTADO', 'CANCELADO'],
};

export const ETAPAS: [Etapa, string][] = [
  ['PROPOSTA', 'Proposta'], ['QUALIFICACAO', 'Qualificação'], ['VERSAO_FINAL', 'Versão final'],
  ['DEFESA', 'Defesa'], ['ENTREGA_DEFINITIVA', 'Entrega definitiva'],
];
export const NOME_ETAPA = Object.fromEntries(ETAPAS) as Record<Etapa, string>;

export const PAPEIS: Record<PapelBanca, string> = { PRESIDENTE: 'Presidente', TITULAR: 'Titular', SUPLENTE: 'Suplente' };

export const RESULTADOS: Record<Resultado, [string, Cor]> = {
  APROVADO: ['Aprovado', 'verde'],
  APROVADO_COM_CORRECOES: ['Aprovado com correções', 'verde'],
  REPROVADO: ['Reprovado', 'vermelho'],
};

export const STATUS_BANCA: Record<string, [string, Cor]> = {
  AGENDADA: ['Agendada', 'azul'], REALIZADA: ['Realizada', 'verde'], CANCELADA: ['Cancelada', 'cinza'],
};

export const STATUS_PEDIDO: Record<string, [string, Cor]> = {
  PENDENTE: ['Aguardando', 'amarelo'], ACEITA: ['Aceita', 'verde'], APROVADA: ['Aprovada', 'verde'], RECUSADA: ['Recusada', 'vermelho'],
};

/** Primeiro nome, para cumprimentar: "Vitória Gabrielle" -> "Vitória" (ignora "Prof." e "Dr."). */
export const primeiroNome = (nome: string) =>
  nome.split(' ').find((p) => !/^(prof|profa|dr|dra)\.?$/i.test(p)) ?? nome;
