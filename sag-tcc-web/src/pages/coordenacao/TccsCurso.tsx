import { useState } from 'react';
import { api } from '../../api';
import { Campo, CampoSelecao, Cartao, Estado, Pagina, SeloDe, SeloSituacao, Tabela } from '../../components/ui';
import { useCarregar } from '../../hooks';
import type { Situacao, TccCurso } from '../../types';
import { dataHora, SITUACOES, STATUS_BANCA, TRANSICOES } from '../../util';
import { ModalHistorico, ModalSituacao } from '../comum/compartilhado';

export function TccsCurso() {
  const c = useCarregar(() => api<TccCurso[]>('GET', '/tccs'), []);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');
  const [aberto, setAberto] = useState<{ t: TccCurso; acao: 'situacao' | 'historico' } | null>(null);

  return (
    <Pagina titulo="TCCs do curso" descricao="Todos os TCCs do seu curso. A coordenação pode alterar a situação e ver o histórico completo.">
      <Estado c={c}>
        {(tccs) => {
          const termo = busca.trim().toLowerCase();
          const lista = tccs.filter((t) => (!situacao || (situacao === 'ATRASADO' ? t.atrasado : t.situacao === situacao))
            && (!termo || t.titulo.toLowerCase().includes(termo) || t.aluno.toLowerCase().includes(termo) || (t.orientador ?? '').toLowerCase().includes(termo)));
          return (
            <>
              <Cartao>
                <div className="grade-2">
                  <Campo rotulo="Buscar" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Título, aluno ou orientador" />
                  <CampoSelecao rotulo="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
                    <option value="">Todas</option>
                    <option value="ATRASADO">Somente atrasados</option>
                    {(Object.keys(SITUACOES) as Situacao[]).map((s) => <option key={s} value={s}>{SITUACOES[s][0]}</option>)}
                  </CampoSelecao>
                </div>
                <p className="ajuda">{lista.length} de {tccs.length} TCC(s)</p>
              </Cartao>
              <Tabela linhas={lista} chave={(t) => String(t.id)} vazio="Nenhum TCC encontrado."
                colunas={[
                  { titulo: 'Aluno(a)', valor: (t) => t.aluno },
                  { titulo: 'TCC', valor: (t) => <strong>{t.titulo}</strong> },
                  { titulo: 'Orientador(a)', valor: (t) => t.orientador ?? '—' },
                  { titulo: 'Situação', valor: (t) => <SeloSituacao situacao={t.situacao} atrasado={t.atrasado} /> },
                  { titulo: 'Banca', valor: (t) => t.banca ? <span className="selos"><SeloDe mapa={STATUS_BANCA} valor={t.banca.status} /><small>{dataHora(t.banca.dataHora)}</small></span> : '—' },
                  { titulo: '', className: 'col-acoes', valor: (t) => (
                    <div className="acoes">
                      {TRANSICOES[t.situacao] && <button className="botao pequeno secundario" onClick={() => setAberto({ t, acao: 'situacao' })}>Alterar situação</button>}
                      <button className="botao pequeno secundario" onClick={() => setAberto({ t, acao: 'historico' })}>Histórico</button>
                    </div>
                  ) },
                ]} />
            </>
          );
        }}
      </Estado>
      {aberto?.acao === 'historico' && <ModalHistorico tccId={aberto.t.id} titulo={aberto.t.titulo} aoFechar={() => setAberto(null)} />}
      {aberto?.acao === 'situacao' && <ModalSituacao tcc={aberto.t} aoFechar={() => setAberto(null)} aoSalvar={() => { setAberto(null); c.recarregar(); }} />}
    </Pagina>
  );
}
