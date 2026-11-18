// Janelas usadas por mais de um perfil: histórico do TCC e alterar situação.
import { useState } from 'react';
import { api } from '../../api';
import { Modal } from '../../components/Modal';
import { CampoSelecao, CampoTexto, Dica, Estado, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Evento, Id, Situacao, Visibilidade } from '../../types';
import { dataHora, SITUACOES, TRANSICOES } from '../../util';

/** Linha do tempo do TCC (tudo o que aconteceu, com data e autor). */
export function LinhaDoTempo({ tccId }: { tccId: Id }) {
  const c = useCarregar(() => api<Evento[]>('GET', `/tccs/${tccId}/historico`), [tccId]);
  return (
    <Estado c={c}>
      {(eventos) => eventos.length === 0 ? <Vazio>Nenhum registro ainda.</Vazio> : (
        <ol className="linha-tempo">
          {eventos.map((e, i) => (
            <li key={i}>
              <strong>{e.descricao || e.tipo}</strong>
              <small>{dataHora(e.criado_em)} · {e.autor || 'Sistema'}</small>
            </li>
          ))}
        </ol>
      )}
    </Estado>
  );
}

export function ModalHistorico({ tccId, titulo, aoFechar }: { tccId: Id; titulo: string; aoFechar: () => void }) {
  return (
    <Modal titulo="Histórico do TCC" subtitulo={titulo} aoFechar={aoFechar}>
      <LinhaDoTempo tccId={tccId} />
    </Modal>
  );
}

/** Alterar a situação do TCC (orientador ou coordenação). */
export function ModalSituacao({ tcc, aoFechar, aoSalvar }: {
  tcc: { id: Id; titulo: string; aluno: string; situacao: Situacao }; aoFechar: () => void; aoSalvar: () => void;
}) {
  const opcoes = TRANSICOES[tcc.situacao] ?? [];
  const [nova, setNova] = useState<Situacao | ''>(opcoes[0] ?? '');
  const [justificativa, setJustificativa] = useState('');
  const { executar, perguntar } = useFeedback();
  const exigeJustificativa = nova !== 'APTO_DEFESA';
  const encerra = nova === 'CANCELADO' || nova === 'NAO_APRESENTADO';

  const salvar = async () => {
    if (!nova) return;
    if (encerra && !(await perguntar({ titulo: 'Encerrar o TCC?', texto: `Marcar como "${SITUACOES[nova][0]}" encerra o TCC e não pode ser desfeito.`, confirmar: 'Sim, encerrar', perigo: true }))) return;
    const r = await executar(() => api('PATCH', `/tccs/${tcc.id}/situacao`, { situacao: nova, justificativa: justificativa.trim() || null }),
      'Situação alterada. O aluno foi avisado.');
    if (r) aoSalvar();
  };

  return (
    <Modal titulo="Alterar situação do TCC" subtitulo={`${tcc.titulo} · ${tcc.aluno}`} aoFechar={aoFechar}
      rodape={opcoes.length ? <>
        <button className="botao secundario" onClick={aoFechar}>Cancelar</button>
        <button className={`botao ${encerra ? 'perigo' : ''}`} onClick={salvar}>Salvar</button>
      </> : undefined}>
      {opcoes.length === 0 ? <Vazio>Esta situação é final e não pode mais ser alterada.</Vazio> : <>
        <p>Situação atual: <strong>{SITUACOES[tcc.situacao][0]}</strong></p>
        <CampoSelecao rotulo="Nova situação" value={nova} onChange={(e) => setNova(e.target.value as Situacao)}>
          {opcoes.map((s) => <option key={s} value={s}>{SITUACOES[s][0]}</option>)}
        </CampoSelecao>
        <CampoTexto rotulo="Justificativa" obrigatorio={exigeJustificativa} value={justificativa} onChange={(e) => setJustificativa(e.target.value)}
          placeholder={exigeJustificativa ? 'Explique o motivo da mudança' : 'Opcional'} />
        {nova === 'APTO_DEFESA' && <Dica>Com o TCC “Apto à defesa”, você já pode cadastrar a banca.</Dica>}
        {tcc.situacao === 'APTO_DEFESA' && <Dica tipo="alerta">Se houver banca agendada, ela será cancelada e os membros serão avisados.</Dica>}
        <p className="ajuda">“Aprovado” e “Reprovado” só podem ser definidos pelo resultado da defesa.</p>
      </>}
    </Modal>
  );
}

export const NOME_VISIBILIDADE: Record<Visibilidade, string> = { TEXTO_COMPLETO: 'Texto completo', SOMENTE_METADADOS: 'Somente os dados do trabalho' };

/** UC27 – Visibilidade no acervo público (aluno dono ou orientador). */
export function ModalVisibilidade({ tcc, aoFechar, aoSalvar }: {
  tcc: { id: Id; titulo: string; visibilidade?: Visibilidade; situacao: Situacao }; aoFechar: () => void; aoSalvar: (v: Visibilidade) => void;
}) {
  const [escolha, setEscolha] = useState<Visibilidade>(tcc.visibilidade ?? 'SOMENTE_METADADOS');
  const [declaracao, setDeclaracao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { executar } = useFeedback();
  const aprovado = tcc.situacao === 'APROVADO' || tcc.situacao === 'APROVADO_PUBLICACAO';

  const salvar = async () => {
    if (escolha === 'TEXTO_COMPLETO' && !declaracao) { setErro('Marque a declaração para liberar o texto completo'); return; }
    const r = await executar(() => api('PUT', `/tccs/${tcc.id}/visibilidade`, { visibilidade: escolha, declaracao }), 'Visibilidade atualizada');
    if (r) aoSalvar(escolha);
  };

  const opcao = (valor: Visibilidade, titulo: string, texto: string) => (
    <label className={escolha === valor ? 'marcado' : ''}>
      <input type="radio" name="visibilidade" checked={escolha === valor} onChange={() => { setEscolha(valor); setErro(null); }} />
      <span><strong>{titulo}</strong><small>{texto}</small></span>
    </label>
  );

  return (
    <Modal titulo="Visibilidade no acervo público" subtitulo={tcc.titulo} aoFechar={aoFechar}
      rodape={<>
        <button className="botao secundario" onClick={aoFechar}>Cancelar</button>
        <button className="botao" onClick={salvar}>Salvar</button>
      </>}>
      <p>Depois de aprovado, o TCC aparece no <strong>acervo público</strong>, que qualquer pessoa pode pesquisar. Escolha o que vai aparecer:</p>
      <fieldset className="opcoes-cartao opcoes-lista">
        <legend className="visualmente-oculto">Como o TCC aparece no acervo</legend>
        {opcao('SOMENTE_METADADOS', 'Somente os dados do trabalho', 'Título, resumo, autor, orientador, área e ano. O PDF não fica disponível.')}
        {opcao('TEXTO_COMPLETO', 'Texto completo', 'Os dados do trabalho e o PDF da entrega definitiva, para qualquer pessoa baixar.')}
      </fieldset>
      {escolha === 'TEXTO_COMPLETO' && (
        <label className="caixa-marcar declaracao-autoria">
          <input type="checkbox" checked={declaracao} onChange={(e) => { setDeclaracao(e.target.checked); setErro(null); }} />
          <span>Declaro que o trabalho não contém dados sigilosos, dados pessoais de outras pessoas nem conteúdo protegido por acordo.</span>
        </label>
      )}
      {erro && <p className="erro-campo" role="alert">{erro}</p>}
      <p className="ajuda">{aprovado ? 'A mudança vale na hora no acervo.' : 'A escolha fica guardada e passa a valer quando o TCC for aprovado.'} A outra parte (aluno ou orientador) é avisada da mudança.</p>
    </Modal>
  );
}
