// Telas sem login: entrar, esqueci a senha e criar senha (link do e-mail).
import { ArrowLeft } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ErroApi } from '../api';
import { useAuth } from '../auth';
import { CONTAS_DEMO, MOSTRAR_CONTAS_DEMO } from '../config';
import { Campo, Dica } from '../components/ui';
import { useFeedback } from '../feedback';

/** Moldura das telas de acesso: painel verde à esquerda e o formulário à direita. */
function TelaAcesso({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <div className="acesso">
      <aside className="acesso-painel">
        <img src="/uea.png" alt="Universidade do Estado do Amazonas" className="acesso-logo" />
        <h1>SAG-TCC</h1>
        <p>Sistema Automatizado de Governança de Trabalhos de Conclusão de Curso</p>
        <ul>
          <li>Proposta, orientação e versões em um só lugar</li>
          <li>Prazos com aviso antes de vencer</li>
          <li>Bancas, notas e ata da defesa</li>
        </ul>
        <small>Escola Superior de Tecnologia · UEA</small>
      </aside>
      <main className="acesso-formulario">
        <div className="acesso-caixa">
          <h2>{titulo}</h2>
          {subtitulo && <p className="acesso-subtitulo">{subtitulo}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}

export function Login() {
  const { entrar, avisoLogin } = useAuth();
  const navegar = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
      navegar('/', { replace: true });
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <TelaAcesso titulo="Entrar" subtitulo="Use seu e-mail institucional e sua senha.">
      {avisoLogin && <Dica tipo="alerta">{avisoLogin}</Dica>}
      {erro && <div className="erro-formulario" role="alert">{erro}</div>}
      <form onSubmit={enviar} noValidate>
        <Campo rotulo="E-mail" type="email" autoComplete="username" placeholder="seu.nome@uea.edu.br"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="campo-senha">
          <Campo rotulo="Senha" type={verSenha ? 'text' : 'password'} autoComplete="current-password"
            value={senha} onChange={(e) => setSenha(e.target.value)} />
          <button type="button" className="ver-senha" onClick={() => setVerSenha((v) => !v)} aria-pressed={verSenha}>
            {verSenha ? 'Esconder' : 'Mostrar'}
          </button>
        </div>
        <button type="submit" className="botao largo" disabled={enviando}>{enviando ? 'Entrando...' : 'Entrar'}</button>
      </form>
      <div className="acesso-links">
        <Link to="/recuperar-senha">Esqueci minha senha</Link>
        <Link to="/agenda-publica">Ver agenda de defesas</Link>
        <Link to="/verificar">Verificar documento</Link>
        <Link to="/acervo">Acervo de TCCs</Link>
      </div>
      <p className="acesso-nota">Primeiro acesso? A coordenação do seu curso faz o cadastro e você recebe por e-mail um link para criar sua senha.</p>

      {MOSTRAR_CONTAS_DEMO && (
        <details className="contas-demo">
          <summary>Contas de demonstração (só para testes)</summary>
          <p>Clique em um nome para preencher. Senha de todas: <code>Senha@123</code></p>
          {CONTAS_DEMO.map(([curso, pessoas]) => (
            <div key={curso} className="contas-grupo">
              <strong>{curso}</strong>
              {pessoas.map(([nome, mail, papel]) => (
                <button type="button" key={mail} onClick={() => { setEmail(mail); setSenha('Senha@123'); }}>
                  {nome} <span>{papel}</span>
                </button>
              ))}
            </div>
          ))}
        </details>
      )}
    </TelaAcesso>
  );
}

export function RecuperarSenha() {
  const { executar } = useFeedback();
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const r = await executar(() => api('POST', '/auth/recuperar-senha', { email: email.trim() }));
    if (r) setEnviado(true);
  };

  return (
    <TelaAcesso titulo="Esqueci minha senha" subtitulo="Informe seu e-mail. Se ele estiver cadastrado, você vai receber um link para criar uma senha nova.">
      {enviado ? (
        <Dica tipo="sucesso">Pronto! Se o e-mail estiver cadastrado, o link chega em alguns minutos. Confira também a caixa de spam.</Dica>
      ) : (
        <form onSubmit={enviar}>
          <Campo rotulo="E-mail" type="email" autoComplete="username" obrigatorio value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="botao largo" type="submit">Enviar link</button>
        </form>
      )}
      <div className="acesso-links"><Link to="/login"><ArrowLeft className="ic" aria-hidden="true" /> Voltar para o login</Link></div>
    </TelaAcesso>
  );
}

export function DefinirSenha() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navegar = useNavigate();
  const { executar, avisar } = useFeedback();
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const forca = [s1.length >= 8, /[A-Z]/.test(s1) && /[a-z]/.test(s1), /\d/.test(s1), /[^A-Za-z0-9]/.test(s1)].filter(Boolean).length;
  const NOMES_FORCA = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (s1.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (s1 !== s2) return setErro('As duas senhas não são iguais.');
    setErro(null);
    const r = await executar(() => api('POST', '/auth/definir-senha', { token, novaSenha: s1 }));
    if (r) { avisar('Senha criada! Agora é só entrar.'); navegar('/login', { replace: true }); }
  };

  if (!token) {
    return (
      <TelaAcesso titulo="Link inválido">
        <Dica tipo="alerta">Este link está incompleto. Abra de novo o link que chegou no seu e-mail ou peça um novo em “Esqueci minha senha”.</Dica>
        <div className="acesso-links"><Link to="/recuperar-senha">Pedir novo link</Link></div>
      </TelaAcesso>
    );
  }
  return (
    <TelaAcesso titulo="Criar minha senha" subtitulo="Escolha uma senha só sua. O link só pode ser usado uma vez.">
      {erro && <div className="erro-formulario" role="alert">{erro}</div>}
      <form onSubmit={enviar} noValidate>
        <Campo rotulo="Nova senha" type="password" autoComplete="new-password" value={s1} onChange={(e) => setS1(e.target.value)}
          ajuda="Mínimo de 8 caracteres. Misture letras maiúsculas, minúsculas, números e símbolos." />
        {s1 && (
          <div className="forca" aria-live="polite">
            <div className="forca-barra"><span style={{ width: `${(forca / 4) * 100}%` }} className={`forca-${forca}`} /></div>
            <small>Senha: {NOMES_FORCA[forca]}</small>
          </div>
        )}
        <Campo rotulo="Repita a senha" type="password" autoComplete="new-password" value={s2} onChange={(e) => setS2(e.target.value)} />
        <button className="botao largo" type="submit">Salvar senha</button>
      </form>
    </TelaAcesso>
  );
}
