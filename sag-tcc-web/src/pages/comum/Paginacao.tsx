import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Navegação entre páginas de uma lista ("Página 2 de 5"). Some quando só há uma página. */
export function Paginacao({ pagina, total, porPagina, aoMudar }: { pagina: number; total: number; porPagina: number; aoMudar: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  if (paginas <= 1) return null;
  const de = (pagina - 1) * porPagina + 1;
  const ate = Math.min(total, pagina * porPagina);
  return (
    <nav className="paginacao" aria-label="Páginas">
      <span className="texto-calmo">{de}–{ate} de {total}</span>
      <div>
        <button className="botao pequeno secundario" disabled={pagina <= 1} onClick={() => aoMudar(pagina - 1)}><ChevronLeft className="ic" aria-hidden="true" />Anterior</button>
        <span className="paginacao-atual">Página {pagina} de {paginas}</span>
        <button className="botao pequeno secundario" disabled={pagina >= paginas} onClick={() => aoMudar(pagina + 1)}>Próxima<ChevronRight className="ic" aria-hidden="true" /></button>
      </div>
    </nav>
  );
}
