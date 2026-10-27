import type { Request } from 'express';

/** Usuário logado (as rotas que usam esta função passam antes pelo middleware autenticar). */
export const usuarioDe = (req: Request) => req.usuario!;

export const contarPalavras = (texto: string) => texto.trim().split(/\s+/).filter(Boolean).length;

/** Situações em que o TCC ainda está em andamento (RD01 e RD05). */
export const SITUACOES_ATIVAS = ['EM_PROPOSTA', 'EM_DESENVOLVIMENTO', 'APTO_DEFESA'];

export interface UsuarioLogadoLike { id: number; perfil: string; cursoId: number | null }
