import { FileSpreadsheet, FileText, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, baixar } from '../../api';
import { Ficha, Secao } from '../../components/blocos';
import { Campo, CampoSelecao, Estado, Pagina, SeloSituacao } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Area, Pagina as PaginaDe, Situacao, TccBusca } from '../../types';
import { dataHora, SITUACOES, STATUS_BANCA, TRANSICOES } from '../../util';
import { ModalHistorico, ModalSituacao } from '../comum/compartilhado';
import { Paginacao } from '../comum/Paginacao';

/** UC23 – Buscar e exportar: os TCCs do curso, com filtros, 20 por página, e exportação em PDF ou planilha. */
export function TccsCurso() {
  const [params, setParams] = useSearchParams();
  const [aluno, setAluno] = useState(params.get('aluno') ?? '');
  const [orientador, setOrientador] = useState(params.get('orientador') ?? '');
  const [aberto, setAberto] = useState<{ t: TccBusca; acao: 'situacao' | 'historico' } | null>(null);
  const { executar } = useFeedback();
  const chave = params.toString();
  const areas = useCarregar(() => api<Area[]>('GET', '/areas'), []);
  const c = useCarregar(() => api<PaginaDe<TccBusca> & { semestres: string[] }>('GET', '/busca/tccs' + (chave ? '?' + chave : '')), [chave]);

  const mudar = (novos: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(novos)) { if (v) p.set(k, v); else p.delete(k); }
    if (!('pagina' in novos)) p.delete('pagina');
    setParams(p);
  };
  const buscar = (e: FormEvent) => { e.preventDefault(); mudar({ aluno: aluno.trim(), orientador: orientador.trim() }); };
  const limpar = () => { setAluno(''); setOrientador(''); setParams(new URLSearchParams()); };
  const filtrosSemPagina = () => { const p = new URLSearchParams(params); p.delete('pagina'); return p; };
  const exportar = (formato: 'pdf' | 'xlsx') => {
    const p = filtrosSemPagina(); p.set('formato', formato);
    const data = new Date().toLocaleDateString('en-CA');
    return executar(() => baixar(`/busca/tccs/exportar?${p}`, `tccs-${data}.${formato}`));
  };
  const algumFiltro = ['aluno', 'orientador', 'semestre', 'situacao', 'areaId'].some((k) => params.get(k));

  return (
    <Pagina titulo="TCCs do curso" descricao="Busque os TCCs do seu curso, exporte a lista e acompanhe cada trabalho. A coordenação pode alterar a situação e ver o histórico completo.">
      <form className="filtros filtros-busca" onSubmit={buscar}>
        <Campo rotulo="Aluno(a)" type="search" value={aluno} onChange={(e) => setAluno(e.target.value)} placeholder="Nome ou parte do nome" maxLength={150} />
        <Campo rotulo="Orientador(a)" type="search" value={orientador} onChange={(e) => setOrientador(e.target.value)} placeholder="Nome ou parte do nome" maxLength={150} />
        <CampoSelecao rotulo="Semestre" value={params.get('semestre') ?? ''} onChange={(e) => mudar({ semestre: e.target.value })}>
          <option value="">Todos</option>
          {(c.dados?.semestres ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
        </CampoSelecao>
        <CampoSelecao rotulo="Situação" value={params.get('situacao') ?? ''} onChange={(e) => mudar({ situacao: e.target.value })}>
          <option value="">Todas</option>
          <option value="ATRASADO">Somente atrasados</option>
          {(Object.keys(SITUACOES) as Situacao[]).map((s) => <option key={s} value={s}>{SITUACOES[s][0]}</option>)}
        </CampoSelecao>
        <CampoSelecao rotulo="Área" value={params.get('areaId') ?? ''} onChange={(e) => mudar({ areaId: e.target.value })}>
          <option value="">Todas</option>
          {(areas.dados ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </CampoSelecao>
        <div className="filtros-botoes">
          <button className="botao" type="submit"><Search className="ic" aria-hidden="true" />Buscar</button>
          {algumFiltro && <button className="botao-texto" type="button" onClick={limpar}>Limpar filtros</button>}
        </div>
      </form>

      <Estado c={c}>
        {(r) => (
          <Secao titulo={`TCCs encontrados (${r.total})`} extra={
            <span className="exportar">
              <button className="botao pequeno secundario" disabled={r.total === 0} onClick={() => exportar('pdf')}><FileText className="ic" aria-hidden="true" />Exportar PDF</button>
              <button className="botao pequeno secundario" disabled={r.total === 0} onClick={() => exportar('xlsx')}><FileSpreadsheet className="ic" aria-hidden="true" />Exportar planilha</button>
            </span>
          }>
            {r.total === 0 ? <p className="texto-calmo">Nenhum TCC encontrado para os filtros escolhidos.</p> : (
              <>
                <ul className="lista-tccs">
                  {r.itens.map((t) => (
                    <li key={t.id} className="caixa banca">
                      <Ficha linhas={[
                        ['Título', <strong key="t">{t.titulo}</strong>],
                        ['Aluno(a)', t.aluno],
                        ['Orientador(a)', t.orientador ?? <span key="o" className="texto-calmo">Ainda sem orientador</span>],
                        ['Área e semestre', <span key="a">{t.area} <span className="texto-calmo">· proposta em {t.semestre}</span></span>],
                        ['Situação', <SeloSituacao key="s" situacao={t.situacao} atrasado={t.atrasado} />],
                        ['Banca', t.banca
                          ? <span key="b">{STATUS_BANCA[t.banca.status][0]} · {dataHora(t.banca.dataHora).replace(', ', ' às ')}</span>
                          : <span key="b" className="texto-calmo">Ainda não marcada</span>],
                      ]} />
                      <footer className="banca-rodape">
                        {TRANSICOES[t.situacao] && <button className="botao pequeno secundario" onClick={() => setAberto({ t, acao: 'situacao' })}>Alterar situação</button>}
                        <button className="botao pequeno secundario" onClick={() => setAberto({ t, acao: 'historico' })}>Histórico</button>
                        <Link className="botao pequeno secundario" to={`/auditoria?tabela=tcc&registroId=${t.id}&de=2000-01-01`}>Ver auditoria</Link>
                      </footer>
                    </li>
                  ))}
                </ul>
                <Paginacao pagina={r.pagina} total={r.total} porPagina={r.porPagina} aoMudar={(p) => mudar({ pagina: String(p) })} />
              </>
            )}
          </Secao>
        )}
      </Estado>
      {aberto?.acao === 'historico' && <ModalHistorico tccId={aberto.t.id} titulo={aberto.t.titulo} aoFechar={() => setAberto(null)} />}
      {aberto?.acao === 'situacao' && <ModalSituacao tcc={aberto.t} aoFechar={() => setAberto(null)} aoSalvar={() => { setAberto(null); c.recarregar(); }} />}
    </Pagina>
  );
}
