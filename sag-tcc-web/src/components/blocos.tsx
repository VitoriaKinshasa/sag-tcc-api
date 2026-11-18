// Blocos de página usados no lugar dos "quadros" (cartões): menos caixas, mais hierarquia.
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** A coisa mais importante da tela: uma frase do que fazer agora e, se houver, o botão. */
export function ProximoPasso({ titulo, children, acao, tom = 'normal' }: {
  titulo: ReactNode; children?: ReactNode; acao?: ReactNode; tom?: 'normal' | 'alerta' | 'sucesso';
}) {
  return (
    <div className={`proximo-passo tom-${tom}`}>
      <div>
        <h2>{titulo}</h2>
        {children && <p>{children}</p>}
      </div>
      {acao && <div className="proximo-passo-acao">{acao}</div>}
    </div>
  );
}

/** Uma parte da página: título pequeno com uma linha embaixo, sem caixa em volta. */
export function Secao({ titulo, extra, children }: { titulo: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="secao">
      <div className="secao-titulo"><h2>{titulo}</h2>{extra}</div>
      {children}
    </section>
  );
}

/** Ficha de dados: rótulo à esquerda, informação à direita. */
export function Ficha({ linhas }: { linhas: [string, ReactNode][] }) {
  return (
    <dl className="ficha">
      {linhas.map(([rotulo, valor]) => <div key={rotulo}><dt>{rotulo}</dt><dd>{valor}</dd></div>)}
    </dl>
  );
}

export interface Tarefa { quantidade: number; texto: string; para: string; urgente?: boolean }

/** Lista "para fazer": só aparece o que tem pendência. */
export function ListaTarefas({ tarefas, vazio = 'Tudo em dia. Nada esperando por você agora.' }: { tarefas: Tarefa[]; vazio?: string }) {
  const pendentes = tarefas.filter((t) => t.quantidade > 0);
  if (!pendentes.length) return <p className="texto-calmo">{vazio}</p>;
  return (
    <ul className="tarefas">
      {pendentes.map((t) => (
        <li key={t.para + t.texto}>
          <Link to={t.para} className={t.urgente ? 'urgente' : ''}>
            <span className="tarefa-numero">{t.quantidade}</span>
            <span className="tarefa-texto">{t.texto}</span>
            <ChevronRight className="ic" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Link discreto, usado no canto do título de uma seção. */
export function LinkSecao({ para, children }: { para: string; children: ReactNode }) {
  return <Link to={para} className="link-secao">{children}</Link>;
}

export interface ItemFazer {
  titulo: string;
  /** Linha pequena embaixo do título (ex.: "até 03/12/2026"). */
  prazo?: string;
  /** Parte em verde (ou vermelho, se urgente) ao lado do prazo (ex.: "faltam 20 dias"). */
  destaque?: string | null;
  urgente?: boolean;
  acao: { texto: string; para: string; icone?: LucideIcon };
}

/** "Para fazer": só aparece quando existe alguma coisa para fazer. */
export function ParaFazer({ itens }: { itens: ItemFazer[] }) {
  if (!itens.length) return null;
  return (
    <Secao titulo="Para fazer">
      <ul className="a-fazer">
        {itens.map((i) => {
          const Icone = i.acao.icone;
          return (
            <li key={i.titulo} className={i.urgente ? 'urgente' : ''}>
              <div>
                <strong>{i.titulo}</strong>
                {(i.prazo || i.destaque) && (
                  <small>{i.prazo}{i.prazo && i.destaque && ' · '}{i.destaque && <span className="a-fazer-destaque">{i.destaque}</span>}</small>
                )}
              </div>
              <Link className="botao" to={i.acao.para}>{Icone && <Icone className="ic" aria-hidden="true" />}{i.acao.texto}</Link>
            </li>
          );
        })}
      </ul>
    </Secao>
  );
}
