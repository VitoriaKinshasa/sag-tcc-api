import { Bell } from 'lucide-react';
import { api } from '../../api';
import { Estado, Pagina, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Notificacao } from '../../types';
import { dataHora } from '../../util';

export function Notificacoes() {
  const c = useCarregar(() => api<Notificacao[]>('GET', '/notificacoes'), []);
  const { executar } = useFeedback();

  const marcar = async (ids: Notificacao['id'][]) => {
    await executar(() => Promise.all(ids.map((id) => api('PATCH', `/notificacoes/${id}/lida`))));
    window.dispatchEvent(new Event('notificacoes-mudaram'));
    c.recarregar();
  };

  const naoLidas = (c.dados ?? []).filter((n) => !n.lida);
  return (
    <Pagina titulo="Notificações" descricao="Avisos do sistema. Cada aviso também é enviado para o seu e-mail."
      acoes={naoLidas.length > 0 && <button className="botao secundario" onClick={() => marcar(naoLidas.map((n) => n.id))}>Marcar todas como lidas</button>}>
      <Estado c={c}>
        {(lista) => lista.length === 0 ? <Vazio icone={Bell}>Você não tem notificações.</Vazio> : (
          <ul className="notificacoes">
            {lista.map((n) => (
              <li key={n.id} className={n.lida ? '' : 'nao-lida'}>
                <div>
                  <strong>{n.titulo}</strong>
                  <p>{n.mensagem}</p>
                  <small>{dataHora(n.criado_em)}</small>
                </div>
                {!n.lida && <button className="botao pequeno secundario" onClick={() => marcar([n.id])}>Marcar como lida</button>}
              </li>
            ))}
          </ul>
        )}
      </Estado>
    </Pagina>
  );
}
