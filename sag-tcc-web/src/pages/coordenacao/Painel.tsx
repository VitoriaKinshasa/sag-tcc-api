import { ChevronRight } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { Secao } from '../../components/blocos';
import { CampoSelecao, Estado, Pagina } from '../../components/ui';
import { useCarregar } from '../../hooks';
import type { Area, Painel as DadosPainel, Situacao } from '../../types';
import { dia, SITUACOES } from '../../util';

const ORDEM: Situacao[] = ['EM_PROPOSTA', 'EM_DESENVOLVIMENTO', 'APTO_DEFESA', 'APROVADO', 'APROVADO_PUBLICACAO', 'NAO_APRESENTADO', 'REPROVADO', 'CANCELADO'];
const tirarMarca = (nome: string) => nome.replace(/\s*\((aluna|aluno)\)$/i, '');

/** UC22 – Painel de governança: TCCs por situação, atrasados e carga dos professores. Somente leitura. */
export function Painel() {
  const [params, setParams] = useSearchParams();
  const chave = params.toString();
  const areas = useCarregar(() => api<Area[]>('GET', '/areas'), []);
  const c = useCarregar(() => api<DadosPainel>('GET', '/painel' + (chave ? '?' + chave : '')), [chave]);
  const mudar = (campo: string, valor: string) => {
    const p = new URLSearchParams(params);
    if (valor) p.set(campo, valor); else p.delete(campo);
    setParams(p);
  };

  /** FA01: cada número abre a busca de TCCs já filtrada. */
  const linkBusca = (d: DadosPainel, extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (d.filtros.semestre !== 'todos') p.set('semestre', d.filtros.semestre);
    if (d.filtros.areaId) p.set('areaId', String(d.filtros.areaId));
    if (d.filtros.situacao) p.set('situacao', d.filtros.situacao);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/tccs?${p}`;
  };

  return (
    <Estado c={c}>
      {(d) => {
        const maior = Math.max(1, ...ORDEM.map((s) => d.porSituacao[s]));
        const situacoes = d.filtros.situacao && d.filtros.situacao !== 'ATRASADO' ? ORDEM.filter((s) => s === d.filtros.situacao) : ORDEM;
        return (
          <Pagina titulo="Painel de governança" descricao={`${d.curso.nome} · os números mudam conforme os filtros. Clique num número para ver a lista.`}>
            <div className="filtros">
              <CampoSelecao rotulo="Semestre da proposta" value={d.filtros.semestre} onChange={(e) => mudar('semestre', e.target.value)}>
                {d.semestres.map((s) => <option key={s} value={s}>{s}</option>)}
                <option value="todos">Todos os semestres</option>
              </CampoSelecao>
              <CampoSelecao rotulo="Área" value={String(d.filtros.areaId ?? '')} onChange={(e) => mudar('areaId', e.target.value)}>
                <option value="">Todas</option>
                {(areas.dados ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </CampoSelecao>
              <CampoSelecao rotulo="Situação" value={d.filtros.situacao ?? ''} onChange={(e) => mudar('situacao', e.target.value)}>
                <option value="">Todas</option>
                {ORDEM.map((s) => <option key={s} value={s}>{SITUACOES[s][0]}</option>)}
              </CampoSelecao>
            </div>

            {d.total === 0 ? (
              <p className="texto-calmo painel-vazio">Nenhum TCC encontrado para os filtros escolhidos.</p>
            ) : (
              <>
                <div className="painel-resumo">
                  <Link to={linkBusca(d, {})} className="painel-total">
                    <strong>{d.total}</strong><span>{d.total === 1 ? 'TCC' : 'TCCs'} {d.filtros.semestre === 'todos' ? 'no total' : `propostos em ${d.filtros.semestre}`}</span>
                  </Link>
                  <Link to={linkBusca(d, { situacao: 'ATRASADO' })} className={`painel-total ${d.atrasados.length ? 'alerta' : ''}`}>
                    <strong>{d.atrasados.length}</strong><span>{d.atrasados.length === 1 ? 'atrasado' : 'atrasados'}</span>
                  </Link>
                </div>

                <Secao titulo="TCCs por situação">
                  <ul className="caixa lista-situacoes">
                    {situacoes.map((s) => (
                      <li key={s}>
                        <Link to={linkBusca(d, { situacao: s })} aria-label={`${SITUACOES[s][0]}: ${d.porSituacao[s]}`}>
                          <span className="situacao-nome">{SITUACOES[s][0]}</span>
                          <span className="barra"><span style={{ width: `${(d.porSituacao[s] / maior) * 100}%` }} /></span>
                          <strong>{d.porSituacao[s]}</strong>
                          <ChevronRight className="ic" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Secao>

                <Secao titulo={`TCCs atrasados (${d.atrasados.length})`}>
                  {d.atrasados.length === 0 ? <p className="texto-calmo">Nenhum TCC atrasado. Tudo em dia.</p> : (
                    <ul className="caixa lista-atrasados">
                      {d.atrasados.map((t) => (
                        <li key={t.id}>
                          <div>
                            <strong>{t.titulo}</strong>
                            <span className="texto-calmo">{tirarMarca(t.aluno)} · {t.orientador ?? 'sem orientador'}</span>
                          </div>
                          <div className="atraso">
                            <span className="atraso-dias">{t.dias == null ? 'Atrasado' : `${t.dias} ${t.dias === 1 ? 'dia' : 'dias'} de atraso`}</span>
                            {t.etapa && <small className="texto-calmo">{t.etapa} · venceu em {dia(t.dataLimite)}</small>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Secao>
              </>
            )}

            <Secao titulo="Carga dos professores">
              <p className="texto-calmo ajuda-secao">Os professores são do NUCOMP e orientam alunos dos três cursos. O limite vale para o total de orientandos.</p>
              <div className="tabela-caixa">
                <table className="tabela tabela-carga">
                  <thead><tr>
                    <th>Professor(a)</th><th>Orientandos do curso</th><th>Total de orientandos</th>
                    <th>Bancas {d.filtros.semestre === 'todos' ? '(todas)' : `em ${d.filtros.semestre}`}</th>
                  </tr></thead>
                  <tbody>
                    {d.professores.map((p) => {
                      const cheio = p.total >= p.limite;
                      return (
                        <tr key={p.id}>
                          <td><strong>{p.nome}</strong></td>
                          <td>{p.no_curso}</td>
                          <td>
                            <span className="carga">
                              <span className={`barra ${cheio ? 'cheia' : ''}`}><span style={{ width: `${Math.min(100, (p.total / p.limite) * 100)}%` }} /></span>
                              <span className={cheio ? 'texto-erro' : ''}>{p.total} de {p.limite}</span>
                            </span>
                          </td>
                          <td>{p.bancas}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Secao>
          </Pagina>
        );
      }}
    </Estado>
  );
}
