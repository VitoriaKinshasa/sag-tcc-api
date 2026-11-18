import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ErroApi } from '../../api';
import { Modal } from '../../components/Modal';
import { Campo, CampoTexto, Estado, Pagina, SeloSituacao, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Id, Orientando, Situacao, Visibilidade } from '../../types';
import { agoraLocal, paraISO } from '../../util';
import { ModalHistorico, ModalSituacao, ModalVisibilidade, NOME_VISIBILIDADE } from '../comum/compartilhado';

type Acao = 'reuniao' | 'encontro' | 'situacao' | 'historico' | 'visibilidade';

interface Aprovado { id: Id; titulo: string; situacao: Situacao; visibilidade: Visibilidade; aluno: string; curso: string; ano: number }

export function Orientandos() {
  const c = useCarregar(() => api<Orientando[]>('GET', '/orientacao/orientandos'), []);
  const [aberto, setAberto] = useState<{ t: Orientando; acao: Acao } | null>(null);
  const navegar = useNavigate();
  const fechar = () => setAberto(null);

  return (
    <Pagina titulo="Meus orientandos" descricao="TCCs em andamento que você orienta ou coorienta.">
      <Estado c={c}>
        {(lista) => lista.length === 0 ? <Vazio icone={Users}>Você ainda não tem orientandos. Os pedidos chegam em “Solicitações recebidas”.</Vazio> : (
          <ul className="caixa lista-orientandos">
            {lista.map((t) => {
              const orientador = t.papel === 'ORIENTADOR';
              return (
                <li key={t.id}>
                  <div className="orientando-cabeca">
                    <div>
                      <strong>{t.aluno.replace(/\s*\((aluna|aluno)\)$/i, '')}</strong>
                      <span className="texto-calmo"> · {t.curso}</span>
                      <small className="bloco">{t.titulo}</small>
                    </div>
                    <div className="selos">
                      <SeloSituacao situacao={t.situacao} atrasado={t.atrasado} />
                      {!orientador && <span className="selo selo-cinza">Você é coorientador(a)</span>}
                    </div>
                  </div>
                  <div className="acoes">
                    {orientador && t.situacao === 'APTO_DEFESA' && <button className="botao pequeno" onClick={() => navegar(`/bancas/nova/${t.id}`)}>Cadastrar banca</button>}
                    {orientador && <button className="botao pequeno secundario" onClick={() => setAberto({ t, acao: 'reuniao' })}>Agendar reunião</button>}
                    {orientador && <button className="botao pequeno secundario" onClick={() => setAberto({ t, acao: 'encontro' })}>Registrar encontro</button>}
                    {orientador && <button className="botao pequeno secundario" onClick={() => setAberto({ t, acao: 'situacao' })}>Alterar situação</button>}
                    <button className="botao pequeno secundario" onClick={() => setAberto({ t, acao: 'historico' })}>Histórico</button>
                    {orientador && <button className="botao pequeno secundario" onClick={() => setAberto({ t, acao: 'visibilidade' })}>Visibilidade no acervo</button>}
                  </div>
                  {orientador && t.situacao === 'EM_DESENVOLVIMENTO' && <p className="ajuda">Para cadastrar a banca, altere a situação para “Apto à defesa”.</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Estado>
      <Aprovados />
      {aberto?.acao === 'visibilidade' && <ModalVisibilidade tcc={aberto.t} aoFechar={fechar} aoSalvar={() => { fechar(); c.recarregar(); }} />}
      {aberto?.acao === 'reuniao' && <ModalReuniao t={aberto.t} aoFechar={fechar} />}
      {aberto?.acao === 'encontro' && <ModalEncontro t={aberto.t} aoFechar={fechar} />}
      {aberto?.acao === 'historico' && <ModalHistorico tccId={aberto.t.id} titulo={aberto.t.titulo} aoFechar={fechar} />}
      {aberto?.acao === 'situacao' && <ModalSituacao tcc={aberto.t} aoFechar={fechar} aoSalvar={() => { fechar(); c.recarregar(); }} />}
    </Pagina>
  );
}

/** TCCs já aprovados que o professor orientou: ficam escondidos até clicar (UC27: ele também define a visibilidade). */
function Aprovados() {
  const c = useCarregar(() => api<Aprovado[]>('GET', '/orientacao/aprovados'), []);
  const [mostrar, setMostrar] = useState(false);
  const [alterando, setAlterando] = useState<Aprovado | null>(null);
  const lista = c.dados ?? [];
  if (!lista.length) return null;
  return (
    <section className="secao secao-aprovados">
      <button className="botao-historico" aria-expanded={mostrar} onClick={() => setMostrar((v) => !v)}>
        {mostrar ? <ChevronUp className="ic" aria-hidden="true" /> : <ChevronDown className="ic" aria-hidden="true" />}
        {mostrar ? 'Esconder TCCs já aprovados' : `Ver TCCs já aprovados (${lista.length})`}
      </button>
      {mostrar && (
        <ul className="caixa lista-orientandos">
          {lista.map((t) => (
            <li key={t.id}>
              <div className="orientando-cabeca">
                <div>
                  <strong>{t.aluno.replace(/\s*\((aluna|aluno)\)$/i, '')}</strong>
                  <span className="texto-calmo"> · {t.curso} · {t.ano}</span>
                  <small className="bloco">{t.titulo}</small>
                </div>
                <div className="selos"><SeloSituacao situacao={t.situacao} /></div>
              </div>
              <div className="linha-acao">
                <span className="texto-calmo">Acervo público: <strong>{NOME_VISIBILIDADE[t.visibilidade]}</strong></span>
                <span className="acoes">
                  <Link className="botao pequeno secundario" to={`/acervo/${t.id}`}>Ver no acervo</Link>
                  <button className="botao pequeno secundario" onClick={() => setAlterando(t)}>Alterar visibilidade</button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {alterando && <ModalVisibilidade tcc={alterando} aoFechar={() => setAlterando(null)} aoSalvar={() => { setAlterando(null); c.recarregar(); }} />}
    </section>
  );
}

function ModalReuniao({ t, aoFechar }: { t: Orientando; aoFechar: () => void }) {
  const [quando, setQuando] = useState('');
  const [local, setLocal] = useState('');
  const { executar, perguntar, avisar } = useFeedback();

  const agendar = async (confirmarConflito = false): Promise<void> => {
    if (!quando) return avisar('Informe a data e a hora.', 'erro');
    try {
      await api('POST', `/orientacao/tccs/${t.id}/reunioes`, { dataHora: paraISO(quando), localOuLink: local, ...(confirmarConflito ? { confirmarConflito: true } : {}) });
      avisar('Reunião agendada. O aluno foi avisado.');
      aoFechar();
    } catch (e) {
      // Conflito de horário: pergunta se quer marcar mesmo assim.
      if (e instanceof ErroApi && e.status === 409 && !confirmarConflito) {
        if (await perguntar({ titulo: 'Horário em conflito', texto: e.message + ' Deseja agendar mesmo assim?', confirmar: 'Agendar mesmo assim' })) return agendar(true);
        return;
      }
      await executar(() => Promise.reject(e));
    }
  };

  return (
    <Modal titulo="Agendar reunião de orientação" subtitulo={`${t.titulo} · ${t.aluno}`} aoFechar={aoFechar} pequeno
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={() => agendar()}>Agendar</button></>}>
      <Campo rotulo="Data e hora" type="datetime-local" min={agoraLocal()} obrigatorio value={quando} onChange={(e) => setQuando(e.target.value)} />
      <Campo rotulo="Local ou link" obrigatorio value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Sala 10 da EST ou link do Google Meet" />
      <p className="ajuda">O aluno recebe o aviso por notificação e e-mail.</p>
    </Modal>
  );
}

function ModalEncontro({ t, aoFechar }: { t: Orientando; aoFechar: () => void }) {
  const [data, setData] = useState('');
  const [resumo, setResumo] = useState('');
  const { executar, avisar } = useFeedback();
  const salvar = async () => {
    if (!data) return avisar('Informe a data do encontro.', 'erro');
    const r = await executar(() => api('POST', `/orientacao/tccs/${t.id}/encontros`, { data: paraISO(data), resumo }), 'Encontro registrado no histórico do TCC.');
    if (r) aoFechar();
  };
  return (
    <Modal titulo="Registrar encontro de orientação" subtitulo={`${t.titulo} · ${t.aluno}`} aoFechar={aoFechar}
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Registrar</button></>}>
      <Campo rotulo="Data do encontro" type="datetime-local" max={agoraLocal()} obrigatorio value={data} onChange={(e) => setData(e.target.value)} />
      <CampoTexto rotulo="O que foi conversado" obrigatorio rows={5} value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Assuntos tratados e próximos passos" />
    </Modal>
  );
}
