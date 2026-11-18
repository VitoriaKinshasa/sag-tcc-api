import { ArrowLeft, BookOpen, Download, ExternalLink, Lock, Search } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { Ficha, Secao } from '../../components/blocos';
import { CampoSelecao, Estado } from '../../components/ui';
import { useCarregar } from '../../hooks';
import type { Id, Pagina, TccAcervo, TccAcervoDetalhe } from '../../types';
import { Paginacao } from './Paginacao';

/** Estrutura das páginas públicas (sem login): cabeçalho simples. */
function PaginaPublica({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  return (
    <div className="app">
      <header className="cabecalho">
        <div className="cabecalho-interno">
          <Link to="/acervo" className="marca"><img src="/uea.png" alt="" /><span><strong>SAG-TCC</strong><small>Acervo de TCCs do NUCOMP</small></span></Link>
          <div className="cabecalho-direita">
            <Link to={usuario ? '/' : '/login'} className="botao-sair">{usuario ? 'Voltar ao sistema' : 'Entrar'}</Link>
          </div>
        </div>
      </header>
      <main className="conteudo">{children}</main>
      <footer className="rodape">Universidade do Estado do Amazonas · Escola Superior de Tecnologia · Núcleo de Computação</footer>
    </div>
  );
}

interface Filtros { areas: { id: Id; nome: string }[]; cursos: { id: Id; nome: string }[]; anos: number[] }

/** UC26 – Pesquisar TCCs aprovados (página pública). */
export function Acervo() {
  const [params, setParams] = useSearchParams();
  const [termo, setTermo] = useState(params.get('q') ?? '');
  const filtros = useCarregar(() => api<Filtros>('GET', '/acervo/filtros'), []);
  const chave = params.toString();
  const lista = useCarregar(() => api<Pagina<TccAcervo>>('GET', '/acervo' + (chave ? '?' + chave : '')), [chave]);

  const mudar = (campo: string, valor: string) => {
    const p = new URLSearchParams(params);
    if (valor) p.set(campo, valor); else p.delete(campo);
    if (campo !== 'pagina') p.delete('pagina');
    setParams(p);
  };
  const pesquisar = (e: FormEvent) => { e.preventDefault(); mudar('q', termo.trim()); };
  const algumFiltro = ['q', 'areaId', 'cursoId', 'ano'].some((k) => params.get(k));

  return (
    <PaginaPublica>
      <section className="pagina">
        <div className="pagina-topo"><div>
          <h1>Acervo de TCCs</h1>
          <p className="pagina-descricao">Trabalhos de conclusão de curso aprovados nos cursos de Computação da EST/UEA. Pesquise por título, autor ou orientador.</p>
        </div></div>

        <form className="busca-acervo" onSubmit={pesquisar} role="search">
          <Search className="ic" aria-hidden="true" />
          <label htmlFor="busca-acervo" className="visualmente-oculto">Título, autor ou orientador</label>
          <input id="busca-acervo" type="search" value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Título, autor ou orientador" maxLength={150} />
          <button className="botao" type="submit">Pesquisar</button>
        </form>
        <div className="filtros">
          <CampoSelecao rotulo="Área" value={params.get('areaId') ?? ''} onChange={(e) => mudar('areaId', e.target.value)}>
            <option value="">Todas as áreas</option>
            {(filtros.dados?.areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </CampoSelecao>
          <CampoSelecao rotulo="Curso" value={params.get('cursoId') ?? ''} onChange={(e) => mudar('cursoId', e.target.value)}>
            <option value="">Todos os cursos</option>
            {(filtros.dados?.cursos ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </CampoSelecao>
          <CampoSelecao rotulo="Ano" value={params.get('ano') ?? ''} onChange={(e) => mudar('ano', e.target.value)}>
            <option value="">Todos os anos</option>
            {(filtros.dados?.anos ?? []).map((a) => <option key={a} value={a}>{a}</option>)}
          </CampoSelecao>
        </div>

        <Estado c={lista}>
          {(r) => r.total === 0 ? (
            <div className="vazio-pagina">
              <BookOpen className="vazio-icone" aria-hidden="true" strokeWidth={1.5} />
              <h2>Nenhum TCC encontrado</h2>
              <p>Tente outros termos ou limpe os filtros.</p>
              {algumFiltro && <button className="botao secundario" onClick={() => { setTermo(''); setParams(new URLSearchParams()); }}>Limpar filtros</button>}
            </div>
          ) : (
            <Secao titulo={`${r.total} ${r.total === 1 ? 'trabalho encontrado' : 'trabalhos encontrados'}`}>
              <ul className="caixa lista-acervo">
                {r.itens.map((t) => (
                  <li key={t.id}>
                    <span className="acervo-ano" aria-label={`Ano ${t.ano}`}>{t.ano}</span>
                    <div className="acervo-info">
                      <Link to={`/acervo/${t.id}`} className="acervo-titulo">{t.titulo}</Link>
                      <span>{t.autor}{t.orientador && <span className="texto-calmo"> · Orientação: {t.orientador}</span>}</span>
                      <small className="texto-calmo">{t.area} · {t.curso}</small>
                    </div>
                    <span className={`acervo-acesso ${t.tem_pdf ? 'livre' : ''}`}>
                      {t.tem_pdf ? <><Download className="ic" aria-hidden="true" />PDF disponível</> : <><Lock className="ic" aria-hidden="true" />Somente os dados</>}
                    </span>
                  </li>
                ))}
              </ul>
              <Paginacao pagina={r.pagina} total={r.total} porPagina={r.porPagina} aoMudar={(p) => mudar('pagina', String(p))} />
            </Secao>
          )}
        </Estado>
      </section>
    </PaginaPublica>
  );
}

/** UC26 – Detalhe público de um TCC aprovado. */
export function AcervoDetalhe() {
  const { id } = useParams();
  const c = useCarregar(() => api<TccAcervoDetalhe>('GET', `/acervo/${id}`), [id]);
  return (
    <PaginaPublica>
      <section className="pagina">
        <p className="voltar"><Link to="/acervo"><ArrowLeft className="ic" aria-hidden="true" /> Voltar para o acervo</Link></p>
        <Estado c={c}>
          {(t) => (
            <>
              <div className="pagina-topo"><div>
                <h1>{t.titulo}</h1>
                {t.subtitulo && <p className="pagina-descricao">{t.subtitulo}</p>}
              </div></div>

              <Secao titulo="Dados do trabalho">
                <div className="caixa caixa-ficha">
                  <Ficha linhas={[
                    ['Autor(a)', t.autor],
                    ['Orientação', t.orientador ?? '—'],
                    ...(t.coorientador ? [['Coorientação', t.coorientador] as [string, ReactNode]] : []),
                    ['Área', t.area],
                    ['Curso', t.curso],
                    ['Ano', String(t.ano)],
                    ['Conclusão', t.situacao === 'APROVADO_PUBLICACAO' ? 'Por publicação de artigo' : 'Aprovado pela banca'],
                  ]} />
                </div>
              </Secao>

              <Secao titulo="Resumo"><p className="texto-resumo">{t.resumo}</p></Secao>

              {t.publicacao && (
                <Secao titulo="Artigo publicado">
                  <div className="caixa caixa-ficha">
                    <Ficha linhas={[
                      ['Título do artigo', t.publicacao.titulo],
                      ['Publicado em', `${t.publicacao.veiculo} (${t.publicacao.ano})`],
                      ['Link', <a key="l" href={t.publicacao.link} target="_blank" rel="noopener noreferrer" className="com-icone">{t.publicacao.link}<ExternalLink className="ic" aria-hidden="true" /></a>],
                    ]} />
                  </div>
                </Secao>
              )}

              <Secao titulo="Texto completo">
                {t.tem_pdf ? (
                  <div className="linha-acao caixa">
                    <span>O PDF da versão definitiva está liberado pelos autores.</span>
                    <a className="botao" href={`/api/acervo/${t.id}/pdf`} target="_blank" rel="noopener noreferrer"><Download className="ic" aria-hidden="true" />Baixar PDF</a>
                  </div>
                ) : (
                  <p className="linha-icone"><Lock className="ic" aria-hidden="true" />
                    <span>{t.visibilidade === 'SOMENTE_METADADOS' ? 'Os autores optaram por divulgar apenas os dados deste trabalho' : 'O texto completo deste TCC ainda não foi entregue.'}</span></p>
                )}
              </Secao>
            </>
          )}
        </Estado>
      </section>
    </PaginaPublica>
  );
}
