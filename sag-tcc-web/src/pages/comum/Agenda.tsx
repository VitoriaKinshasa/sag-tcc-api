import { CalendarDays, Clock, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Secao } from '../../components/blocos';
import { CampoSelecao, Campo, Estado, Pagina } from '../../components/ui';
import { useCarregar } from '../../hooks';
import type { Curso, DefesaAgenda } from '../../types';
import { PAPEIS } from '../../util';

/** Agenda de defesas: qualquer pessoa pode ver, mesmo sem login. Não mostra e-mails nem notas. */
export function Agenda() {
  const [curso, setCurso] = useState('');
  const [mes, setMes] = useState('');
  const cursos = useCarregar(() => api<Curso[]>('GET', '/agenda/cursos'), []);
  const lista = useCarregar(() => {
    const q = new URLSearchParams();
    if (curso) q.set('cursoId', curso);
    if (mes) q.set('mes', mes);
    return api<DefesaAgenda[]>('GET', '/agenda' + (q.size ? '?' + q : ''));
  }, [curso, mes]);

  const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  return (
    <Pagina titulo="Agenda de defesas" descricao="Próximas defesas de TCC. As defesas são públicas: qualquer pessoa pode assistir.">
      <div className="filtros">
        <CampoSelecao rotulo="Curso" value={curso} onChange={(e) => setCurso(e.target.value)}>
          <option value="">Todos os cursos</option>
          {(cursos.dados ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </CampoSelecao>
        <Campo rotulo="Mês" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
      </div>
      <Estado c={lista}>
        {(defesas) => defesas.length === 0 ? (
          <div className="vazio-pagina">
            <CalendarDays className="vazio-icone" aria-hidden="true" strokeWidth={1.5} />
            <h2>Nenhuma defesa agendada</h2>
            <p>Não há defesas marcadas{curso || mes ? ' para esse filtro' : ' por enquanto'}.</p>
          </div>
        ) : (
          <Secao titulo="Próximas defesas">
            <ol className="caixa lista-agenda">
              {defesas.map((d) => {
                const data = new Date(d.data_hora);
                const [ano, m, dd] = data.toLocaleDateString('sv-SE', { timeZone: 'America/Manaus' }).split('-');
                return (
                  <li key={d.id}>
                    <span className="prazo-data" aria-hidden="true"><strong>{dd}</strong>{MESES[Number(m) - 1]}{ano !== String(new Date().getFullYear()) && <small>{ano}</small>}</span>
                    <div className="agenda-info">
                      <strong>{d.titulo}</strong>
                      <span className="texto-calmo">{d.aluno} · {d.curso}</span>
                      <span className="agenda-quando">
                        <span className="com-icone"><Clock className="ic" aria-hidden="true" />{data.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Manaus' })}, {data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Manaus' })}</span>
                        <span className="com-icone"><MapPin className="ic" aria-hidden="true" /><Local texto={d.local_ou_link} /></span>
                      </span>
                      <small className="texto-calmo">Banca: {d.membros.map((x) => `${x.nome} (${PAPEIS[x.papel].toLowerCase()})`).join(', ')}</small>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Secao>
        )}
      </Estado>
    </Pagina>
  );
}

/** Mostra o local; se for um link (ex.: Google Meet), vira link clicável. */
export function Local({ texto }: { texto: string }) {
  if (/^https?:\/\//i.test(texto)) return <a href={texto} target="_blank" rel="noopener noreferrer">{texto}</a>;
  return <>{texto}</>;
}

/** Versão da agenda para quem não está logado (com cabeçalho simples). */
export function AgendaPublica() {
  return (
    <div className="app">
      <header className="cabecalho">
        <div className="cabecalho-interno">
          <Link to="/login" className="marca"><img src="/uea.png" alt="" /><span><strong>SAG-TCC</strong><small>Sistema de Governança de TCC</small></span></Link>
          <div className="cabecalho-direita"><Link to="/login" className="botao-sair">Entrar</Link></div>
        </div>
      </header>
      <main className="conteudo"><Agenda /></main>
    </div>
  );
}
