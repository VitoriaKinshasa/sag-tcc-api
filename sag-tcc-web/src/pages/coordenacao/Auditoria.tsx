import { ChevronRight, Search, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { Modal } from '../../components/Modal';
import { Ficha, Secao } from '../../components/blocos';
import { Campo, CampoSelecao, Carregando, Estado, Pagina, Selo } from '../../components/ui';
import { useCarregar } from '../../hooks';
import type { DetalheAuditoria, Id, ItemAuditoria, Operacao, Pagina as PaginaDe } from '../../types';
import { type Cor, dataHora, SITUACOES } from '../../util';
import { Paginacao } from '../comum/Paginacao';

export const OPERACOES: Record<Operacao, [string, Cor]> = { INSERT: ['Inclusão', 'verde'], UPDATE: ['Alteração', 'azul'], DELETE: ['Exclusão', 'vermelho'] };

/** Nomes legíveis das tabelas do banco. */
const TABELAS: Record<string, string> = {
  tcc: 'TCC', usuario: 'Usuário', curso: 'Curso', area_conhecimento: 'Área do conhecimento', banca: 'Banca', banca_membro: 'Membro de banca',
  nota_banca: 'Nota da banca', resultado_defesa: 'Resultado da defesa', versao_tcc: 'Versão do TCC', parecer_versao: 'Parecer de versão',
  solicitacao_orientacao: 'Pedido de orientação', solicitacao_troca: 'Troca de orientador', pedido_desistencia: 'Desistência',
  pedido_publicacao: 'Conclusão por publicação', calendario_etapa: 'Calendário', reuniao: 'Reunião', vinculo_orientacao: 'Vínculo de orientação',
  regra_nucleo: 'Regra do NUCOMP', ata_assinatura: 'Assinatura da ata', declaracao: 'Declaração', professor_area: 'Área do professor',
};
export const nomeTabela = (t: string) => TABELAS[t] ?? t;

const seteDiasAtras = () => new Date(Date.now() - 7 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });
const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Manaus' });

/** UC24 – Consultar auditoria: quem incluiu, alterou ou excluiu, quando e o que mudou. Somente leitura. */
export function Auditoria() {
  const [params, setParams] = useSearchParams();
  const [de, setDe] = useState(params.get('de') ?? seteDiasAtras());
  const [ate, setAte] = useState(params.get('ate') ?? hoje());
  const [registro, setRegistro] = useState(params.get('registroId') ?? '');
  const [erroPeriodo, setErroPeriodo] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Id | null>(null);
  const chave = params.toString();
  const opcoes = useCarregar(() => api<{ usuarios: { id: Id; nome: string }[]; tabelas: string[] }>('GET', '/auditoria/opcoes'), []);
  const c = useCarregar(() => api<PaginaDe<ItemAuditoria> & { de: string; ate: string }>('GET', '/auditoria' + (chave ? '?' + chave : '')), [chave]);

  const mudar = (novos: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(novos)) { if (v) p.set(k, v); else p.delete(k); }
    if (!('pagina' in novos)) p.delete('pagina');
    setParams(p);
  };
  const buscar = (e: FormEvent) => {
    e.preventDefault();
    if (de && ate && de > ate) { setErroPeriodo('A data inicial não pode ser posterior à data final'); return; }
    setErroPeriodo(null);
    mudar({ de, ate, registroId: registro.trim() });
  };

  return (
    <Pagina titulo="Auditoria" descricao="Registro de tudo o que foi incluído, alterado ou excluído no sistema: quem fez, quando e o que mudou. O registro não pode ser alterado nem apagado por ninguém.">
      <form className="filtros filtros-busca" onSubmit={buscar}>
        <Campo rotulo="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        <CampoSelecao rotulo="Quem fez" value={params.get('usuarioId') ?? ''} onChange={(e) => mudar({ usuarioId: e.target.value })}>
          <option value="">Todos</option>
          {(opcoes.dados?.usuarios ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </CampoSelecao>
        <CampoSelecao rotulo="Tipo de registro" value={params.get('tabela') ?? ''} onChange={(e) => mudar({ tabela: e.target.value })}>
          <option value="">Todos</option>
          {[...new Set([...(opcoes.dados?.tabelas ?? []), ...(params.get('tabela') ? [params.get('tabela')!] : [])])]
            .sort((a, b) => nomeTabela(a).localeCompare(nomeTabela(b))).map((t) => <option key={t} value={t}>{nomeTabela(t)}</option>)}
        </CampoSelecao>
        <CampoSelecao rotulo="Operação" value={params.get('operacao') ?? ''} onChange={(e) => mudar({ operacao: e.target.value })}>
          <option value="">Todas</option>
          {(Object.keys(OPERACOES) as Operacao[]).map((o) => <option key={o} value={o}>{OPERACOES[o][0]}</option>)}
        </CampoSelecao>
        <Campo rotulo="Nº do registro" inputMode="numeric" value={registro} onChange={(e) => setRegistro(e.target.value.replace(/\D/g, ''))} placeholder="Opcional" />
        <div className="filtros-botoes">
          <button className="botao" type="submit"><Search className="ic" aria-hidden="true" />Buscar</button>
        </div>
      </form>
      {erroPeriodo && <p className="erro-formulario" role="alert">{erroPeriodo}</p>}

      <Estado c={c}>
        {(r) => (
          <Secao titulo={`Registros de ${r.de.split('-').reverse().join('/')} a ${r.ate.split('-').reverse().join('/')} (${r.total})`}>
            {r.total === 0 ? (
              <div className="vazio-pagina">
                <ShieldCheck className="vazio-icone" aria-hidden="true" strokeWidth={1.5} />
                <h2>Nenhum registro de auditoria para os filtros escolhidos</h2>
                <p>Tente aumentar o período ou tirar algum filtro.</p>
              </div>
            ) : (
              <>
                <ul className="caixa lista-auditoria">
                  {r.itens.map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => setAberto(a.id)}>
                        <span className="auditoria-quando">{dataHora(a.criado_em)}</span>
                        <span className="auditoria-o-que">
                          <strong>{nomeTabela(a.tabela)} nº {a.registro_id}{a.descricao && <span className="texto-calmo"> · {a.descricao}</span>}</strong>
                          <small className="texto-calmo">{a.usuario ?? 'Sistema (automático)'}</small>
                        </span>
                        <Selo cor={OPERACOES[a.operacao][1]}>{OPERACOES[a.operacao][0]}</Selo>
                        <ChevronRight className="ic" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
                <Paginacao pagina={r.pagina} total={r.total} porPagina={r.porPagina} aoMudar={(p) => mudar({ pagina: String(p) })} />
              </>
            )}
          </Secao>
        )}
      </Estado>
      {aberto != null && <DetalheRegistro id={aberto} aoFechar={() => setAberto(null)} />}
    </Pagina>
  );
}

/** Códigos guardados no banco, mostrados com o nome por extenso. */
const VALORES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(SITUACOES).map(([k, v]) => [k, v[0]])),
  TEXTO_COMPLETO: 'Texto completo', SOMENTE_METADADOS: 'Somente os dados do trabalho',
  ALUNO: 'Aluno(a)', ORIENTADOR: 'Orientador(a)', COORDENACAO: 'Coordenação', MEMBRO_BANCA: 'Membro de banca',
  PENDENTE: 'Pendente', APROVADA: 'Aprovada', RECUSADA: 'Recusada', AGENDADA: 'Agendada', REALIZADA: 'Realizada', CANCELADA: 'Cancelada',
};
const mostrar = (v: unknown) => {
  if (v == null || v === '') return <span className="texto-calmo">—</span>;
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'object') return <code>{JSON.stringify(v)}</code>;
  const t = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) return dataHora(t);
  return VALORES[t] ?? t;
};
/** Nomes dos campos mais comuns; os outros aparecem com o nome do banco (sem o "_"). */
const CAMPOS: Record<string, string> = {
  visibilidade: 'Visibilidade no acervo', declaracao_sem_dados_sigilosos: 'Declaração de que não há dados sigilosos', situacao: 'Situação',
  justificativa_situacao: 'Justificativa da situação', titulo: 'Título', subtitulo: 'Subtítulo', orientador_id: 'Orientador (nº)',
  coorientador_id: 'Coorientador (nº)', area_id: 'Área (nº)', curso_id: 'Curso (nº)', aluno_id: 'Aluno (nº)', nome: 'Nome', email: 'E-mail',
  perfil: 'Perfil', ativo: 'Ativo', matricula: 'Matrícula', data_hora: 'Data e hora', local_ou_link: 'Local ou link', status: 'Situação',
  nota: 'Nota', nota_final: 'Nota final', resultado: 'Resultado', criado_em: 'Criado em', atualizado_em: 'Atualizado em', id: 'Nº',
};
const nomeCampo = (c: string) => CAMPOS[c] ?? c.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase());

/** FA01 – valor anterior e novo lado a lado, com os campos que mudaram em destaque. */
function DetalheRegistro({ id, aoFechar }: { id: Id; aoFechar: () => void }) {
  const c = useCarregar(() => api<DetalheAuditoria>('GET', `/auditoria/${id}`), [id]);
  return (
    <Modal titulo="Detalhe do registro" subtitulo={c.dados ? `${nomeTabela(c.dados.tabela)} nº ${c.dados.registro_id}` : undefined} aoFechar={aoFechar}>
      {c.carregando ? <Carregando /> : (
        <Estado c={c}>
          {(a) => {
            const antes = a.valor_anterior ?? {};
            const depois = a.valor_novo ?? {};
            const campos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])];
            const mudou = (k: string) => JSON.stringify(antes[k]) !== JSON.stringify(depois[k]);
            const ordem = [...campos.filter(mudou), ...campos.filter((k) => !mudou(k))];
            return (
              <>
                <Ficha linhas={[
                  ['Operação', <Selo key="o" cor={OPERACOES[a.operacao][1]}>{OPERACOES[a.operacao][0]}</Selo>],
                  ['Quem fez', a.usuario ?? 'Sistema (automático)'],
                  ['Quando', dataHora(a.criado_em)],
                  ...(a.descricao ? [['Registro', a.descricao] as [string, string]] : []),
                ]} />
                {campos.length === 0 ? <p className="texto-calmo">Este registro não guardou valores.</p> : (
                  <div className="tabela-caixa">
                    <table className="tabela tabela-auditoria">
                      <thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead>
                      <tbody>
                        {ordem.map((k) => (
                          <tr key={k} className={a.operacao === 'UPDATE' && mudou(k) ? 'mudou' : ''}>
                            <td>{nomeCampo(k)}</td>
                            <td>{a.operacao === 'INSERT' ? <span className="texto-calmo">—</span> : mostrar(antes[k])}</td>
                            <td>{a.operacao === 'DELETE' ? <span className="texto-calmo">—</span> : mostrar(depois[k])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {a.operacao === 'UPDATE' && <p className="ajuda">Os campos que mudaram aparecem primeiro, em destaque. Senhas e códigos de acesso nunca aparecem.</p>}
              </>
            );
          }}
        </Estado>
      )}
    </Modal>
  );
}
