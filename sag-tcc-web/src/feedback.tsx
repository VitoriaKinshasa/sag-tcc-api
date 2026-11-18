// Avisos (toasts) que aparecem no canto da tela e janelas de confirmação.
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ErroApi } from './api';
import { Modal } from './components/Modal';

type TipoAviso = 'sucesso' | 'erro';
interface Aviso { id: number; texto: string; tipo: TipoAviso }

interface Pergunta {
  titulo: string;
  texto?: string;
  confirmar?: string;
  perigo?: boolean;
  /** Se informado, pede um texto (ex.: justificativa). */
  campo?: { rotulo: string; obrigatorio?: boolean; placeholder?: string };
}

interface Feedback {
  avisar: (texto: string, tipo?: TipoAviso) => void;
  /** Abre uma janela de confirmação. Devolve false se a pessoa cancelar, ou o texto digitado quando há campo. */
  perguntar: (p: Pergunta) => Promise<string | boolean>;
  /** Roda uma ação da API: mostra o aviso de sucesso ou a mensagem de erro. Devolve o resultado ou undefined. */
  executar: <T>(acao: () => Promise<T>, sucesso?: string | ((r: T) => string)) => Promise<T | undefined>;
}

const FeedbackContext = createContext<Feedback | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pergunta, setPergunta] = useState<(Pergunta & { responder: (v: string | boolean) => void }) | null>(null);
  const [texto, setTexto] = useState('');
  const [erroCampo, setErroCampo] = useState(false);
  const seq = useRef(0);

  const avisar = useCallback((t: string, tipo: TipoAviso = 'sucesso') => {
    const id = ++seq.current;
    setAvisos((a) => [...a, { id, texto: t, tipo }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === 'erro' ? 7000 : 4500);
  }, []);

  const perguntar = useCallback((p: Pergunta) => new Promise<string | boolean>((ok) => {
    setTexto('');
    setErroCampo(false);
    setPergunta({ ...p, responder: (v) => { setPergunta(null); ok(v); } });
  }), []);

  const executar = useCallback(async <T,>(acao: () => Promise<T>, sucesso?: string | ((r: T) => string)) => {
    try {
      const r = await acao();
      if (sucesso) avisar(typeof sucesso === 'function' ? sucesso(r) : sucesso);
      return r;
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : 'Algo deu errado. Tente de novo.', 'erro');
      return undefined;
    }
  }, [avisar]);

  const confirmarPergunta = () => {
    if (!pergunta) return;
    if (pergunta.campo) {
      if (pergunta.campo.obrigatorio && !texto.trim()) { setErroCampo(true); return; }
      pergunta.responder(texto.trim());
    } else pergunta.responder(true);
  };

  return (
    <FeedbackContext.Provider value={{ avisar, perguntar, executar }}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso aviso-${a.tipo}`}>
            {a.tipo === 'erro' ? <TriangleAlert className="ic aviso-icone" aria-hidden="true" /> : <CircleCheck className="ic aviso-icone" aria-hidden="true" />}
            <span>{a.texto}</span>
            <button className="aviso-fechar" aria-label="Fechar aviso" onClick={() => setAvisos((l) => l.filter((x) => x.id !== a.id))}>×</button>
          </div>
        ))}
      </div>
      {pergunta && (
        <Modal titulo={pergunta.titulo} aoFechar={() => pergunta.responder(false)} pequeno
          rodape={<>
            <button className="botao secundario" onClick={() => pergunta.responder(false)}>Cancelar</button>
            <button className={`botao ${pergunta.perigo ? 'perigo' : ''}`} onClick={confirmarPergunta}>{pergunta.confirmar ?? 'Confirmar'}</button>
          </>}>
          {pergunta.texto && <p>{pergunta.texto}</p>}
          {pergunta.campo && (
            <div className="campo">
              <label htmlFor="pergunta-campo">{pergunta.campo.rotulo}{pergunta.campo.obrigatorio && <span className="obrigatorio"> *</span>}</label>
              <textarea id="pergunta-campo" autoFocus value={texto} placeholder={pergunta.campo.placeholder}
                aria-invalid={erroCampo} onChange={(e) => { setTexto(e.target.value); setErroCampo(false); }} />
              {erroCampo && <span className="erro-campo">Preencha este campo.</span>}
            </div>
          )}
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback precisa estar dentro de <FeedbackProvider>');
  return ctx;
}
