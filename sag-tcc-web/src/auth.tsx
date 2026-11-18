import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, definirToken, quandoSessaoExpirar } from './api';
import type { Perfil, Usuario } from './types';

interface Sessao { token: string; usuario: Usuario; termoPendente: boolean }

interface Auth {
  usuario: Usuario | null;
  termoPendente: boolean;
  entrar: (email: string, senha: string) => Promise<Usuario>;
  sair: (motivo?: string) => void;
  aceitarTermo: () => Promise<void>;
  /** Mensagem mostrada na tela de login (ex.: "sua sessão expirou"). */
  avisoLogin: string | null;
}

const CHAVE = 'sagtcc-sessao';
const AuthContext = createContext<Auth | null>(null);

/** Lê os dados que estão dentro do token (perfil, curso e validade). */
function lerToken(token: string): { cursoId?: number | null; exp?: number } {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return {};
  }
}

function sessaoSalva(): Sessao | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(CHAVE) || 'null') as Sessao | null;
    if (!s) return null;
    const { exp } = lerToken(s.token);
    if (exp && exp * 1000 < Date.now()) return null; // token vencido
    return s;
  } catch {
    return null;
  }
}

function salvar(s: Sessao | null) {
  try {
    if (s) sessionStorage.setItem(CHAVE, JSON.stringify(s));
    else sessionStorage.removeItem(CHAVE);
  } catch { /* navegador sem armazenamento: a sessão fica só na memória */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(() => {
    const s = sessaoSalva();
    definirToken(s?.token ?? null);
    return s;
  });
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null);

  const sair = useCallback((motivo?: string) => {
    definirToken(null);
    salvar(null);
    setSessao(null);
    setAvisoLogin(motivo ?? null);
  }, []);

  useEffect(() => { quandoSessaoExpirar(() => sair('Sua sessão expirou. Entre de novo para continuar.')); }, [sair]);

  // Sai sozinho quando o token vence (30 minutos depois do login).
  useEffect(() => {
    if (!sessao) return;
    const { exp } = lerToken(sessao.token);
    if (!exp) return;
    const t = setTimeout(() => sair('Sua sessão expirou. Entre de novo para continuar.'), Math.max(0, exp * 1000 - Date.now()));
    return () => clearTimeout(t);
  }, [sessao, sair]);

  const entrar = async (email: string, senha: string) => {
    const r = await api<{ token: string; usuario: { id: number; nome: string; perfil: Perfil }; termoPendente: boolean }>(
      'POST', '/auth/login', { email, senha });
    const usuario: Usuario = { ...r.usuario, cursoId: lerToken(r.token).cursoId ?? null };
    const nova = { token: r.token, usuario, termoPendente: r.termoPendente };
    definirToken(r.token);
    salvar(nova);
    setSessao(nova);
    setAvisoLogin(null);
    return usuario;
  };

  const aceitarTermo = async () => {
    await api('POST', '/auth/aceitar-termo');
    setSessao((s) => {
      if (!s) return s;
      const nova = { ...s, termoPendente: false };
      salvar(nova);
      return nova;
    });
  };

  return (
    <AuthContext.Provider value={{ usuario: sessao?.usuario ?? null, termoPendente: !!sessao?.termoPendente, entrar, sair, aceitarTermo, avisoLogin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}

/** Usuário logado (só usar em telas que exigem login). */
export function useUsuario(): Usuario {
  const { usuario } = useAuth();
  if (!usuario) throw new Error('Tela exige login');
  return usuario;
}
