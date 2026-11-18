import { useCallback, useEffect, useState } from 'react';
import { ErroApi } from './api';

/**
 * Carrega dados da API quando a tela abre.
 * Ex.: const { dados, carregando, erro, recarregar } = useCarregar(() => api<Tcc[]>('GET', '/tccs'), []);
 */
export function useCarregar<T>(buscar: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | undefined>(undefined);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    buscar()
      .then((d) => { if (ativo) { setDados(d); setErro(null); } })
      .catch((e) => { if (ativo) setErro(e instanceof ErroApi ? e.message : 'Não foi possível carregar.'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);

  const recarregar = useCallback(() => setVersao((v) => v + 1), []);
  return { dados, carregando, erro, recarregar };
}

/** Busca que não mostra erro (ex.: "meu TCC" quando o aluno ainda não tem TCC devolve 404). */
export async function talvez<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ErroApi && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}
