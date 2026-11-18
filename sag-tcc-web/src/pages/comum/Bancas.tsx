import { CalendarPlus, Check, Clock, Download, GraduationCap, PenLine } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, baixar, lerBase64 } from '../../api';
import { useUsuario } from '../../auth';
import { EscolherPdf } from '../../components/EscolherPdf';
import { Modal } from '../../components/Modal';
import { Ficha } from '../../components/blocos';
import { Campo, CampoSelecao, CampoTexto, Cartao, Dica, Estado, Pagina, Selo, SeloDe, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Ata, Banca, MembroBanca, Resultado } from '../../types';
import { agoraLocal, dataHora, dataHoraLonga, dia, mesmoId, nota, PAPEIS, paraISO, RESULTADOS, STATUS_BANCA } from '../../util';
import { Local } from './Agenda';

type Acao = 'nota' | 'resultado' | 'remarcar' | 'convites' | 'substituir' | 'cancelar';

/** Lista de bancas do usuário logado (orientador, membro de banca, aluno ou coordenação do curso). */
export function Bancas({ comoAluno = false }: { comoAluno?: boolean }) {
  const eu = useUsuario();
  const c = useCarregar(() => api<Banca[]>('GET', '/bancas/minhas'), []);
  const [aberta, setAberta] = useState<{ banca: Banca; acao: Acao } | null>(null);
  const [verCanceladas, setVerCanceladas] = useState(false);
  const fechar = () => setAberta(null);
  const salvou = () => { setAberta(null); c.recarregar(); };
  const coordenacao = eu.perfil === 'COORDENACAO';

  return (
    <Pagina titulo={comoAluno ? 'Minha defesa' : coordenacao ? 'Bancas do curso' : 'Bancas'}
      descricao={comoAluno
        ? 'Data, local e banca da sua defesa. O resultado e a ata aparecem aqui depois da defesa.'
        : coordenacao
          ? 'Todas as bancas do seu curso e as bancas de que você participa como professor(a). A coordenação pode cancelar uma banca e corrigir notas pela ata.'
          : 'Bancas em que você participa. Baixe a versão final do TCC para ler antes da defesa. Depois do horário, presidente e titulares lançam as notas e o presidente registra o resultado.'}>
      <Estado c={c}>
        {(bancas) => {
          const canceladas = bancas.filter((b) => b.status === 'CANCELADA');
          const visiveis = verCanceladas ? bancas : bancas.filter((b) => b.status !== 'CANCELADA');
          return (
            <>
              {canceladas.length > 0 && (
                <label className="caixa-marcar">
                  <input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} />
                  Mostrar bancas canceladas ({canceladas.length})
                </label>
              )}
              {visiveis.length === 0 ? (
                <Vazio icone={GraduationCap}>{comoAluno
                  ? 'Sua defesa ainda não foi agendada. O orientador cadastra a banca quando o TCC estiver “Apto à defesa”.'
                  : 'Nenhuma banca por aqui.'}</Vazio>
              ) : visiveis.map((b) => <CartaoBanca key={b.id} banca={b} abrir={(acao) => setAberta({ banca: b, acao })} />)}
            </>
          );
        }}
      </Estado>
      {aberta?.acao === 'nota' && <ModalNota banca={aberta.banca} aoFechar={fechar} aoSalvar={salvou} />}
      {aberta?.acao === 'resultado' && <ModalResultado banca={aberta.banca} aoFechar={fechar} aoSalvar={salvou} />}
      {aberta?.acao === 'remarcar' && <ModalRemarcar banca={aberta.banca} aoFechar={fechar} aoSalvar={salvou} />}
      {aberta?.acao === 'convites' && <ModalConvites banca={aberta.banca} aoFechar={fechar} />}
      {aberta?.acao === 'substituir' && <ModalSubstituir banca={aberta.banca} aoFechar={fechar} aoSalvar={salvou} />}
      {aberta?.acao === 'cancelar' && <ModalCancelar banca={aberta.banca} aoFechar={fechar} aoSalvar={salvou} />}
    </Pagina>
  );
}

function CartaoBanca({ banca: b, abrir }: { banca: Banca; abrir: (a: Acao) => void }) {
  const eu = useUsuario();
  const { executar } = useFeedback();
  const papel = b.meuPapel;
  const jaAconteceu = new Date(b.data_hora) <= new Date();
  const avaliador = papel === 'PRESIDENTE' || papel === 'TITULAR';
  const minhaNota = b.membros?.find((m) => mesmoId(m.usuarioId, eu.id))?.notaRegistrada;
  const souAluno = mesmoId(b.aluno_id, eu.id);
  const coordenacao = eu.perfil === 'COORDENACAO';
  const agendada = b.status === 'AGENDADA';
  const avaliadores = (b.membros ?? []).filter((m) => m.papel !== 'SUPLENTE');
  const lancadas = avaliadores.filter((m) => m.notaRegistrada).length;
  const presidente = papel === 'PRESIDENTE';

  const dias = b.prazo_correcoes ? diasAte(b.prazo_correcoes) : null;
  const linhas: [string, ReactNode][] = [
    ['Título', <strong key="t">{b.titulo}</strong>],
    ['Aluno(a)', b.aluno],
    ['Curso', b.curso],
    ['Situação', <span key="s" className="selos"><SeloDe mapa={STATUS_BANCA} valor={b.status} />{papel && <Selo cor="cinza">Você: {PAPEIS[papel]}</Selo>}</span>],
    ['Data', diaSemana(b.data_hora)],
    ['Horário', horario(b.data_hora)],
    ['Local', <Local key="l" texto={b.local_ou_link} />],
  ];
  if (b.resultado) {
    linhas.push(['Resultado', RESULTADOS[b.resultado][0]], ['Nota final', notaCurta(b.nota_final)]);
  }
  if (b.resultado === 'APROVADO_COM_CORRECOES' && b.prazo_correcoes) {
    linhas.push(['Prazo para entregar as correções', <span key="p">até {dia(b.prazo_correcoes)}
      {b.correcoes_pendentes && dias != null
        ? <span className={dias < 0 ? 'texto-erro' : 'texto-faltam'}> – {dias < 0 ? 'prazo vencido' : dias === 0 ? 'vence hoje' : `faltam ${dias} dia${dias === 1 ? '' : 's'}`}</span>
        : <span className="texto-calmo"> – correções entregues</span>}</span>]);
  }
  if (b.observacao) linhas.push([b.resultado === 'REPROVADO' ? 'Justificativa da banca' : 'Observação da banca', b.observacao]);
  if (b.status === 'CANCELADA' && b.motivo_cancelamento) linhas.push(['Motivo do cancelamento', b.motivo_cancelamento]);

  const botoes = [
    agendada && avaliador && jaAconteceu && !minhaNota && <button key="n" className="botao" onClick={() => abrir('nota')}>Lançar minha nota</button>,
    agendada && presidente && jaAconteceu && <button key="r" className="botao" onClick={() => abrir('resultado')}>Registrar resultado</button>,
    agendada && presidente && !jaAconteceu && <button key="m" className="botao secundario" onClick={() => abrir('remarcar')}>Remarcar</button>,
    agendada && presidente && <button key="s" className="botao secundario" onClick={() => abrir('substituir')}>Suplente assume</button>,
    agendada && !jaAconteceu && (presidente || souAluno) && <button key="c" className="botao secundario" onClick={() => abrir('convites')}>Convidar pessoas</button>,
    agendada && !jaAconteceu && <button key="a" className="botao secundario com-icone-botao" onClick={() => executar(() => baixar(`/bancas/${b.id}/agenda.ics`, 'defesa-tcc.ics'))}><CalendarPlus className="ic" aria-hidden="true" />Adicionar à minha agenda</button>,
    agendada && (presidente || coordenacao) && <button key="x" className="botao secundario perigo-texto" onClick={() => abrir('cancelar')}>Cancelar banca</button>,
    b.status === 'REALIZADA' && <Link key="v" className="botao secundario" to={`/ata/${b.id}`}>Ver ata da defesa</Link>,
  ].filter(Boolean);

  return (
    <article className={`caixa banca banca-${b.status.toLowerCase()}`}>

      <Ficha linhas={linhas} />

      {agendada && !souAluno && (
        <div className="banca-versao">
          <span className="banca-rotulo">Versão final do TCC</span>
          {b.versao_final ? (
            <span className="banca-versao-dados">
              <span>Versão {b.versao_final.numero} · enviada em {dataHora(b.versao_final.enviadoEm)}</span>
              <button className="botao pequeno secundario com-icone-botao" onClick={() => executar(() => baixar(`/versoes/${b.versao_final!.id}/arquivo`, b.versao_final!.arquivoNome))}>
                <Download className="ic" aria-hidden="true" />Baixar PDF</button>
            </span>
          ) : <span className="texto-calmo">O aluno ainda não enviou a versão final.</span>}
        </div>
      )}

      <div className="banca-membros">
        <span className="banca-rotulo">Banca</span>
        <ul>
          {(b.membros ?? []).map((m) => (
            <li key={String(m.usuarioId)}>
              <span>{m.nome}{m.externo && m.instituicao && !m.nome.includes('(') && ` (${m.instituicao})`}</span>
              <span className="banca-papel">
                {agendada && jaAconteceu && m.papel !== 'SUPLENTE' && (m.notaRegistrada
                  ? <span className="assinou"><Check className="ic" aria-hidden="true" />Nota lançada</span>
                  : <span className="aguardando"><Clock className="ic" aria-hidden="true" />Nota pendente</span>)}
                <span className="texto-calmo">{papelNaBanca(m)}</span>
              </span>
            </li>
          ))}
        </ul>
        {agendada && jaAconteceu && <p className="ajuda">{lancadas} de {avaliadores.length} notas lançadas. As notas só ficam visíveis na ata, depois do resultado.</p>}
        {agendada && !jaAconteceu && avaliador && <p className="ajuda">As notas poderão ser lançadas depois do horário da defesa.</p>}
      </div>

      {botoes.length > 0 && <footer className="banca-rodape">{botoes}</footer>}
    </article>
  );
}

const FUSO = 'America/Manaus';
/** "Terça-feira, 10/11/2026" */
const diaSemana = (v: string) => {
  const d = new Date(v);
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: FUSO });
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${d.toLocaleDateString('pt-BR', { timeZone: FUSO })}`;
};
const horario = (v: string) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });
const notaCurta = (n: number | null) => (n == null ? '—' : nota(n).replace(/,?0+$/, '').replace(/,$/, ''));
const diasAte = (data: string) => {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
  return Math.round((Date.parse(data.slice(0, 10)) - Date.parse(hoje)) / 86400000);
};
/** "Presidente (orientadora)", "Titular", "Suplente" */
function papelNaBanca(m: MembroBanca) {
  if (m.papel === 'PRESIDENTE') return `Presidente (${/^profa\.?\s/i.test(m.nome) ? 'orientadora' : /^prof\.?\s/i.test(m.nome) ? 'orientador' : 'orientador(a)'})`;
  return m.papel === 'TITULAR' ? 'Titular' : 'Suplente';
}

function ModalNota({ banca, aoFechar, aoSalvar }: { banca: Banca; aoFechar: () => void; aoSalvar: () => void }) {
  const [valor, setValor] = useState('');
  const [parecer, setParecer] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const { executar, perguntar } = useFeedback();
  const salvar = async () => {
    const n = Number(valor.replace(',', '.'));
    if (valor.trim() === '' || Number.isNaN(n) || n < 0 || n > 10) return setErro('Informe uma nota de 0 a 10.');
    if (!(await perguntar({ titulo: 'Confirmar nota?', texto: `Sua nota será ${nota(n)}. Depois de lançada, só a coordenação pode corrigir, com justificativa.`, confirmar: 'Lançar nota' }))) return;
    const r = await executar(() => api<{ faltam: number }>('POST', `/bancas/${banca.id}/notas`, { nota: n, parecer: parecer.trim() || null }),
      (r) => r.faltam ? `Nota lançada. Faltam ${r.faltam} nota(s).` : 'Nota lançada. Todas as notas foram lançadas!');
    if (r) aoSalvar();
  };
  return (
    <Modal titulo="Lançar minha nota" subtitulo={banca.titulo} aoFechar={aoFechar} pequeno
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Lançar nota</button></>}>
      <Campo rotulo="Nota (0 a 10)" inputMode="decimal" obrigatorio value={valor} erro={erro} placeholder="Ex.: 8,5"
        onChange={(e) => { setValor(e.target.value); setErro(null); }} />
      <CampoTexto rotulo="Parecer" value={parecer} onChange={(e) => setParecer(e.target.value)} placeholder="Comentários sobre o trabalho (opcional)" />
      <p className="ajuda">Os outros membros não veem a sua nota. O aluno vê a nota final e o seu parecer.</p>
    </Modal>
  );
}

function ModalResultado({ banca, aoFechar, aoSalvar }: { banca: Banca; aoFechar: () => void; aoSalvar: () => void }) {
  const [resultado, setResultado] = useState<Resultado>('APROVADO');
  const [obs, setObs] = useState('');
  const [prazo, setPrazo] = useState('');
  const { executar, perguntar } = useFeedback();
  const precisaObs = resultado !== 'APROVADO';
  const pendentes = banca.membros.filter((m) => m.papel !== 'SUPLENTE' && !m.notaRegistrada);
  const amanha = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'America/Manaus' });
  const salvar = async () => {
    if (!(await perguntar({ titulo: 'Registrar resultado?', texto: `Resultado: ${RESULTADOS[resultado][0]}. Depois de registrado, não pode ser alterado.`, confirmar: 'Registrar' }))) return;
    const r = await executar(() => api<{ resultado: Resultado; nota_final: number }>('POST', `/bancas/${banca.id}/resultado`,
      { resultado, observacao: obs.trim() || null, prazoCorrecoes: resultado === 'APROVADO_COM_CORRECOES' ? prazo || null : null }),
    (r) => `Resultado registrado: ${RESULTADOS[r.resultado][0]}, nota final ${nota(r.nota_final)}. Agora os avaliadores assinam a ata.`);
    if (r) aoSalvar();
  };
  return (
    <Modal titulo="Registrar resultado da defesa" subtitulo={banca.titulo} aoFechar={aoFechar}
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar} disabled={pendentes.length > 0}>Registrar resultado</button></>}>
      {pendentes.length > 0
        ? <Dica tipo="alerta">Ainda faltam as notas de: {pendentes.map((m) => m.nome).join(', ')}. O resultado só pode ser registrado com todas as notas.</Dica>
        : <Dica tipo="sucesso">Todas as notas foram lançadas. A nota final é a média das notas do presidente e dos titulares. Para aprovar, a média precisa ser pelo menos <strong>{nota(banca.nota_minima)}</strong> (regra do curso).</Dica>}
      <CampoSelecao rotulo="Resultado" value={resultado} onChange={(e) => setResultado(e.target.value as Resultado)}>
        {Object.entries(RESULTADOS).map(([v, [t]]) => <option key={v} value={v}>{t}</option>)}
      </CampoSelecao>
      <CampoTexto rotulo={resultado === 'REPROVADO' ? 'Justificativa' : 'Correções pedidas pela banca'} obrigatorio={precisaObs}
        value={obs} onChange={(e) => setObs(e.target.value)} placeholder={precisaObs ? '' : 'Opcional'} />
      {resultado === 'APROVADO_COM_CORRECOES' && (
        <Campo rotulo="Prazo para entregar o TCC corrigido" type="date" min={amanha} value={prazo} onChange={(e) => setPrazo(e.target.value)}
          ajuda={`Se deixar em branco, o prazo será de ${banca.dias_correcoes} dias (padrão do curso). O orientador confere as correções e conclui o TCC.`} />
      )}
    </Modal>
  );
}

function ModalRemarcar({ banca, aoFechar, aoSalvar }: { banca: Banca; aoFechar: () => void; aoSalvar: () => void }) {
  const [quando, setQuando] = useState('');
  const [local, setLocal] = useState(banca.local_ou_link);
  const { executar, avisar } = useFeedback();
  const salvar = async () => {
    if (!quando) return avisar('Informe a nova data e hora.', 'erro');
    const r = await executar(() => api('PATCH', `/bancas/${banca.id}/remarcar`, { dataHora: paraISO(quando), localOuLink: local }), 'Banca remarcada. Todos foram avisados.');
    if (r) aoSalvar();
  };
  return (
    <Modal titulo="Remarcar defesa" subtitulo={`${banca.titulo} · hoje marcada para ${dataHora(banca.data_hora)}`} aoFechar={aoFechar} pequeno
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Remarcar</button></>}>
      <Campo rotulo="Nova data e hora" type="datetime-local" min={agoraLocal()} obrigatorio value={quando} onChange={(e) => setQuando(e.target.value)} />
      <Campo rotulo="Local ou link" obrigatorio value={local} onChange={(e) => setLocal(e.target.value)} />
    </Modal>
  );
}

function ModalSubstituir({ banca, aoFechar, aoSalvar }: { banca: Banca; aoFechar: () => void; aoSalvar: () => void }) {
  const titulares = banca.membros.filter((m) => m.papel === 'TITULAR' && !m.notaRegistrada);
  const suplentes = banca.membros.filter((m) => m.papel === 'SUPLENTE');
  const [titular, setTitular] = useState(String(titulares[0]?.usuarioId ?? ''));
  const [suplente, setSuplente] = useState(String(suplentes[0]?.usuarioId ?? ''));
  const { executar } = useFeedback();
  const salvar = async () => {
    const r = await executar(() => api('PATCH', `/bancas/${banca.id}/substituir`, { titularId: Number(titular), suplenteId: Number(suplente) }),
      'Pronto! O suplente agora é titular, e os dois foram avisados.');
    if (r) aoSalvar();
  };
  const possivel = titulares.length > 0 && suplentes.length > 0;
  return (
    <Modal titulo="Suplente assume no lugar de um titular" subtitulo={banca.titulo} aoFechar={aoFechar} pequeno
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar} disabled={!possivel}>Confirmar troca</button></>}>
      {!possivel ? <Vazio>Não há titular sem nota ou suplente disponível para a troca.</Vazio> : <>
        <p>Use quando um titular não puder participar da defesa. O titular passa a ser suplente e o suplente passa a avaliar.</p>
        <CampoSelecao rotulo="Titular que não vai participar" value={titular} onChange={(e) => setTitular(e.target.value)}>
          {titulares.map((m) => <option key={String(m.usuarioId)} value={String(m.usuarioId)}>{m.nome}</option>)}
        </CampoSelecao>
        <CampoSelecao rotulo="Suplente que assume" value={suplente} onChange={(e) => setSuplente(e.target.value)}>
          {suplentes.map((m) => <option key={String(m.usuarioId)} value={String(m.usuarioId)}>{m.nome}</option>)}
        </CampoSelecao>
      </>}
    </Modal>
  );
}

function ModalCancelar({ banca, aoFechar, aoSalvar }: { banca: Banca; aoFechar: () => void; aoSalvar: () => void }) {
  const [motivo, setMotivo] = useState('');
  const { executar } = useFeedback();
  const salvar = async () => {
    const r = await executar(() => api('PATCH', `/bancas/${banca.id}/cancelar`, { motivo }), 'Banca cancelada. Aluno e membros foram avisados.');
    if (r) aoSalvar();
  };
  return (
    <Modal titulo="Cancelar banca" subtitulo={`${banca.titulo} · ${dataHora(banca.data_hora)}`} aoFechar={aoFechar} pequeno
      rodape={<><button className="botao secundario" onClick={aoFechar}>Voltar</button><button className="botao perigo" onClick={salvar}>Cancelar banca</button></>}>
      <Dica tipo="alerta">O TCC continua “Apto à defesa” e uma nova banca pode ser cadastrada depois.</Dica>
      <CampoTexto rotulo="Motivo do cancelamento" obrigatorio value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: aluno doente no dia da defesa" />
    </Modal>
  );
}

export function ModalConvites({ banca, aoFechar }: { banca: Banca; aoFechar: () => void }) {
  const [emails, setEmails] = useState('');
  const { executar } = useFeedback();
  const lista = emails.split(/[\s,;]+/).filter(Boolean);
  const enviar = async () => {
    const r = await executar(() => api<{ enviados: number }>('POST', `/bancas/${banca.id}/convites`, { emails: lista }), (r) => `${r.enviados} convite(s) enviado(s).`);
    if (r) aoFechar();
  };
  return (
    <Modal titulo="Convidar pessoas para a defesa" subtitulo={banca.titulo} aoFechar={aoFechar}
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={enviar} disabled={!lista.length}>Enviar {lista.length || ''} convite(s)</button></>}>
      <CampoTexto rotulo="E-mails" value={emails} onChange={(e) => setEmails(e.target.value)} rows={5}
        ajuda="Um e-mail por linha (até 20). Os convidados recebem a data, o horário e o local." placeholder={'familia@email.com\ncolega@uea.edu.br'} />
    </Modal>
  );
}

// ===========================================================================
// Ata da defesa: assinatura eletrônica, ata assinada à mão (PDF) e impressão
// ===========================================================================
export function AtaDefesa() {
  const { id } = useParams();
  const eu = useUsuario();
  const c = useCarregar(() => api<Ata>('GET', `/bancas/${id}/ata`), [id]);
  const [modal, setModal] = useState<'assinar' | 'digitalizada' | { membroId: string; nome: string; nota: number | null } | null>(null);
  const { executar } = useFeedback();
  const fechar = () => setModal(null);
  const salvou = () => { setModal(null); c.recarregar(); };

  return (
    <Estado c={c}>
      {(a) => {
        const minha = a.assinaturas.find((s) => mesmoId(s.usuarioId, eu.id));
        const presidente = a.membros.some((m) => mesmoId(m.usuarioId, eu.id) && m.papel === 'PRESIDENTE');
        const coordenacao = eu.perfil === 'COORDENACAO';
        const verificacao = a.codigo_verificacao ? `${location.origin}/verificar/${a.codigo_verificacao}` : null;
        return (
          <div className="pagina">
            <div className="pagina-topo nao-imprimir">
              <div><h1>Ata da defesa</h1><p className="pagina-descricao">A ata pode ser assinada eletronicamente pelo sistema ou impressa, assinada à mão e enviada em PDF.</p></div>
              <div className="pagina-acoes">
                <button className="botao secundario" onClick={() => history.back()}>Voltar</button>
                <button className="botao secundario" onClick={() => window.print()}>Imprimir / salvar PDF</button>
              </div>
            </div>

            <Cartao className="nao-imprimir" titulo="Assinaturas"
              descricao="Cada avaliador (presidente e titulares) assina com a própria senha. A assinatura eletrônica vale como assinatura simples (Lei 14.063/2020).">
              <ul className="membros">
                {a.assinaturas.map((s) => (
                  <li key={String(s.usuarioId)}>
                    <span>{s.nome} <small>· {PAPEIS[s.papel]}</small></span>
                    {s.valida
                      ? <Selo cor="verde">Assinou em {dataHora(s.assinadoEm)}</Selo>
                      : s.assinadoEm ? <Selo cor="amarelo">Precisa assinar de novo (a ata mudou)</Selo> : <Selo cor="cinza">Aguardando assinatura</Selo>}
                  </li>
                ))}
              </ul>
              {a.assinaturaCompleta && <Dica tipo="sucesso">Ata assinada eletronicamente por todos os avaliadores.</Dica>}
              <div className="acoes">
                {minha && !minha.valida && <button className="botao" onClick={() => setModal('assinar')}><PenLine className="ic" aria-hidden="true" /> Assinar eletronicamente</button>}
                {(presidente || coordenacao) && <button className="botao secundario" onClick={() => setModal('digitalizada')}>{a.ataDigitalizada ? 'Trocar ata assinada (PDF)' : 'Enviar ata assinada à mão (PDF)'}</button>}
                {a.ataDigitalizada && <button className="botao secundario" onClick={() => executar(() => baixar(`/bancas/${a.id}/ata/digitalizada`, a.ataDigitalizada!.nome))}>Baixar ata assinada (PDF)</button>}
              </div>
              {a.ataDigitalizada && <p className="ajuda">Ata assinada à mão enviada em {dataHora(a.ataDigitalizada.enviadaEm)}.</p>}
              {verificacao && <p className="ajuda">Código de verificação: <strong>{a.codigo_verificacao}</strong>. Qualquer pessoa pode conferir em <Link to={`/verificar/${a.codigo_verificacao}`}>{verificacao}</Link></p>}
            </Cartao>

            <article className="ata">
              <header className="ata-cabecalho">
                <img src="/uea.png" alt="UEA" />
                <div>
                  <p>UNIVERSIDADE DO ESTADO DO AMAZONAS</p>
                  <p>ESCOLA SUPERIOR DE TECNOLOGIA</p>
                  <p>{a.curso_nome.toUpperCase()}</p>
                </div>
              </header>
              <h2>ATA DE DEFESA DE TRABALHO DE CONCLUSÃO DE CURSO</h2>
              <p className="ata-texto">
                Em {dataHoraLonga(a.data_hora)}, em {a.local_ou_link}, reuniu-se a banca examinadora abaixo para avaliar o Trabalho
                de Conclusão de Curso intitulado <strong>“{a.titulo}{a.subtitulo ? ': ' + a.subtitulo : ''}”</strong>, de autoria
                de <strong>{a.aluno}</strong>. Após a apresentação e a arguição, a banca {a.notasIndividuaisOcultas ? 'registrou a avaliação abaixo' : 'atribuiu as seguintes notas'}:
              </p>
              <table className="ata-tabela">
                <thead><tr><th>Membro</th><th>Função</th>{!a.notasIndividuaisOcultas && <th>Nota</th>}{coordenacao && <th className="nao-imprimir"></th>}</tr></thead>
                <tbody>{a.notas.map((n) => (
                  <tr key={n.nome}>
                    <td>{n.nome}</td><td>{PAPEIS[n.papel]}</td>
                    {!a.notasIndividuaisOcultas && <td>{nota(n.nota)}</td>}
                    {coordenacao && <td className="nao-imprimir"><button className="botao pequeno secundario" onClick={() => setModal({ membroId: String(n.membro_id), nome: n.nome, nota: n.nota })}>Corrigir</button></td>}
                  </tr>
                ))}</tbody>
              </table>
              {a.notasIndividuaisOcultas && <p className="ajuda nao-imprimir">As notas de cada membro ficam com a banca e a coordenação. Você vê a nota final e os pareceres.</p>}
              <p className="ata-texto">
                Nota final (média): <strong>{nota(a.nota_final)}</strong>. Resultado: <strong>{RESULTADOS[a.resultado][0].toUpperCase()}</strong>.
              </p>
              {a.observacao && <p className="ata-texto"><strong>{a.resultado === 'REPROVADO' ? 'Justificativa' : 'Correções exigidas'}:</strong> {a.observacao}</p>}
              {a.prazo_correcoes && <p className="ata-texto"><strong>Prazo para a entrega do texto corrigido:</strong> {dia(a.prazo_correcoes)}.</p>}
              {a.notas.some((n) => n.parecer) && (
                <div className="ata-texto"><strong>Pareceres:</strong>
                  <ul>{a.notas.filter((n) => n.parecer).map((n) => <li key={n.nome}><em>{n.nome}:</em> {n.parecer}</li>)}</ul>
                </div>
              )}
              <p className="ata-texto">Nada mais havendo a tratar, lavrou-se a presente ata, que vai assinada pelos membros da banca.</p>
              <div className="ata-assinaturas">
                {a.assinaturas.map((s) => (
                  <div key={String(s.usuarioId)} className={s.valida ? 'assinada' : ''}>
                    {s.valida && <span className="selo-assinatura">Assinado eletronicamente em {dataHora(s.assinadoEm)}</span>}
                    {s.nome}<br /><small>{PAPEIS[s.papel]}</small>
                  </div>
                ))}
              </div>
              {a.codigo_verificacao && (
                <p className="ata-verificacao">Documento verificável em {location.origin}/verificar com o código <strong>{a.codigo_verificacao}</strong>.</p>
              )}
            </article>

            {modal === 'assinar' && <ModalAssinar ata={a} aoFechar={fechar} aoSalvar={salvou} />}
            {modal === 'digitalizada' && <ModalAtaDigitalizada ata={a} aoFechar={fechar} aoSalvar={salvou} />}
            {modal && typeof modal === 'object' && <ModalCorrigirNota ata={a} membro={modal} aoFechar={fechar} aoSalvar={salvou} />}
          </div>
        );
      }}
    </Estado>
  );
}

function ModalAssinar({ ata, aoFechar, aoSalvar }: { ata: Ata; aoFechar: () => void; aoSalvar: () => void }) {
  const [senha, setSenha] = useState('');
  const [concordo, setConcordo] = useState(false);
  const { executar } = useFeedback();
  const assinar = async () => {
    const r = await executar(() => api<{ assinaturaCompleta: boolean }>('POST', `/bancas/${ata.id}/ata/assinar`, { senha }),
      (r) => r.assinaturaCompleta ? 'Ata assinada! Todos os avaliadores já assinaram.' : 'Ata assinada! Faltam outros avaliadores.');
    if (r) aoSalvar();
  };
  return (
    <Modal titulo="Assinar a ata eletronicamente" subtitulo={ata.titulo} aoFechar={aoFechar} pequeno
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={assinar} disabled={!concordo || !senha}>Assinar</button></>}>
      <label className="caixa-marcar">
        <input type="checkbox" checked={concordo} onChange={(e) => setConcordo(e.target.checked)} />
        Li a ata e confirmo que as informações estão corretas.
      </label>
      <Campo rotulo="Sua senha do SAG-TCC" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)}
        ajuda="A senha confirma que é você quem está assinando. Ficam registrados o seu nome, a data e a hora." />
    </Modal>
  );
}

function ModalAtaDigitalizada({ ata, aoFechar, aoSalvar }: { ata: Ata; aoFechar: () => void; aoSalvar: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { executar } = useFeedback();
  const enviar = async () => {
    if (!arquivo) return;
    setEnviando(true);
    const r = await executar(async () => api('POST', `/bancas/${ata.id}/ata/digitalizada`, { arquivoNome: arquivo.name, arquivoBase64: await lerBase64(arquivo) }),
      'Ata assinada enviada. O aluno já pode baixar.');
    setEnviando(false);
    if (r) aoSalvar();
  };
  return (
    <Modal titulo="Enviar ata assinada à mão" subtitulo={ata.titulo} aoFechar={aoFechar}
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={enviar} disabled={!arquivo || enviando}>{enviando ? 'Enviando...' : 'Enviar PDF'}</button></>}>
      <ol className="passos-simples">
        <li>Clique em <strong>Imprimir / salvar PDF</strong> e imprima a ata.</li>
        <li>Os membros da banca assinam à mão.</li>
        <li>Escaneie (ou fotografe com um app de digitalizar) e salve em <strong>PDF</strong>.</li>
        <li>Envie o arquivo aqui.</li>
      </ol>
      <EscolherPdf arquivo={arquivo} aoEscolher={setArquivo} rotulo="Ata assinada (PDF)" />
    </Modal>
  );
}

function ModalCorrigirNota({ ata, membro, aoFechar, aoSalvar }: { ata: Ata; membro: { membroId: string; nome: string; nota: number | null }; aoFechar: () => void; aoSalvar: () => void }) {
  const [valor, setValor] = useState(membro.nota == null ? '' : String(membro.nota).replace('.', ','));
  const [justificativa, setJustificativa] = useState('');
  const { executar, perguntar } = useFeedback();
  const salvar = async () => {
    const n = Number(valor.replace(',', '.'));
    if (valor.trim() === '' || Number.isNaN(n) || n < 0 || n > 10) return;
    if (!(await perguntar({ titulo: 'Corrigir a nota?', texto: 'A média será recalculada e os avaliadores precisarão assinar a ata de novo. A correção fica registrada na auditoria.', confirmar: 'Corrigir' }))) return;
    const r = await executar(() => api('PATCH', `/bancas/${ata.id}/notas/${membro.membroId}`, { nota: n, justificativa }), 'Nota corrigida. Os avaliadores foram avisados para assinar de novo.');
    if (r) aoSalvar();
  };
  return (
    <Modal titulo="Corrigir nota (coordenação)" subtitulo={`${membro.nome} · ${ata.titulo}`} aoFechar={aoFechar} pequeno
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Corrigir nota</button></>}>
      <Campo rotulo="Nota correta (0 a 10)" inputMode="decimal" obrigatorio value={valor} onChange={(e) => setValor(e.target.value)} />
      <CampoTexto rotulo="Justificativa" obrigatorio value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Ex.: o membro digitou a nota errada e pediu a correção por e-mail" />
    </Modal>
  );
}
