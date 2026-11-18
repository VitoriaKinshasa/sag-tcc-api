// Pedidos que a coordenação decide: troca de orientador e conclusão por publicação.
import { ArrowRight, ExternalLink, Newspaper, Repeat } from 'lucide-react';
import { api } from '../../api';
import { Cartao, Estado, Pagina, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Id } from '../../types';

interface Troca { id: Id; aluno: string; titulo: string; orientador_atual: string; novo_orientador: string; motivo: string }
interface Publicacao { id: Id; aluno: string; titulo: string; titulo_artigo: string; veiculo: string; ano: number; link: string; orientador: string | null }

export function Trocas() {
  const c = useCarregar(() => api<Troca[]>('GET', '/orientacao/trocas/pendentes'), []);
  const { executar, perguntar } = useFeedback();

  const decidir = async (t: Troca, aprovar: boolean) => {
    const resposta = aprovar
      ? await perguntar({ titulo: 'Aprovar troca?', texto: `${t.novo_orientador} passa a orientar ${t.aluno}. ${t.orientador_atual} fica registrado no histórico.`, confirmar: 'Aprovar' })
      : await perguntar({ titulo: 'Recusar troca?', confirmar: 'Recusar', perigo: true, campo: { rotulo: 'Justificativa', obrigatorio: true } });
    if (resposta === false) return;
    const r = await executar(() => api('PATCH', `/orientacao/trocas/${t.id}`, aprovar ? { aprovar } : { aprovar, justificativa: resposta }),
      aprovar ? 'Troca aprovada. Todos foram avisados.' : 'Troca recusada. O aluno foi avisado.');
    if (r) c.recarregar();
  };

  return (
    <Pagina titulo="Trocas de orientador" descricao="Pedidos dos alunos do seu curso. Ao aprovar, o sistema confere se o novo orientador ainda tem vaga.">
      <Estado c={c}>
        {(lista) => lista.length === 0 ? <Vazio icone={Repeat}>Nenhum pedido aguardando.</Vazio> : lista.map((t) => (
          <Cartao key={t.id} titulo={t.titulo} descricao={t.aluno}>
            <div className="troca"><span>{t.orientador_atual}</span><ArrowRight className="ic" aria-hidden="true" /><strong>{t.novo_orientador}</strong></div>
            <p className="texto-longo"><strong>Motivo:</strong> {t.motivo}</p>
            <div className="acoes">
              <button className="botao" onClick={() => decidir(t, true)}>Aprovar</button>
              <button className="botao secundario perigo-texto" onClick={() => decidir(t, false)}>Recusar</button>
            </div>
          </Cartao>
        ))}
      </Estado>
    </Pagina>
  );
}

export function Publicacoes() {
  const c = useCarregar(() => api<Publicacao[]>('GET', '/publicacoes/pendentes'), []);
  const { executar, perguntar } = useFeedback();

  const decidir = async (p: Publicacao, aprovar: boolean) => {
    const resposta = aprovar
      ? await perguntar({ titulo: 'Aprovar por publicação?', texto: 'O TCC fica “Aprovado por publicação”, sem banca. Se houver banca agendada, ela é cancelada.', confirmar: 'Aprovar' })
      : await perguntar({ titulo: 'Recusar pedido?', confirmar: 'Recusar', perigo: true, campo: { rotulo: 'Justificativa', obrigatorio: true } });
    if (resposta === false) return;
    const r = await executar(() => api('PATCH', `/publicacoes/${p.id}`, aprovar ? { aprovar } : { aprovar, justificativa: resposta }),
      aprovar ? 'TCC aprovado por publicação.' : 'Pedido recusado. O aluno foi avisado.');
    if (r) c.recarregar();
  };

  return (
    <Pagina titulo="Conclusão por publicação" descricao="Alunos que pediram para concluir o TCC com um artigo publicado.">
      <Estado c={c}>
        {(lista) => lista.length === 0 ? <Vazio icone={Newspaper}>Nenhum pedido aguardando.</Vazio> : lista.map((p) => (
          <Cartao key={p.id} titulo={p.titulo} descricao={`${p.aluno}${p.orientador ? ' · orientação de ' + p.orientador : ''}`}>
            <dl className="infos">
              <div className="info"><dt>Artigo</dt><dd>{p.titulo_artigo}</dd></div>
              <div className="info"><dt>Publicado em</dt><dd>{p.veiculo}, {p.ano}</dd></div>
              <div className="info"><dt>Link</dt><dd><a href={p.link} target="_blank" rel="noopener noreferrer">Abrir artigo <ExternalLink className="ic" aria-hidden="true" /></a></dd></div>
            </dl>
            <div className="acoes">
              <button className="botao" onClick={() => decidir(p, true)}>Aprovar</button>
              <button className="botao secundario perigo-texto" onClick={() => decidir(p, false)}>Recusar</button>
            </div>
          </Cartao>
        ))}
      </Estado>
    </Pagina>
  );
}
