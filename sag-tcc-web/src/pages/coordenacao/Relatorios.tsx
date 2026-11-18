import { api } from '../../api';
import { Cartao, Dica, Estado, Pagina, Tabela, Vazio } from '../../components/ui';
import { useCarregar } from '../../hooks';
import type { Situacao } from '../../types';
import { nota, SITUACOES } from '../../util';

interface Relatorio {
  porSituacao: { situacao: Situacao; total: number }[];
  porOrientador: { orientador: string; em_andamento: number; aprovados: number; atrasados: number; total: number }[];
  defesas: { realizadas: number; aprovados: number; aprovados_com_correcoes: number; reprovados: number; media_notas: number | null };
  porSemestre: { semestre: string; defesas: number; aprovados: number; media_notas: number | null }[];
  atrasados: number;
}

/** Baixa uma tabela como planilha CSV (abre no Excel). Cada valor fica na sua própria coluna. */
function baixarCsv(nome: string, cabecalho: string[], linhas: (string | number | null)[][]) {
  const celula = (v: string | number | null) => {
    const t = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function Relatorios() {
  const c = useCarregar(() => api<Relatorio>('GET', '/relatorios'), []);
  return (
    <Pagina titulo="Relatórios do curso" descricao="Números do seu curso. As notas aparecem só como média: nenhuma nota é ligada ao nome de um aluno.">
      <Estado c={c}>
        {(r) => {
          const total = r.porSituacao.reduce((s, x) => s + x.total, 0);
          const taxa = r.defesas.realizadas ? Math.round(((r.defesas.aprovados + r.defesas.aprovados_com_correcoes) / r.defesas.realizadas) * 100) : null;
          return (
            <>
              <div className="numeros">
                <div className="numero"><span className="numero-valor">{total}</span><span className="numero-rotulo">TCCs cadastrados</span></div>
                <div className="numero"><span className="numero-valor">{r.defesas.realizadas}</span><span className="numero-rotulo">defesas realizadas</span></div>
                <div className="numero"><span className="numero-valor">{taxa == null ? '—' : `${taxa}%`}</span><span className="numero-rotulo">de aprovação nas defesas</span></div>
                <div className="numero destaque"><span className="numero-valor">{r.atrasados}</span><span className="numero-rotulo">TCCs atrasados agora</span></div>
              </div>

              <Cartao titulo="Orientadores" descricao="Quantos TCCs cada professor orienta. Ajuda a distribuir melhor as orientações."
                acoes={<button className="botao pequeno secundario" onClick={() => baixarCsv('orientadores.csv', ['Orientador', 'Em andamento', 'Aprovados', 'Atrasados', 'Total'],
                  r.porOrientador.map((o) => [o.orientador, o.em_andamento, o.aprovados, o.atrasados, o.total]))}>Baixar planilha</button>}>
                <Tabela linhas={r.porOrientador} chave={(o) => o.orientador} vazio="Nenhum TCC com orientador ainda."
                  colunas={[
                    { titulo: 'Orientador(a)', valor: (o) => <strong>{o.orientador}</strong> },
                    { titulo: 'Em andamento', valor: (o) => o.em_andamento },
                    { titulo: 'Aprovados', valor: (o) => o.aprovados },
                    { titulo: 'Atrasados', valor: (o) => o.atrasados },
                    { titulo: 'Total', valor: (o) => o.total },
                  ]} />
              </Cartao>

              <div className="painel">
                <Cartao titulo="TCCs por situação"
                  acoes={<button className="botao pequeno secundario" onClick={() => baixarCsv('tccs-por-situacao.csv', ['Situação', 'Quantidade'],
                    r.porSituacao.map((x) => [SITUACOES[x.situacao][0], x.total]))}>Baixar planilha</button>}>
                  {r.porSituacao.length === 0 ? <Vazio>Nenhum TCC ainda.</Vazio> : (
                    <ul className="barras">
                      {r.porSituacao.map((x) => (
                        <li key={x.situacao}><span>{SITUACOES[x.situacao][0]}</span><span className="barra"><span style={{ width: `${(x.total / Math.max(1, ...r.porSituacao.map((y) => y.total))) * 100}%` }} /></span><strong>{x.total}</strong></li>
                      ))}
                    </ul>
                  )}
                </Cartao>
                <Cartao titulo="Resultados das defesas">
                  <dl className="infos">
                    <div className="info"><dt>Aprovados</dt><dd>{r.defesas.aprovados}</dd></div>
                    <div className="info"><dt>Aprovados com correções</dt><dd>{r.defesas.aprovados_com_correcoes}</dd></div>
                    <div className="info"><dt>Reprovados</dt><dd>{r.defesas.reprovados}</dd></div>
                    <div className="info"><dt>Média geral das notas</dt><dd>{nota(r.defesas.media_notas)}</dd></div>
                  </dl>
                </Cartao>
              </div>

              <Cartao titulo="Defesas por semestre"
                acoes={<button className="botao pequeno secundario" onClick={() => baixarCsv('defesas-por-semestre.csv', ['Semestre', 'Defesas', 'Aprovados', 'Média das notas'],
                  r.porSemestre.map((s) => [s.semestre, s.defesas, s.aprovados, s.media_notas]))}>Baixar planilha</button>}>
                <Tabela linhas={r.porSemestre} chave={(s) => s.semestre} vazio="Nenhuma defesa realizada ainda."
                  colunas={[
                    { titulo: 'Semestre', valor: (s) => <strong>{s.semestre}</strong> },
                    { titulo: 'Defesas', valor: (s) => s.defesas },
                    { titulo: 'Aprovados', valor: (s) => s.aprovados },
                    { titulo: 'Média das notas', valor: (s) => nota(s.media_notas) },
                  ]} />
              </Cartao>
              <Dica>As planilhas abrem no Excel e no Google Planilhas, com cada informação em uma coluna.</Dica>
            </>
          );
        }}
      </Estado>
    </Pagina>
  );
}
