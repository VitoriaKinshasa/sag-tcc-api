import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useUsuario } from '../../auth';
import { Campo, Cartao, Dica, Estado, Pagina, Selo, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { talvez, useCarregar } from '../../hooks';
import type { Calendario, Id, Orientando, PapelBanca } from '../../types';
import { agoraLocal, dia, mesmoId, paraISO, semestreAtual } from '../../util';

interface Disponivel { id: Id; nome: string; externo: boolean; instituicao: string | null }

/** Cadastrar a banca de um orientando que está "Apto à defesa". */
export function NovaBanca() {
  const { tccId } = useParams();
  const eu = useUsuario();
  const navegar = useNavigate();
  const { executar, avisar } = useFeedback();
  // O professor orienta alunos de vários cursos: o calendário usado é o do curso do aluno
  const c = useCarregar(async () => {
    const [orientandos, disponiveis] = await Promise.all([
      api<Orientando[]>('GET', '/orientacao/orientandos'),
      api<Disponivel[]>('GET', '/bancas/membros-disponiveis'),
    ]);
    const t = orientandos.find((o) => mesmoId(o.id, tccId));
    const calendarios = t ? await talvez(api<Calendario[]>('GET', `/calendarios?cursoId=${t.curso_id}`)) : null;
    return [orientandos, disponiveis, calendarios] as const;
  }, []);
  const [quando, setQuando] = useState('');
  const [local, setLocal] = useState('');
  const [papeis, setPapeis] = useState<Record<string, PapelBanca | ''>>({});
  const [busca, setBusca] = useState('');

  return (
    <Pagina titulo="Cadastrar banca de defesa">
      <Estado c={c}>
        {([orientandos, disponiveis, calendarios]) => {
          const t = orientandos.find((o) => mesmoId(o.id, tccId));
          if (!t) return <Vazio>TCC não encontrado entre os seus orientandos.</Vazio>;
          if (t.situacao !== 'APTO_DEFESA') return <Vazio>O TCC precisa estar “Apto à defesa” para ter banca.</Vazio>;

          const cal = (calendarios ?? []).find((x) => x.semestre === semestreAtual()) ?? calendarios?.[0];
          const defesa = cal?.etapas.find((e) => e.etapa === 'DEFESA');
          const candidatos = disponiveis.filter((m) => !mesmoId(m.id, eu.id) && m.nome.toLowerCase().includes(busca.toLowerCase()));
          const titulares = Object.values(papeis).filter((p) => p === 'TITULAR').length;
          const suplentes = Object.values(papeis).filter((p) => p === 'SUPLENTE').length;
          const pronto = titulares >= 2 && suplentes >= 1;

          const salvar = async () => {
            if (!quando) return avisar('Informe a data e a hora da defesa.', 'erro');
            const membros = Object.entries(papeis).filter(([, p]) => p).map(([id, papel]) => ({ usuarioId: Number(id), papel }));
            const r = await executar(() => api('POST', '/bancas', { tccId: Number(t.id), dataHora: paraISO(quando), localOuLink: local, membros }),
              'Banca cadastrada! Membros, aluno e coorientador foram avisados.');
            if (r) navegar('/bancas');
          };

          return (
            <>
              <Cartao titulo={t.titulo} descricao={`${t.aluno} · ${t.curso}`}>
                {defesa
                  ? <Dica>Período de defesas ({cal!.semestre}): de <strong>{dia(defesa.dataInicio)}</strong> a <strong>{dia(defesa.dataLimite)}</strong>. A data da banca precisa estar dentro desse período.</Dica>
                  : <Dica tipo="alerta">A coordenação ainda não cadastrou o calendário deste semestre. Sem ele, a banca não pode ser marcada.</Dica>}
                <div className="grade-2">
                  <Campo rotulo="Data e hora" type="datetime-local" obrigatorio min={agoraLocal()} value={quando} onChange={(e) => setQuando(e.target.value)} />
                  <Campo rotulo="Local ou link" obrigatorio value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Auditório da EST ou link do Meet" />
                </div>
              </Cartao>

              <Cartao titulo="Membros da banca" descricao="Você é o presidente. Escolha pelo menos 2 titulares e 1 suplente. O suplente substitui um titular que não puder comparecer.">
                <div className="contador-banca" aria-live="polite">
                  <Selo cor="verde">Presidente: você</Selo>
                  <Selo cor={titulares >= 2 ? 'verde' : 'amarelo'}>Titulares: {titulares} de 2+</Selo>
                  <Selo cor={suplentes >= 1 ? 'verde' : 'amarelo'}>Suplentes: {suplentes} de 1+</Selo>
                </div>
                <Campo rotulo="Buscar professor" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite um nome" />
                <ul className="escolha-membros">
                  {candidatos.map((m) => {
                    const id = String(m.id);
                    const papel = papeis[id] ?? '';
                    return (
                      <li key={id} className={papel ? 'escolhido' : ''}>
                        <span>{m.nome}{m.externo && <small> · externo ({m.instituicao || 'outra instituição'})</small>}</span>
                        <div className="segmentado" role="radiogroup" aria-label={`Papel de ${m.nome}`}>
                          {([['', 'Não participa'], ['TITULAR', 'Titular'], ['SUPLENTE', 'Suplente']] as const).map(([v, rotulo]) => (
                            <button key={v} type="button" role="radio" aria-checked={papel === v}
                              onClick={() => setPapeis({ ...papeis, [id]: v })}>{rotulo}</button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Cartao>

              <div className="acoes fim">
                <button className="botao secundario" onClick={() => navegar(-1)}>Cancelar</button>
                <button className="botao" onClick={salvar} disabled={!pronto}>Cadastrar banca</button>
              </div>
            </>
          );
        }}
      </Estado>
    </Pagina>
  );
}
