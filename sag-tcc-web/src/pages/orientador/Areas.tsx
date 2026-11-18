import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useUsuario } from '../../auth';
import { Cartao, Estado, Pagina } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Area, Orientador } from '../../types';
import { mesmoId } from '../../util';

export function Areas() {
  const eu = useUsuario();
  const c = useCarregar(() => Promise.all([api<Area[]>('GET', '/areas'), api<Orientador[]>('GET', '/orientacao/orientadores')]), []);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const { executar } = useFeedback();

  useEffect(() => {
    if (!c.dados) return;
    const [areas, orientadores] = c.dados;
    const minhas = orientadores.find((o) => mesmoId(o.id, eu.id))?.areas ?? [];
    setMarcadas(new Set(areas.filter((a) => minhas.includes(a.nome)).map((a) => String(a.id))));
  }, [c.dados, eu.id]);

  const alternar = (id: string) => setMarcadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Pagina titulo="Minhas áreas de interesse" descricao="Os alunos encontram você pelas áreas marcadas aqui. Marque pelo menos uma.">
      <Estado c={c}>
        {([areas]) => (
          <Cartao>
            <div className="chips" role="group" aria-label="Áreas do conhecimento">
              {areas.map((a) => {
                const id = String(a.id);
                return (
                  <label key={id} className={`chip ${marcadas.has(id) ? 'marcado' : ''}`}>
                    <input type="checkbox" checked={marcadas.has(id)} onChange={() => alternar(id)} />
                    {a.nome}
                  </label>
                );
              })}
            </div>
            <div className="acoes">
              <button className="botao" onClick={() => executar(() => api('PUT', '/usuarios/me/areas', { areaIds: [...marcadas].map(Number) }), 'Áreas de interesse salvas.')}>
                Salvar ({marcadas.size} marcada{marcadas.size === 1 ? '' : 's'})
              </button>
            </div>
          </Cartao>
        )}
      </Estado>
    </Pagina>
  );
}
