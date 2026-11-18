// Janelas usadas por mais de um perfil: histórico do TCC e alterar situação.
import { useState } from 'react';
import { api } from '../../api';
import { Modal } from '../../components/Modal';
import { CampoSelecao, CampoTexto, Dica, Estado, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Evento, Id, Situacao } from '../../types';
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
