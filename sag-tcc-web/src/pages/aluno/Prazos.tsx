import { CalendarDays, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { Secao } from '../../components/blocos';
import { Estado, Pagina, Selo, Vazio } from '../../components/ui';
import { useCarregar } from '../../hooks';
import type { PrazoEtapa, Prazos as TPrazos, Tcc } from '../../types';
import { dia, NOME_ETAPA } from '../../util';
import { buscarMeuTcc } from './MeuTcc';

const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const faltam = (dias: number) => (dias < 0 ? 'prazo vencido' : dias === 0 ? 'vence hoje' : `faltam ${dias} dia${dias === 1 ? '' : 's'}`);
/** "02/03 a 20/03/2026" */
const periodo = (inicio: string, fim: string) => `${dia(inicio).slice(0, 5)} a ${dia(fim)}`;

export function SituacaoPrazo({ e }: { e: PrazoEtapa }) {
  if (!e.exigeEntrega) return <Selo cor="cinza">Sem entrega de arquivo</Selo>;
  if (e.situacao === 'ENTREGUE') return <Selo cor="verde">Entregue</Selo>;
  if (e.situacao === 'ATRASADA') return <Selo cor="vermelho">Atrasada</Selo>;
  if (e.situacao === 'PENDENTE') {
    if (e.dias === null) return <Selo cor="amarelo">Pendente</Selo>;
    if (e.dias === 0) return <Selo cor="vermelho">Vence hoje</Selo>;
    return <Selo cor="amarelo">Faltam {e.dias} dia{e.dias === 1 ? '' : 's'}</Selo>;
  }
  return <Selo cor="cinza">—</Selo>;
}

const DEPOIS_DA_DEFESA = ['APROVADO', 'APROVADO_PUBLICACAO', 'REPROVADO', 'NAO_APRESENTADO'];

/** Situação de cada etapa. Quando o calendário não cobra entrega do aluno agora, deduz pela situação do TCC. */
function SeloEtapa({ e, tcc }: { e: PrazoEtapa; tcc: Tcc }) {
  if (e.exigeEntrega) return <SituacaoPrazo e={e} />;
  const defendido = DEPOIS_DA_DEFESA.includes(tcc.situacao);
  const passouDaEscrita = defendido || tcc.situacao === 'APTO_DEFESA';
  switch (e.etapa) {
    case 'PROPOSTA': return <Selo cor="verde">Entregue</Selo>;
    case 'QUALIFICACAO': case 'VERSAO_FINAL': return passouDaEscrita ? <Selo cor="verde">Entregue</Selo> : <Selo cor="cinza">Ainda não</Selo>;
    case 'DEFESA': return defendido ? <Selo cor="verde">Realizada</Selo> : <Selo cor="cinza">Sem entrega de arquivo</Selo>;
    case 'ENTREGA_DEFINITIVA': return tcc.concluido_em ? <Selo cor="verde">Entregue</Selo> : <Selo cor="cinza">Depois da defesa</Selo>;
  }
}

interface Linha { chave: string; nome: string; data: string; texto: string; selo: React.ReactNode; passou: boolean; atual: boolean }

export function Prazos() {
  const c = useCarregar(async () => {
    const tcc = await buscarMeuTcc();
    if (!tcc) return null;
    return { tcc, ...(await api<TPrazos>('GET', `/tccs/${tcc.id}/prazos`)) };
  }, []);

  return (
    <Estado c={c}>
      {(p) => {
        const descricao = `Datas do calendário do seu curso${p?.semestre ? ` – Semestre ${p.semestre}` : ''}. Você recebe um aviso 7 dias e 1 dia antes de cada data-limite.`;
        if (!p) return <Pagina titulo="Prazos" descricao={descricao}><Vazio>Você ainda não tem TCC. <Link to="/meu-tcc">Faça a sua proposta</Link>.</Vazio></Pagina>;
        if (!p.etapas.length && !p.correcoes) {
          return <Pagina titulo="Prazos" descricao={descricao}><Vazio icone={CalendarDays}>A coordenação ainda não cadastrou o calendário deste semestre.</Vazio></Pagina>;
        }
        const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Manaus' }); // AAAA-MM-DD

        // Com correções pedidas pela banca, a entrega definitiva usa o prazo das correções
        const etapas = p.correcoes ? p.etapas.filter((e) => e.etapa !== 'ENTREGA_DEFINITIVA') : p.etapas;
        const linhas: Linha[] = etapas.map((e) => ({
          chave: e.etapa, nome: NOME_ETAPA[e.etapa], data: e.dataLimite, texto: periodo(e.dataInicio, e.dataLimite),
          selo: <SeloEtapa e={e} tcc={p.tcc} />, passou: e.dataLimite < hoje,
          atual: !p.correcoes && e.dataInicio <= hoje && hoje <= e.dataLimite,
        }));
        if (p.correcoes) {
          const d = p.correcoes.dias;
          linhas.push({
            chave: 'CORRECOES', nome: 'Entrega definitiva', data: p.correcoes.prazo, texto: `até ${dia(p.correcoes.prazo)}`,
            selo: <Selo cor={d < 0 || d === 0 ? 'vermelho' : 'amarelo'}>{d < 0 ? 'Prazo vencido' : d === 0 ? 'Vence hoje' : `Faltam ${d} dia${d === 1 ? '' : 's'}`}</Selo>,
            passou: false, atual: true,
          });
        }

        // Próximo prazo: só aparece se existe alguma entrega pendente
        const pendente = p.etapas.find((e) => e.exigeEntrega && (e.situacao === 'PENDENTE' || e.situacao === 'ATRASADA') && !(p.correcoes && e.etapa === 'ENTREGA_DEFINITIVA'));
        const proximo = p.correcoes
          ? { nome: 'Entrega definitiva', data: p.correcoes.prazo, dias: p.correcoes.dias, botao: 'Enviar entrega definitiva' }
          : pendente
            ? { nome: NOME_ETAPA[pendente.etapa], data: pendente.dataLimite, dias: pendente.situacao === 'ATRASADA' ? -1 : pendente.dias,
              botao: pendente.etapa === 'ENTREGA_DEFINITIVA' ? 'Enviar entrega definitiva' : 'Enviar versão' }
            : null;

        return (
          <Pagina titulo="Prazos" descricao={descricao}>
            {proximo && (
              <div className="proximo-prazo">
                <p>Seu próximo prazo: <strong>{proximo.nome} até {dia(proximo.data)}</strong>
                  {proximo.dias != null && <span className={proximo.dias <= 0 ? 'vencido' : 'faltam'}> – {faltam(proximo.dias)}</span>}</p>
                <Link className="botao com-icone-botao" to="/versoes?enviar=1"><Upload className="ic" aria-hidden="true" />{proximo.botao}</Link>
              </div>
            )}
            <Secao titulo="Prazos do semestre">
              <ol className="lista-prazos">
                {linhas.map((l) => {
                  const [, mes, d] = l.data.slice(0, 10).split('-');
                  return (
                    <li key={l.chave} className={`${l.passou ? 'passou' : ''} ${l.atual ? 'atual' : ''}`} aria-current={l.atual ? 'step' : undefined}>
                      <span className="prazo-data" aria-hidden="true"><strong>{d}</strong>{MESES[Number(mes) - 1]}</span>
                      <span className="prazo-nome">{l.nome}<small>{l.texto}</small></span>
                      {l.selo}
                    </li>
                  );
                })}
              </ol>
              <p className="ajuda">Se uma entrega passar do prazo, você ainda pode enviar em <Link to="/versoes">Versões</Link>, mas ela fica marcada como fora do prazo.</p>
            </Secao>
          </Pagina>
        );
      }}
    </Estado>
  );
}
