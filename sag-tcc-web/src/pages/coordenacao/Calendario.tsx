import { CalendarDays } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { Campo, Cartao, Dica, Estado, Pagina, Selo, Vazio } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Calendario as TCalendario, Etapa } from '../../types';
import { dia, ETAPAS, semestreAtual } from '../../util';

type Datas = Record<Etapa, { dataInicio: string; dataLimite: string }>;
const vazias = () => Object.fromEntries(ETAPAS.map(([e]) => [e, { dataInicio: '', dataLimite: '' }])) as Datas;
const proximo = (s: string) => (s.endsWith('.1') ? s.replace('.1', '.2') : `${Number(s.slice(0, 4)) + 1}.1`);

export function Calendario() {
  const c = useCarregar(() => api<TCalendario[]>('GET', '/calendarios'), []);
  const [form, setForm] = useState<{ semestre: string; datas: Datas; editando: boolean } | null>(null);
  const { executar } = useFeedback();
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Manaus' });

  const novo = (cals: TCalendario[]) => {
    const atual = semestreAtual();
    setForm({ semestre: cals.some((x) => x.semestre === atual) ? proximo(atual) : atual, datas: vazias(), editando: false });
  };
  const alterar = (cal: TCalendario) => {
    const datas = vazias();
    for (const e of cal.etapas) datas[e.etapa] = { dataInicio: e.dataInicio.slice(0, 10), dataLimite: e.dataLimite.slice(0, 10) };
    setForm({ semestre: cal.semestre, datas, editando: true });
  };

  const salvar = async () => {
    if (!form) return;
    const etapas = ETAPAS.map(([e]) => ({ etapa: e, ...form.datas[e] }));
    const r = await executar(() => form.editando
      ? api('PUT', `/calendarios/${form.semestre}`, { etapas })
      : api('POST', '/calendarios', { semestre: form.semestre, etapas }),
    form.editando ? 'Calendário alterado. Alunos e orientadores foram avisados.' : 'Calendário cadastrado. Alunos e orientadores foram avisados.');
    if (r) { setForm(null); c.recarregar(); }
  };

  const verificar = () => executar(() => api<{ alertas: number; novosAtrasos: number; tccsAtrasados: number }>('POST', '/prazos/verificar'),
    (r) => `Prazos conferidos: ${r.alertas} aviso(s) enviado(s), ${r.novosAtrasos} novo(s) atraso(s), ${r.tccsAtrasados} TCC(s) atrasado(s) no total.`);

  return (
    <Pagina titulo="Calendário do curso" descricao="As datas-limite valem para todos os TCCs do curso. Etapas que já terminaram não podem ser alteradas."
      acoes={<button className="botao" onClick={() => novo(c.dados ?? [])}>+ Novo semestre</button>}>
      {form && (
        <Cartao titulo={form.editando ? `Alterar calendário ${form.semestre}` : 'Novo calendário'}>
          {!form.editando && <Campo rotulo="Semestre" value={form.semestre} placeholder="2026.2" onChange={(e) => setForm({ ...form, semestre: e.target.value })} ajuda="Formato: ano.semestre, por exemplo 2026.2" />}
          <div className="tabela-caixa">
            <table className="tabela tabela-datas">
              <thead><tr><th>Etapa</th><th>Início</th><th>Data-limite</th></tr></thead>
              <tbody>
                {ETAPAS.map(([e, nome]) => {
                  const bloqueada = form.editando && !!form.datas[e].dataLimite && form.datas[e].dataLimite < hoje;
                  const muda = (k: 'dataInicio' | 'dataLimite') => (ev: { target: { value: string } }) =>
                    setForm({ ...form, datas: { ...form.datas, [e]: { ...form.datas[e], [k]: ev.target.value } } });
                  return (
                    <tr key={e}>
                      <td data-rotulo="Etapa"><strong>{nome}</strong>{bloqueada && <small className="bloco">já terminou</small>}</td>
                      <td data-rotulo="Início"><input type="date" aria-label={`Início de ${nome}`} value={form.datas[e].dataInicio} disabled={bloqueada} onChange={muda('dataInicio')} /></td>
                      <td data-rotulo="Data-limite"><input type="date" aria-label={`Data-limite de ${nome}`} value={form.datas[e].dataLimite} disabled={bloqueada} onChange={muda('dataLimite')} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="ajuda">As etapas precisam estar em ordem: Proposta → Qualificação → Versão final → Defesa → Entrega definitiva.</p>
          <div className="acoes">
            <button className="botao secundario" onClick={() => setForm(null)}>Cancelar</button>
            <button className="botao" onClick={salvar}>{form.editando ? 'Salvar alterações' : 'Cadastrar calendário'}</button>
          </div>
        </Cartao>
      )}

      <Estado c={c}>
        {(cals) => cals.length === 0 ? <Vazio icone={CalendarDays}>Nenhum calendário cadastrado. Sem calendário, não é possível marcar bancas.</Vazio> : (
          <div className="grade-cartoes">
            {cals.map((cal) => (
              <Cartao key={cal.semestre} titulo={`Semestre ${cal.semestre}`}
                acoes={<span className="selos">{cal.semestre === semestreAtual() && <Selo cor="verde">Atual</Selo>}<button className="botao pequeno secundario" onClick={() => alterar(cal)}>Alterar</button></span>}>
                <ul className="lista-etapas">
                  {cal.etapas.map((e) => {
                    const atual = e.dataInicio.slice(0, 10) <= hoje && hoje <= e.dataLimite.slice(0, 10);
                    return (
                      <li key={e.etapa} className={atual ? 'atual' : ''}>
                        <span>{ETAPAS.find(([x]) => x === e.etapa)?.[1]}</span>
                        <span>{dia(e.dataInicio)} – {dia(e.dataLimite)}</span>
                      </li>
                    );
                  })}
                </ul>
              </Cartao>
            ))}
          </div>
        )}
      </Estado>

      <Cartao titulo="Avisos de prazo">
        <Dica>O sistema confere os prazos sozinho a cada hora: avisa aluno e orientador 7 dias e 1 dia antes de cada data-limite e marca como atrasado quem não entregou no prazo.</Dica>
        <div className="acoes"><button className="botao secundario" onClick={verificar}>Conferir prazos agora</button></div>
      </Cartao>
    </Pagina>
  );
}
