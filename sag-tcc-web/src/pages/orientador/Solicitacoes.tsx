import { Inbox } from 'lucide-react';
import { api } from '../../api';
import { Cartao, Estado, Pagina, SeloDe, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Id } from '../../types';
import { dataHora, STATUS_PEDIDO } from '../../util';

interface Solicitacao { id: Id; aluno: string; titulo: string; resumo: string; area: string; criado_em: string; status: string }

export function Solicitacoes() {
  const c = useCarregar(() => api<Solicitacao[]>('GET', '/orientacao/solicitacoes/recebidas'), []);
  const { executar, perguntar } = useFeedback();

  const responder = async (s: Solicitacao, aceitar: boolean) => {
    const resposta = aceitar
      ? await perguntar({ titulo: 'Aceitar orientação?', texto: `Você passa a orientar ${s.aluno}. O TCC fica “Em desenvolvimento”.`, confirmar: 'Aceitar' })
      : await perguntar({ titulo: 'Recusar pedido?', texto: `O aluno ${s.aluno} será avisado e poderá pedir a outro professor.`, confirmar: 'Recusar', perigo: true,
        campo: { rotulo: 'Justificativa', obrigatorio: true, placeholder: 'Ex.: sem disponibilidade neste semestre' } });
    if (resposta === false) return;
    const corpo = aceitar ? { aceitar } : { aceitar, justificativa: resposta };
    const r = await executar(() => api('PATCH', `/orientacao/solicitacoes/${s.id}`, corpo),
      aceitar ? 'Orientação aceita! O TCC está em desenvolvimento.' : 'Pedido recusado. O aluno foi avisado.');
    if (r) c.recarregar();
  };

  return (
    <Pagina titulo="Solicitações de orientação" descricao="Pedidos de alunos que querem você como orientador(a). O limite de orientandos do curso é conferido no aceite.">
      <Estado c={c}>
        {(lista) => {
          const pendentes = lista.filter((s) => s.status === 'PENDENTE');
          const respondidas = lista.filter((s) => s.status !== 'PENDENTE');
          return (
            <>
              {pendentes.length === 0 && <Vazio icone={Inbox}>Nenhum pedido aguardando resposta.</Vazio>}
              {pendentes.map((s) => (
                <Cartao key={s.id} titulo={s.titulo} descricao={`${s.aluno} · ${s.area} · pedido em ${dataHora(s.criado_em)}`}>
                  <p className="texto-longo">{s.resumo}</p>
                  <div className="acoes">
                    <button className="botao" onClick={() => responder(s, true)}>Aceitar orientação</button>
                    <button className="botao secundario perigo-texto" onClick={() => responder(s, false)}>Recusar</button>
                  </div>
                </Cartao>
              ))}
              {respondidas.length > 0 && (
                <details className="respondidas">
                  <summary>Pedidos já respondidos ({respondidas.length})</summary>
                  <ul className="lista-simples">
                    {respondidas.map((s) => <li key={s.id}><span><strong>{s.aluno}</strong> · {s.titulo}</span><SeloDe mapa={STATUS_PEDIDO} valor={s.status} /></li>)}
                  </ul>
                </details>
              )}
            </>
          );
        }}
      </Estado>
    </Pagina>
  );
}
