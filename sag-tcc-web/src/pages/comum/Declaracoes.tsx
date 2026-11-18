import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api';
import { FileCheck } from 'lucide-react';
import { Secao } from '../../components/blocos';
import { Estado, Pagina, Selo } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Declaracao, DeclaracaoDisponivel, TipoDeclaracao } from '../../types';
import { dataHora, dia } from '../../util';

/** "Doutor" + "Maria" = "Doutor Maria"; mas não repete o título quando o nome já começa com Prof. ou Dr. */
const comTitulo = (titulacao: string | null | undefined, nome: string) =>
  !titulacao || /^(prof|profa|dr|dra)\.?\s/i.test(nome) ? nome : `${titulacao} ${nome}`;

const NOME_TIPO: Record<TipoDeclaracao, string> = {
  PARTICIPACAO_BANCA: 'Participação em banca', ORIENTACAO: 'Orientação de TCC', FOLHA_APROVACAO: 'Folha de aprovação',
};

/** Lista as declarações que a pessoa pode emitir. */
export function Declaracoes() {
  const c = useCarregar(() => api<DeclaracaoDisponivel[]>('GET', '/declaracoes/disponiveis'), []);
  const { executar } = useFeedback();
  const navegar = useNavigate();

  const abrir = async (d: DeclaracaoDisponivel) => {
    if (d.codigo) return navegar(`/declaracao/${d.codigo}`);
    const r = await executar(() => api<Declaracao>('POST', '/declaracoes', { tipo: d.tipo, tccId: Number(d.tcc_id) }), 'Declaração emitida.');
    if (r) navegar(`/declaracao/${r.codigo}`);
  };

  return (
    <Pagina titulo="Declarações" descricao="Cada declaração tem um código de verificação: quem receber o documento confere se ele é verdadeiro na página “Verificar documento”.">
      <Estado c={c}>
        {(lista) => lista.length === 0 ? (
          <div className="vazio-pagina">
            <FileCheck className="vazio-icone" aria-hidden="true" strokeWidth={1.5} />
            <h2>Nenhuma declaração disponível ainda</h2>
            <p>A declaração de participação em banca e a folha de aprovação aparecem depois da defesa. A declaração de orientação aparece depois que o TCC é concluído.</p>
          </div>
        ) : (
          <Secao titulo="Declarações disponíveis">
            <ul className="caixa lista-caixa lista-declaracoes">
              {lista.map((d) => (
                <li key={`${d.tipo}-${d.tcc_id}-${d.banca_id ?? ''}`}>
                  <span>
                    <strong>{NOME_TIPO[d.tipo]}</strong>
                    <small className="bloco texto-calmo">{d.titulo} · {d.aluno} · {dia(String(d.data).slice(0, 10))}</small>
                  </span>
                  <span className="linha-direita">
                    {d.codigo ? <Selo cor="verde">Emitida</Selo> : <Selo cor="cinza">Ainda não emitida</Selo>}
                    <button className={`botao pequeno ${d.codigo ? 'secundario' : ''}`} onClick={() => abrir(d)}>{d.codigo ? 'Abrir' : 'Emitir'}</button>
                  </span>
                </li>
              ))}
            </ul>
            <p className="ajuda">Cada declaração é emitida uma única vez e fica sempre com o mesmo código.</p>
          </Secao>
        )}
      </Estado>
    </Pagina>
  );
}

/** Declaração pronta para imprimir ou salvar em PDF. */
export function DeclaracaoImpressa() {
  const { codigo } = useParams();
  const c = useCarregar(() => api<Declaracao>('GET', `/declaracoes/${codigo}`), [codigo]);
  return (
    <Estado c={c}>
      {(d) => {
        const x = d.dados as Record<string, string> & { membros?: { nome: string; titulacao: string | null; papel: string; instituicao: string }[] };
        const tituloTcc = <strong>“{x.titulo}{x.subtitulo ? `: ${x.subtitulo}` : ''}”</strong>;
        const pessoa = <strong>{comTitulo(x.titulacao, x.pessoa)}</strong>;
        let titulo = '';
        let corpo: ReactNode = null;
        if (d.tipo === 'PARTICIPACAO_BANCA') {
          titulo = 'DECLARAÇÃO DE PARTICIPAÇÃO EM BANCA EXAMINADORA';
          corpo = <p className="ata-texto">Declaramos, para os devidos fins, que {pessoa} ({x.instituicao}) participou como <strong>{x.papel}</strong> da
            banca examinadora do Trabalho de Conclusão de Curso intitulado {tituloTcc}, de autoria de <strong>{x.aluno}</strong>, do curso
            de {x.curso}, defendido em {dataHora(x.dataHora)}, em {x.local}.</p>;
        } else if (d.tipo === 'ORIENTACAO') {
          titulo = 'DECLARAÇÃO DE ORIENTAÇÃO';
          corpo = <p className="ata-texto">Declaramos, para os devidos fins, que {pessoa} ({x.instituicao}) atuou como <strong>{x.papel}</strong> do
            Trabalho de Conclusão de Curso intitulado {tituloTcc}, de autoria de <strong>{x.aluno}</strong>, do curso de {x.curso}, no
            período de {dia(String(x.inicio).slice(0, 10))} a {dia(String(x.fim).slice(0, 10))}. Situação do trabalho: {x.conclusao}.</p>;
        } else {
          titulo = 'FOLHA DE APROVAÇÃO';
          corpo = <>
            <p className="ata-texto" style={{ textAlign: 'center' }}><strong>{x.aluno}</strong></p>
            <p className="ata-texto" style={{ textAlign: 'center' }}>{tituloTcc}</p>
            <p className="ata-texto">Trabalho de Conclusão de Curso apresentado ao curso de {x.curso} da Escola Superior de Tecnologia da
              Universidade do Estado do Amazonas e <strong>{String(x.resultado).toLowerCase()}</strong> pela banca examinadora em {dia(String(x.dataHora).slice(0, 10))}.</p>
            <h3 className="subtitulo" style={{ textAlign: 'center' }}>BANCA EXAMINADORA</h3>
            <div className="ata-assinaturas">
              {x.membros?.map((m) => <div key={m.nome}>{comTitulo(m.titulacao, m.nome)}<br /><small>{m.papel === 'PRESIDENTE' ? 'Presidente (orientador)' : 'Membro titular'} · {m.instituicao}</small></div>)}
            </div>
          </>;
        }
        return (
          <div className="pagina">
            <div className="pagina-topo nao-imprimir">
              <div><h1>{NOME_TIPO[d.tipo]}</h1><p className="pagina-descricao">Confira os dados e use o botão para imprimir ou salvar em PDF.</p></div>
              <div className="pagina-acoes">
                <button className="botao secundario" onClick={() => history.back()}>Voltar</button>
                <button className="botao" onClick={() => window.print()}>Imprimir / salvar PDF</button>
              </div>
            </div>
            <article className="ata">
              <header className="ata-cabecalho">
                <img src="/uea.png" alt="UEA" />
                <div><p>UNIVERSIDADE DO ESTADO DO AMAZONAS</p><p>ESCOLA SUPERIOR DE TECNOLOGIA</p><p>{String(x.curso).toUpperCase()}</p></div>
              </header>
              <h2>{titulo}</h2>
              {corpo}
              <p className="ata-texto" style={{ textAlign: 'right', marginTop: 32 }}>Manaus, {new Date(d.emitida_em).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Manaus' })}.</p>
              <p className="ata-verificacao">Documento emitido pelo SAG-TCC. Confira a autenticidade em {location.origin}/verificar com o código <strong>{d.codigo}</strong>.</p>
            </article>
          </div>
        );
      }}
    </Estado>
  );
}
