// Pedidos do aluno: lista das opções; o formulário só abre quando o aluno escolhe uma. Embaixo, os pedidos já enviados.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Secao } from '../../components/blocos';
import { Campo, CampoSelecao, CampoTexto, Estado, Pagina, Selo, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { talvez, useCarregar } from '../../hooks';
import type { Orientador, Tcc } from '../../types';
import { dia, mesmoId } from '../../util';
import { buscarMeuTcc } from './MeuTcc';

type Tipo = 'troca' | 'publicacao' | 'desistencia';
interface PedidoEnviado { tipo: 'ORIENTACAO' | 'TROCA' | 'PUBLICACAO' | 'DESISTENCIA'; id: string; status: string; criado_em: string; decidido_em: string | null; justificativa: string | null; detalhe: string | null }

const NOME_PEDIDO: Record<PedidoEnviado['tipo'], string> = {
  ORIENTACAO: 'Pedido de orientação', TROCA: 'Troca de orientador', PUBLICACAO: 'Conclusão por artigo publicado', DESISTENCIA: 'Desistência do TCC',
};

function SeloStatus({ status }: { status: string }) {
  if (status === 'PENDENTE') return <Selo cor="amarelo">Aguardando análise</Selo>;
  if (status === 'APROVADA' || status === 'ACEITA') return <Selo cor="verde">Aceito</Selo>;
  if (status === 'CANCELADA') return <Selo cor="cinza">Cancelado</Selo>;
  return <Selo cor="cinza">Recusado</Selo>;
}

export function Pedidos() {
  const c = useCarregar(() => Promise.all([
    buscarMeuTcc(), api<Orientador[]>('GET', '/orientacao/orientadores'), talvez(api<PedidoEnviado[]>('GET', '/orientacao/meus-pedidos')),
  ]), []);
  const [aberto, setAberto] = useState<Tipo | null>(null);
  const fechar = () => setAberto(null);
  const enviou = () => { setAberto(null); c.recarregar(); };

  return (
    <Pagina titulo="Pedidos" descricao="Pedidos que precisam da análise do orientador ou da coordenação. Você recebe a resposta nas notificações.">
      <Estado c={c}>
        {([tcc, orientadores, enviados]) => {
          if (!tcc) return <Vazio>Você ainda não tem TCC. <Link to="/meu-tcc">Faça a sua proposta</Link>.</Vazio>;
          const emAndamento = tcc.situacao === 'EM_DESENVOLVIMENTO' || tcc.situacao === 'APTO_DEFESA';
          const podeDesistir = ['EM_PROPOSTA', 'EM_DESENVOLVIMENTO', 'APTO_DEFESA'].includes(tcc.situacao);

          const opcao = (tipo: Tipo, titulo: string, texto: string, form: ReactNode, perigo = false) => (
            <li key={tipo} className={aberto === tipo ? 'aberto' : ''}>
              <div className="opcao-cabeca">
                <div>
                  <strong className={perigo ? 'texto-perigo' : ''}>{titulo}</strong>
                  <small>{texto}</small>
                </div>
                {aberto !== tipo && <button className="botao pequeno secundario" onClick={() => setAberto(tipo)}>Fazer pedido</button>}
              </div>
              {aberto === tipo && <div className="opcao-form">{form}</div>}
            </li>
          );

          return (
            <>
              {podeDesistir ? (
                <Secao titulo="Fazer um pedido">
                  <ul className="caixa lista-opcoes">
                    {emAndamento && opcao('troca', 'Trocar de orientador', 'O pedido vai para a coordenação do curso. Só pode haver um pedido aguardando por vez.',
                      <Troca tcc={tcc} orientadores={orientadores} aoCancelar={fechar} aoEnviar={enviou} />)}
                    {emAndamento && opcao('publicacao', 'Concluir o TCC por artigo publicado', 'Se você publicou um artigo com o tema do TCC, a coordenação pode aceitar o artigo no lugar da banca.',
                      <Publicacao tcc={tcc} aoCancelar={fechar} aoEnviar={enviou} />)}
                    {opcao('desistencia', 'Desistir do TCC', 'Precisa ser confirmado pelo orientador ou pela coordenação. Depois disso, o TCC é cancelado.',
                      <Desistencia aoCancelar={fechar} aoEnviar={enviou} />, true)}
                  </ul>
                </Secao>
              ) : <p className="texto-calmo pedidos-encerrado">Seu TCC já foi concluído ou encerrado, então não há novos pedidos disponíveis.</p>}

              <Secao titulo="Pedidos enviados">
                {!enviados?.length ? <p className="texto-calmo">Você ainda não fez nenhum pedido.</p> : (
                  <ul className="caixa lista-caixa">
                    {enviados.map((p) => (
                      <li key={p.tipo + p.id}>
                        <span>
                          {NOME_PEDIDO[p.tipo]}{p.detalhe && <span className="texto-calmo"> · {p.detalhe}</span>}
                          <small className="bloco texto-calmo">Enviado em {dia(p.criado_em)}{p.status === 'RECUSADA' && p.justificativa ? ` · Motivo da recusa: ${p.justificativa}` : ''}</small>
                        </span>
                        <SeloStatus status={p.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Secao>
            </>
          );
        }}
      </Estado>
    </Pagina>
  );
}

interface FormProps { aoCancelar: () => void; aoEnviar: () => void }

function Botoes({ aoCancelar, enviar, texto = 'Enviar pedido', perigo = false }: { aoCancelar: () => void; enviar: () => void; texto?: string; perigo?: boolean }) {
  return (
    <div className="acoes">
      <button className={`botao ${perigo ? 'perigo' : ''}`} onClick={enviar}>{texto}</button>
      <button className="botao secundario" onClick={aoCancelar}>Cancelar</button>
    </div>
  );
}

function Troca({ tcc, orientadores, aoCancelar, aoEnviar }: { tcc: Tcc; orientadores: Orientador[] } & FormProps) {
  const [novo, setNovo] = useState('');
  const [motivo, setMotivo] = useState('');
  const { executar } = useFeedback();
  const enviar = async () => {
    const r = await executar(() => api('POST', '/orientacao/trocas', { novoOrientadorId: Number(novo) || undefined, motivo }), 'Pedido de troca enviado para a coordenação.');
    if (r) aoEnviar();
  };
  return (
    <>
      <CampoSelecao rotulo="Novo orientador(a)" obrigatorio value={novo} onChange={(e) => setNovo(e.target.value)}>
        <option value="">Selecione...</option>
        {orientadores.filter((o) => !mesmoId(o.id, tcc.orientador_id)).map((o) => (
          <option key={o.id} value={o.id} disabled={!o.disponivel}>{o.nome}{o.disponivel ? '' : ' (sem vagas)'}</option>
        ))}
      </CampoSelecao>
      <CampoTexto rotulo="Motivo" obrigatorio value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explique por que você quer trocar de orientador" />
      <Botoes aoCancelar={aoCancelar} enviar={enviar} />
    </>
  );
}

function Publicacao({ tcc, aoCancelar, aoEnviar }: { tcc: Tcc } & FormProps) {
  const [f, setF] = useState({ tituloArtigo: '', veiculo: '', ano: String(new Date().getFullYear()), link: '' });
  const { executar } = useFeedback();
  const muda = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const enviar = async () => {
    const r = await executar(() => api('POST', `/tccs/${tcc.id}/publicacao`, { ...f, ano: Number(f.ano) }), 'Pedido enviado para a coordenação.');
    if (r) aoEnviar();
  };
  return (
    <>
      <Campo rotulo="Título do artigo" obrigatorio value={f.tituloArtigo} onChange={muda('tituloArtigo')} />
      <div className="grade-2">
        <Campo rotulo="Revista ou evento" obrigatorio value={f.veiculo} onChange={muda('veiculo')} placeholder="Ex.: SBIE 2026" />
        <Campo rotulo="Ano" type="number" obrigatorio value={f.ano} onChange={muda('ano')} />
      </div>
      <Campo rotulo="Link ou DOI" type="url" obrigatorio value={f.link} onChange={muda('link')} placeholder="https://doi.org/..." />
      <Botoes aoCancelar={aoCancelar} enviar={enviar} />
    </>
  );
}

function Desistencia({ aoCancelar, aoEnviar }: FormProps) {
  const [motivo, setMotivo] = useState('');
  const { executar, perguntar } = useFeedback();
  const enviar = async () => {
    if (!(await perguntar({ titulo: 'Pedir desistência?', texto: 'Se o orientador ou a coordenação confirmar, o seu TCC será cancelado.', confirmar: 'Sim, pedir desistência', perigo: true }))) return;
    const r = await executar(() => api('POST', '/orientacao/desistencias', { motivo }), 'Pedido de desistência enviado.');
    if (r) aoEnviar();
  };
  return (
    <>
      <CampoTexto rotulo="Motivo" obrigatorio value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Explique o motivo da desistência" />
      <Botoes aoCancelar={aoCancelar} enviar={enviar} texto="Pedir desistência" perigo />
    </>
  );
}
