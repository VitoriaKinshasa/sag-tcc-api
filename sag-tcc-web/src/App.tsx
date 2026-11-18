import { Compass, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Vazio } from './components/ui';
import type { Perfil } from './types';
import { DefinirSenha, Login, RecuperarSenha } from './pages/Acesso';
import { Inicio } from './pages/Inicio';
import { Agenda, AgendaPublica } from './pages/comum/Agenda';
import { AtaDefesa, Bancas } from './pages/comum/Bancas';
import { MinhaDefesa } from './pages/aluno/MinhaDefesa';
import { DeclaracaoImpressa, Declaracoes } from './pages/comum/Declaracoes';
import { MeusDados } from './pages/comum/MeusDados';
import { Verificar } from './pages/comum/Verificar';
import { Emails } from './pages/coordenacao/Emails';
import { Relatorios } from './pages/coordenacao/Relatorios';
import { Desistencias } from './pages/comum/Desistencias';
import { Notificacoes } from './pages/comum/Notificacoes';
import { MeuTcc } from './pages/aluno/MeuTcc';
import { Pedidos } from './pages/aluno/Pedidos';
import { Prazos } from './pages/aluno/Prazos';
import { Versoes } from './pages/aluno/Versoes';
import { Areas } from './pages/orientador/Areas';
import { NovaBanca } from './pages/orientador/NovaBanca';
import { Orientandos } from './pages/orientador/Orientandos';
import { Solicitacoes } from './pages/orientador/Solicitacoes';
import { VersoesRecebidas } from './pages/orientador/VersoesRecebidas';
import { Calendario } from './pages/coordenacao/Calendario';
import { Cursos } from './pages/coordenacao/Cursos';
import { Publicacoes, Trocas } from './pages/coordenacao/Pedidos';
import { TccsCurso } from './pages/coordenacao/TccsCurso';
import { Usuarios } from './pages/coordenacao/Usuarios';

/** Só deixa entrar na tela quem tem um dos perfis informados. */
function Somente({ perfis, children }: { perfis: Perfil[]; children: ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario || !perfis.includes(usuario.perfil)) return <Vazio icone={Lock}>Esta tela não está disponível para o seu perfil.</Vazio>;
  return <>{children}</>;
}

function ExigeLogin() {
  const { usuario } = useAuth();
  return usuario ? <Layout /> : <Navigate to="/login" replace />;
}

export function App() {
  const { usuario } = useAuth();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={usuario ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/recuperar-senha" element={<RecuperarSenha />} />
        <Route path="/definir-senha" element={<DefinirSenha />} />
        <Route path="/agenda-publica" element={<AgendaPublica />} />
        <Route path="/verificar" element={<Verificar />} />
        <Route path="/verificar/:codigo" element={<Verificar />} />

        <Route element={<ExigeLogin />}>
          <Route index element={<Inicio />} />
          <Route path="notificacoes" element={<Notificacoes />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="ata/:id" element={<AtaDefesa />} />
          <Route path="meus-dados" element={<MeusDados />} />
          <Route path="declaracoes" element={<Somente perfis={['ALUNO', 'ORIENTADOR', 'MEMBRO_BANCA', 'COORDENACAO']}><Declaracoes /></Somente>} />
          <Route path="declaracao/:codigo" element={<DeclaracaoImpressa />} />

          {/* Aluno */}
          <Route path="meu-tcc" element={<Somente perfis={['ALUNO']}><MeuTcc /></Somente>} />
          <Route path="versoes" element={<Somente perfis={['ALUNO']}><Versoes /></Somente>} />
          <Route path="prazos" element={<Somente perfis={['ALUNO']}><Prazos /></Somente>} />
          <Route path="defesa" element={<Somente perfis={['ALUNO']}><MinhaDefesa /></Somente>} />
          <Route path="pedidos" element={<Somente perfis={['ALUNO']}><Pedidos /></Somente>} />

          {/* Orientador e membro de banca */}
          <Route path="solicitacoes" element={<Somente perfis={['ORIENTADOR', 'COORDENACAO']}><Solicitacoes /></Somente>} />
          <Route path="orientandos" element={<Somente perfis={['ORIENTADOR', 'COORDENACAO']}><Orientandos /></Somente>} />
          <Route path="versoes-recebidas" element={<Somente perfis={['ORIENTADOR', 'COORDENACAO']}><VersoesRecebidas /></Somente>} />
          <Route path="areas" element={<Somente perfis={['ORIENTADOR', 'COORDENACAO']}><Areas /></Somente>} />
          <Route path="bancas" element={<Somente perfis={['ORIENTADOR', 'MEMBRO_BANCA', 'COORDENACAO']}><Bancas /></Somente>} />
          <Route path="bancas/nova/:tccId" element={<Somente perfis={['ORIENTADOR', 'COORDENACAO']}><NovaBanca /></Somente>} />
          <Route path="desistencias" element={<Somente perfis={['ORIENTADOR', 'COORDENACAO']}><Desistencias /></Somente>} />

          {/* Coordenação */}
          <Route path="tccs" element={<Somente perfis={['COORDENACAO']}><TccsCurso /></Somente>} />
          <Route path="calendario" element={<Somente perfis={['COORDENACAO']}><Calendario /></Somente>} />
          <Route path="trocas" element={<Somente perfis={['COORDENACAO']}><Trocas /></Somente>} />
          <Route path="publicacoes" element={<Somente perfis={['COORDENACAO']}><Publicacoes /></Somente>} />
          <Route path="usuarios" element={<Somente perfis={['COORDENACAO']}><Usuarios /></Somente>} />
          <Route path="cursos" element={<Somente perfis={['COORDENACAO']}><Cursos /></Somente>} />
          <Route path="relatorios" element={<Somente perfis={['COORDENACAO']}><Relatorios /></Somente>} />
          <Route path="emails" element={<Somente perfis={['COORDENACAO']}><Emails /></Somente>} />

          <Route path="*" element={<Vazio icone={Compass}>Página não encontrada.</Vazio>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
