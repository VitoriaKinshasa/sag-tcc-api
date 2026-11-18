// Peças pequenas reaproveitadas em todas as telas.
import { useId, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Inbox, type LucideIcon } from 'lucide-react';
import type { Cor } from '../util';
import { SITUACOES } from '../util';
import type { Situacao } from '../types';

export function Pagina({ titulo, descricao, acoes, children }: { titulo: ReactNode; descricao?: ReactNode; acoes?: ReactNode; children: ReactNode }) {
  return (
    <section className="pagina">
      <div className="pagina-topo">
        <div>
          <h1>{titulo}</h1>
          {descricao && <p className="pagina-descricao">{descricao}</p>}
        </div>
        {acoes && <div className="pagina-acoes">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

export function Cartao({ titulo, descricao, acoes, children, className = '' }: { titulo?: ReactNode; descricao?: ReactNode; acoes?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`cartao ${className}`}>
      {(titulo || acoes) && (
        <div className="cartao-topo">
          <div>
            {titulo && <h2>{titulo}</h2>}
            {descricao && <p className="cartao-descricao">{descricao}</p>}
          </div>
          {acoes && <div className="cartao-acoes">{acoes}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function Selo({ cor = 'azul', children }: { cor?: Cor; children: ReactNode }) {
  return <span className={`selo selo-${cor}`}>{children}</span>;
}

export function SeloSituacao({ situacao, atrasado }: { situacao: Situacao; atrasado?: boolean }) {
  const [texto, cor] = SITUACOES[situacao] ?? [situacao, 'cinza'];
  return (
    <span className="selos">
      <Selo cor={cor}>{texto}</Selo>
      {atrasado && <Selo cor="vermelho">Atrasado</Selo>}
    </span>
  );
}

/** Selo a partir de um mapa { VALOR: [texto, cor] }. */
export function SeloDe({ mapa, valor }: { mapa: Record<string, [string, Cor]>; valor: string }) {
  const [texto, cor] = mapa[valor] ?? [valor, 'cinza'];
  return <Selo cor={cor}>{texto}</Selo>;
}

// ---------------------------------------------------------------------------
// Campos de formulário (sempre com rótulo, para acessibilidade)
// ---------------------------------------------------------------------------
interface CampoBase { rotulo: string; ajuda?: ReactNode; obrigatorio?: boolean; erro?: string | null }

function Envolve({ id, rotulo, ajuda, obrigatorio, erro, children }: CampoBase & { id: string; children: ReactNode }) {
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}{obrigatorio && <span className="obrigatorio" aria-hidden="true"> *</span>}</label>
      {children}
      {ajuda && <span className="ajuda" id={id + '-ajuda'}>{ajuda}</span>}
      {erro && <span className="erro-campo">{erro}</span>}
    </div>
  );
}

export function Campo({ rotulo, ajuda, obrigatorio, erro, ...props }: CampoBase & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Envolve id={id} rotulo={rotulo} ajuda={ajuda} obrigatorio={obrigatorio} erro={erro}>
      <input id={id} required={obrigatorio} aria-describedby={ajuda ? id + '-ajuda' : undefined} aria-invalid={!!erro} {...props} />
    </Envolve>
  );
}

export function CampoTexto({ rotulo, ajuda, obrigatorio, erro, ...props }: CampoBase & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Envolve id={id} rotulo={rotulo} ajuda={ajuda} obrigatorio={obrigatorio} erro={erro}>
      <textarea id={id} required={obrigatorio} aria-describedby={ajuda ? id + '-ajuda' : undefined} aria-invalid={!!erro} {...props} />
    </Envolve>
  );
}

export function CampoSelecao({ rotulo, ajuda, obrigatorio, erro, children, ...props }: CampoBase & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Envolve id={id} rotulo={rotulo} ajuda={ajuda} obrigatorio={obrigatorio} erro={erro}>
      <select id={id} required={obrigatorio} aria-describedby={ajuda ? id + '-ajuda' : undefined} {...props}>{children}</select>
    </Envolve>
  );
}

// ---------------------------------------------------------------------------
// Tabela que vira "cartõezinhos" no celular
// ---------------------------------------------------------------------------
export interface Coluna<T> { titulo: string; valor: (linha: T) => ReactNode; className?: string }

export function Tabela<T>({ colunas, linhas, chave, vazio = 'Nada por aqui ainda.' }: { colunas: Coluna<T>[]; linhas: T[]; chave: (l: T) => string | number; vazio?: string }) {
  if (!linhas.length) return <Vazio>{vazio}</Vazio>;
  return (
    <div className="tabela-caixa">
      <table className="tabela">
        <thead><tr>{colunas.map((c) => <th key={c.titulo} scope="col">{c.titulo}</th>)}</tr></thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={chave(l)}>
              {colunas.map((c) => <td key={c.titulo} data-rotulo={c.titulo} className={c.className}>{c.valor(l)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Vazio({ children, icone: Icone = Inbox }: { children: ReactNode; icone?: LucideIcon }) {
  return <div className="vazio"><Icone className="vazio-icone" aria-hidden="true" strokeWidth={1.5} /><p>{children}</p></div>;
}

export function Carregando({ texto = 'Carregando...' }: { texto?: string }) {
  return <div className="carregando" role="status"><span className="girando" aria-hidden="true" />{texto}</div>;
}

export function ErroCarregar({ mensagem, tentar }: { mensagem: string; tentar?: () => void }) {
  return (
    <div className="erro-carregar" role="alert">
      <p>{mensagem}</p>
      {tentar && <button className="botao secundario" onClick={tentar}>Tentar de novo</button>}
    </div>
  );
}

/** Mostra "carregando", o erro, ou o conteúdo quando os dados chegam. */
export function Estado<T>({ c, children }: { c: { dados: T | undefined; carregando: boolean; erro: string | null; recarregar: () => void }; children: (d: T) => ReactNode }) {
  if (c.erro) return <ErroCarregar mensagem={c.erro} tentar={c.recarregar} />;
  if (c.dados === undefined) return <Carregando />;
  return <>{children(c.dados)}</>;
}

export function Info({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <div className="info"><dt>{rotulo}</dt><dd>{children}</dd></div>;
}

export function Dica({ children, tipo = 'info' }: { children: ReactNode; tipo?: 'info' | 'alerta' | 'sucesso' }) {
  return <div className={`dica dica-${tipo}`}>{children}</div>;
}
