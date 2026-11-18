import { Bell, ChevronDown, Menu } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth, useUsuario } from '../auth';
import { useFeedback } from '../feedback';
import { MENU, type ItemMenu } from '../menu';
import type { Notificacao } from '../types';
import { PERFIS } from '../util';
import { Modal } from './Modal';

/** "Quinta-feira, 12 de novembro de 2026" (só a primeira letra maiúscula). */
function hojePorExtenso() {
  const t = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Manaus' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Estrutura das telas com login: cabeçalho, menu e conteúdo. */
export function Layout() {
  const usuario = useUsuario();
  const { sair, termoPendente } = useAuth();
  const local = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);

  // Fecha o menu do celular ao trocar de tela.
  useEffect(() => { setMenuAberto(false); }, [local.pathname]);

  // Conta as notificações não lidas (ao trocar de tela e a cada minuto).
  useEffect(() => {
    let ativo = true;
    const contar = () => api<Notificacao[]>('GET', '/notificacoes')
      .then((l) => { if (ativo) setNaoLidas(l.filter((n) => !n.lida).length); })
      .catch(() => {});
    contar();
    const t = setInterval(contar, 60000);
    const aoLer = () => contar();
    window.addEventListener('notificacoes-mudaram', aoLer);
    return () => { ativo = false; clearInterval(t); window.removeEventListener('notificacoes-mudaram', aoLer); };
  }, [local.pathname]);

  return (
    <div className="app">
      <a href="#conteudo" className="pular">Pular para o conteúdo</a>
      <header className="cabecalho">
        <div className="cabecalho-interno">
          <Link to="/" className="marca" aria-label="SAG-TCC, ir para o início">
            <img src="/uea.png" alt="" />
            <span>
              <strong>SAG-TCC</strong>
              <small>Sistema de Governança de TCC</small>
            </span>
          </Link>
          <div className="cabecalho-direita">
            <Link to="/notificacoes" className="sino" aria-label={`Notificações${naoLidas ? `, ${naoLidas} não lida(s)` : ''}`}>
              <Bell className="ic" aria-hidden="true" />
              {naoLidas > 0 && <span className="sino-numero">{naoLidas > 9 ? '9+' : naoLidas}</span>}
            </Link>
            <button className="botao-sair" onClick={() => sair()}>Sair</button>
            <button className="botao-menu" aria-expanded={menuAberto} aria-controls="menu-principal" onClick={() => setMenuAberto((v) => !v)}>
              <Menu className="ic" aria-hidden="true" /> Menu
            </button>
          </div>
        </div>
        <nav id="menu-principal" className={`menu ${menuAberto ? 'aberto' : ''}`} aria-label="Menu principal">
          <ul className="menu-interno">
            {MENU[usuario.perfil].map((item) => <ItemDoMenu key={item.rotulo} item={item} />)}
            <li className="so-celular"><NavLink to="/notificacoes" className="menu-link">Notificações{naoLidas > 0 && ` (${naoLidas})`}</NavLink></li>
            <li className="so-celular"><NavLink to="/meus-dados" className="menu-link">Meus dados</NavLink></li>
            <li className="so-celular"><button className="menu-link" onClick={() => sair()}>Sair</button></li>
          </ul>
        </nav>
        <div className="faixa-usuario">
          <div className="faixa-interna">
            <span>
              <span className="faixa-perfil">{PERFIS[usuario.perfil]}:</span> <strong>{usuario.nome.toUpperCase()}</strong>
              <Link to="/meus-dados" className="faixa-link">Meus dados</Link>
            </span>
            <span className="faixa-data">{hojePorExtenso()}</span>
          </div>
        </div>
      </header>

      <main id="conteudo" className="conteudo" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="rodape">
        Universidade do Estado do Amazonas · Escola Superior de Tecnologia · SAG-TCC
      </footer>

      {termoPendente && <TermoDeUso />}
    </div>
  );
}

function ItemDoMenu({ item }: { item: ItemMenu }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const local = useLocation();
  useEffect(() => { setAberto(false); }, [local.pathname]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  if (!item.filhos) {
    return <li><NavLink to={item.caminho!} end={item.caminho === '/'} className="menu-link">{item.rotulo}</NavLink></li>;
  }
  const ativo = item.filhos.some((f) => local.pathname.startsWith(f.caminho));
  return (
    <li ref={ref} className="menu-grupo">
      <button className={`menu-link ${ativo ? 'active' : ''}`} aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        {item.rotulo} <ChevronDown className="seta" aria-hidden="true" />
      </button>
      <ul className={`submenu ${aberto ? 'aberto' : ''}`}>
        {item.filhos.map((f) => <li key={f.caminho}><NavLink to={f.caminho} className="submenu-link">{f.rotulo}</NavLink></li>)}
      </ul>
    </li>
  );
}

/** No primeiro acesso a pessoa precisa aceitar o termo de uso dos dados (LGPD). */
function TermoDeUso() {
  const { aceitarTermo, sair } = useAuth();
  const { executar } = useFeedback();
  const navegar = useNavigate();
  return (
    <Modal titulo="Termo de uso e privacidade" aoFechar={() => {}}
      rodape={<>
        <button className="botao secundario" onClick={() => { sair(); navegar('/login'); }}>Não aceito (sair)</button>
        <button className="botao" onClick={() => executar(aceitarTermo, 'Termo aceito. Bom trabalho!')}>Li e aceito</button>
      </>}>
      <div className="termo">
        <p>Antes de começar, leia como o SAG-TCC usa os seus dados:</p>
        <ul>
          <li>Guardamos apenas o necessário para acompanhar o TCC: nome, e-mail institucional, matrícula, curso e os documentos que você enviar.</li>
          <li>Seu TCC em andamento só pode ser visto por você, seu orientador, seu coorientador e a coordenação do curso.</li>
          <li>As notas da banca não são públicas. A agenda pública de defesas mostra só título, aluno, data, local e banca, sem e-mails.</li>
          <li>Tudo o que é criado, alterado ou excluído fica registrado (quem fez e quando) para garantir a segurança.</li>
          <li>Você pode pedir a correção dos seus dados à coordenação do curso, conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).</li>
        </ul>
      </div>
    </Modal>
  );
}
