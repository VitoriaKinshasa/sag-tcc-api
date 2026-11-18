// Cliente da API: todas as telas falam com o backend por aqui.

export class ErroApi extends Error {
  constructor(mensagem: string, public status: number) {
    super(mensagem);
  }
}

let token: string | null = null;
let aoExpirar: () => void = () => {};

export function definirToken(t: string | null) { token = t; }
export function quandoSessaoExpirar(fn: () => void) { aoExpirar = fn; }

/** Tira da mensagem os códigos internos (RD08, RF14, UC19...) que não fazem sentido para quem usa o sistema. */
export function limparMensagem(m: string) {
  return m.replace(/\s*\((?:R[DFN]|RNF|UC)\d+[^)]*\)/g, '').replace(/\b(?:R[DFN]|RNF|UC)\d+\s*[–-]\s*/g, '').trim();
}

/** Chama a API. Em caso de erro, lança ErroApi com a mensagem já pronta para mostrar. */
export async function api<T = unknown>(metodo: string, url: string, corpo?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch('/api' + url, { method: metodo, headers, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  } catch {
    throw new ErroApi('Não foi possível conectar ao servidor. Verifique sua internet ou se o sistema está ligado.', 0);
  }
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !url.startsWith('/auth/')) {
      aoExpirar();
      throw new ErroApi('Sua sessão expirou. Entre de novo.', 401);
    }
    throw new ErroApi(limparMensagem(dados.erro || 'Algo deu errado. Tente de novo.'), res.status);
  }
  return dados as T;
}

/** Baixa um arquivo protegido (precisa do token, por isso não pode ser um link comum). */
export async function baixar(url: string, nomeArquivo: string) {
  const res = await fetch('/api' + url, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!res.ok) throw new ErroApi('Não foi possível baixar o arquivo.', res.status);
  const link = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = link;
  a.download = nomeArquivo;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(link), 5000);
}

/** Lê um arquivo escolhido no computador e devolve o conteúdo em base64 (é assim que o PDF vai para a API). */
export function lerBase64(arquivo: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1]);
    r.onerror = erro;
    r.readAsDataURL(arquivo);
  });
}
