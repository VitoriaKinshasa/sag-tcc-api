import { api } from '../../api';
import { Estado, Pagina, Tabela } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Id } from '../../types';
import { dataHora } from '../../util';

interface Pedido { id: Id; aluno: string; titulo: string; motivo: string; criado_em: string }

/** Pedidos de desistência (orientador e coordenação confirmam). */
export function Desistencias() {
  const c = useCarregar(() => api<Pedido[]>('GET', '/orientacao/desistencias/pendentes'), []);
  const { executar, perguntar } = useFeedback();

  const decidir = async (p: Pedido, confirmar: boolean) => {
    const ok = await perguntar(confirmar
      ? { titulo: 'Confirmar desistência?', texto: `O TCC de ${p.aluno} será cancelado. Isso não pode ser desfeito.`, confirmar: 'Confirmar desistência', perigo: true }
      : { titulo: 'Não confirmar a desistência?', texto: 'O TCC continua normalmente e o aluno será avisado.', confirmar: 'Não confirmar' });
    if (!ok) return;
    const r = await executar(() => api('PATCH', `/orientacao/desistencias/${p.id}`, { confirmar }),
      confirmar ? 'Desistência confirmada. O TCC foi cancelado.' : 'Desistência não confirmada. O TCC continua.');
    if (r) c.recarregar();
  };

  return (
    <Pagina titulo="Pedidos de desistência" descricao="Quando o aluno pede para desistir, o orientador ou a coordenação precisa confirmar.">
      <Estado c={c}>
        {(lista) => (
          <Tabela linhas={lista} chave={(p) => String(p.id)} vazio="Nenhum pedido aguardando."
            colunas={[
              { titulo: 'Aluno(a)', valor: (p) => p.aluno },
              { titulo: 'TCC', valor: (p) => <strong>{p.titulo}</strong> },
              { titulo: 'Motivo', valor: (p) => p.motivo },
              { titulo: 'Pedido em', valor: (p) => dataHora(p.criado_em) },
              { titulo: 'Ações', className: 'col-acoes', valor: (p) => (
                <div className="acoes">
                  <button className="botao pequeno perigo" onClick={() => decidir(p, true)}>Confirmar</button>
                  <button className="botao pequeno secundario" onClick={() => decidir(p, false)}>Não confirmar</button>
                </div>
              ) },
            ]} />
        )}
      </Estado>
    </Pagina>
  );
}
