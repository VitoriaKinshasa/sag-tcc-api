import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { ErroNegocio, proibido } from './errors.js';

export type Perfil = 'COORDENACAO' | 'ORIENTADOR' | 'ALUNO' | 'MEMBRO_BANCA';
export interface UsuarioLogado { id: number; perfil: Perfil; cursoId: number | null }

declare global {
  namespace Express {
    interface Request { usuario?: UsuarioLogado }
  }
}

/** Exige um token JWT válido (sessão de 30 minutos – RNF04). */
export function autenticar(req: Request, _res: Response, next: NextFunction) {
  const cabecalho = req.headers.authorization ?? '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;
  if (!token) return next(new ErroNegocio(401, 'Faça login para continuar'));
  try {
    const dados = jwt.verify(token, env.JWT_SECRET) as unknown as { sub: string; perfil: Perfil; cursoId: number | null };
    req.usuario = { id: Number(dados.sub), perfil: dados.perfil, cursoId: dados.cursoId };
    next();
  } catch {
    next(new ErroNegocio(401, 'Sessão expirada. Faça login novamente'));
  }
}

/** RNF05 – cada perfil só acessa as funções permitidas a ele. */
export function exigirPerfil(...perfis: Perfil[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario || !perfis.includes(req.usuario.perfil)) return next(proibido());
    next();
  };
}

/** Converte qualquer erro em uma resposta JSON padronizada. */
export function tratarErros(erro: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (erro instanceof ErroNegocio) {
    return res.status(erro.status).json({ erro: erro.message, regra: erro.regra });
  }
  if (erro instanceof ZodError) {
    return res.status(422).json({ erro: erro.issues[0]?.message ?? 'Dados inválidos' });
  }
  const codigo = (erro as { code?: string }).code;
  if (codigo === '23505') return res.status(409).json({ erro: 'Registro duplicado' });
  if (codigo === '23514') return res.status(422).json({ erro: 'Dados violam uma regra do sistema' });
  console.error(erro);
  return res.status(500).json({ erro: 'Erro interno do servidor' });
}
