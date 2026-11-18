import { Download } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, baixar } from '../../api';
import { Campo, CampoTexto, Cartao, Dica, Estado, Info, Pagina } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Perfil } from '../../types';
import { dataHora, PERFIS } from '../../util';

interface Eu {
  nome: string; email: string; perfil: Perfil; matricula: string | null; externo: boolean; instituicao: string | null;
  titulacao: string | null; criado_em: string; termo_aceito_em: string | null; acesso_anterior_em: string | null;
  curso: string | null; curso_sigla: string | null; areas: string[] | null; orientandos: number; bancas: number;
}

/** "Meus dados": dados cadastrais, segurança da conta e direitos sobre os dados (LGPD). */
export function MeusDados() {
  const c = useCarregar(() => api<Eu>('GET', '/me'), []);
  const { executar } = useFeedback();

  return (
    <Pagina titulo="Meus dados" descricao="Seus dados no SAG-TCC. Nome, e-mail, matrícula e curso são corrigidos pela coordenação: se algo estiver errado, use “Pedir correção”.">
      <Estado c={c}>
        {(eu) => (
          <div className="painel">
            <Cartao titulo="Dados cadastrais">
              <dl className="infos">
                <Info rotulo="Nome">{eu.nome}</Info>
                <Info rotulo="E-mail">{eu.email}</Info>
                <Info rotulo="Perfil">{PERFIS[eu.perfil]}</Info>
                {eu.curso && <Info rotulo="Curso">{eu.curso} ({eu.curso_sigla})</Info>}
                {eu.matricula && <Info rotulo="Matrícula">{eu.matricula}</Info>}
                {eu.titulacao && <Info rotulo="Titulação">{eu.titulacao}</Info>}
                {eu.externo && <Info rotulo="Instituição">{eu.instituicao}</Info>}
                {eu.areas && eu.areas.length > 0 && <Info rotulo="Áreas de interesse">{eu.areas.join(', ')}</Info>}
                {(eu.perfil === 'ORIENTADOR' || eu.perfil === 'COORDENACAO') && <Info rotulo="Orientandos em andamento">{eu.orientandos}</Info>}
                {eu.perfil !== 'ALUNO' && <Info rotulo="Bancas de que participou">{eu.bancas}</Info>}
                {(eu.perfil === 'ORIENTADOR' || eu.perfil === 'MEMBRO_BANCA') && !eu.externo && <Info rotulo="Vínculo">Professor(a) do NUCOMP: orienta alunos de todos os cursos</Info>}
              </dl>
            </Cartao>

            <Cartao titulo="Segurança da conta">
              <dl className="infos">
                <Info rotulo="Acesso anterior">{eu.acesso_anterior_em ? dataHora(eu.acesso_anterior_em) : 'Este é o seu primeiro acesso'}</Info>
                <Info rotulo="Cadastro feito em">{dataHora(eu.criado_em)}</Info>
                <Info rotulo="Termo de uso aceito em">{dataHora(eu.termo_aceito_em)}</Info>
              </dl>
              <Dica>Não reconhece o acesso anterior? Troque a sua senha agora e avise a coordenação.</Dica>
              <AlterarSenha />
            </Cartao>

            <Cartao titulo="Seus dados e a LGPD" descricao="Pela Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode ver tudo o que o sistema guarda sobre você e pedir a correção.">
              <div className="acoes">
                <button className="botao secundario" onClick={() => executar(() => baixar('/me/exportar', 'meus-dados-sag-tcc.json'), 'Arquivo baixado.')}><Download className="ic" aria-hidden="true" /> Baixar meus dados</button>
              </div>
              <PedirCorrecao />
            </Cartao>
          </div>
        )}
      </Estado>
    </Pagina>
  );
}

function AlterarSenha() {
  const [f, setF] = useState({ atual: '', nova: '', repetir: '' });
  const [erro, setErro] = useState<string | null>(null);
  const { executar } = useFeedback();
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (f.nova.length < 8) return setErro('A nova senha precisa ter pelo menos 8 caracteres.');
    if (f.nova !== f.repetir) return setErro('As duas senhas novas não são iguais.');
    setErro(null);
    const r = await executar(() => api('POST', '/auth/alterar-senha', { senhaAtual: f.atual, novaSenha: f.nova }), 'Senha alterada! Use a nova senha no próximo login.');
    if (r) setF({ atual: '', nova: '', repetir: '' });
  };
  return (
    <form onSubmit={enviar} noValidate>
      <h3 className="subtitulo">Alterar senha</h3>
      {erro && <div className="erro-formulario" role="alert">{erro}</div>}
      <Campo rotulo="Senha atual" type="password" autoComplete="current-password" value={f.atual} onChange={(e) => setF({ ...f, atual: e.target.value })} />
      <Campo rotulo="Nova senha" type="password" autoComplete="new-password" value={f.nova} onChange={(e) => setF({ ...f, nova: e.target.value })}
        ajuda="Mínimo de 8 caracteres. Misture letras, números e símbolos." />
      <Campo rotulo="Repita a nova senha" type="password" autoComplete="new-password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} />
      <button className="botao" type="submit">Alterar senha</button>
    </form>
  );
}

function PedirCorrecao() {
  const [mensagem, setMensagem] = useState('');
  const { executar } = useFeedback();
  const enviar = async () => {
    const r = await executar(() => api<{ mensagem: string }>('POST', '/me/correcao', { mensagem }), (x) => `${x.mensagem}.`);
    if (r) setMensagem('');
  };
  return (
    <div>
      <h3 className="subtitulo">Pedir correção</h3>
      <CampoTexto rotulo="O que está errado?" value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Ex.: meu nome está sem acento; minha matrícula está errada" />
      <button className="botao secundario" onClick={enviar} disabled={mensagem.trim().length < 5}>Enviar pedido</button>
    </div>
  );
}
