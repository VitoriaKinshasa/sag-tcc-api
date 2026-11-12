import type { Request } from 'express';

/** Usuário logado (as rotas que usam esta função passam antes pelo middleware autenticar). */
export const usuarioDe = (req: Request) => req.usuario!;

export const contarPalavras = (texto: string) => texto.trim().split(/\s+/).filter(Boolean).length;

/** Situações em que o TCC ainda está em andamento (RD01 e RD05). */
export const SITUACOES_ATIVAS = ['EM_PROPOSTA', 'EM_DESENVOLVIMENTO', 'APTO_DEFESA'];

export interface UsuarioLogadoLike { id: number; perfil: string; cursoId: number | null }

/** Fuso horário da UEA (Manaus). Datas de calendário e de banca são comparadas neste fuso. */
export const FUSO = 'America/Manaus';

/** Dia (AAAA-MM-DD) de um momento, no horário de Manaus. */
export const diaEmManaus = (momento: Date = new Date()) => momento.toLocaleDateString('en-CA', { timeZone: FUSO });

/** Data e hora legíveis em português, no horário de Manaus. */
export const dataHoraBR = (momento: Date | string) =>
  new Date(momento).toLocaleString('pt-BR', { timeZone: FUSO, dateStyle: 'short', timeStyle: 'short' });

/** Semestre letivo de um dia: '2026-11-11' → '2026.2'. */
export const semestreDe = (dia: string) => `${dia.slice(0, 4)}.${Number(dia.slice(5, 7)) <= 6 ? 1 : 2}`;

/** Nomes das situações do TCC para as mensagens. */
export const NOME_SITUACAO: Record<string, string> = {
  EM_PROPOSTA: 'Em proposta', EM_DESENVOLVIMENTO: 'Em desenvolvimento', APTO_DEFESA: 'Apto à defesa',
  APROVADO: 'Aprovado', APROVADO_PUBLICACAO: 'Aprovado para publicação', NAO_APRESENTADO: 'Não apresentado',
  REPROVADO: 'Reprovado', CANCELADO: 'Cancelado',
};
