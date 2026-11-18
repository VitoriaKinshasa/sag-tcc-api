import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  titulo: string;
  subtitulo?: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  pequeno?: boolean;
}

/** Janela que abre por cima da tela (fecha com Esc, no X ou clicando fora). */
export function Modal({ titulo, subtitulo, aoFechar, children, rodape, pequeno }: Props) {
  const id = useId();
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const primeiro = caixa.current?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button:not(.modal-fechar)');
    (primeiro ?? caixa.current)?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', tecla);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = '';
      anterior?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div ref={caixa} className={`modal ${pequeno ? 'modal-pequeno' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <div className="modal-topo">
          <div>
            <h2 id={id}>{titulo}</h2>
            {subtitulo && <p className="modal-subtitulo">{subtitulo}</p>}
          </div>
          <button className="modal-fechar" aria-label="Fechar" onClick={aoFechar}>×</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}
