import { ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ErroApi } from '../../api';
import { Campo, Cartao, Carregando, Dica, Selo } from '../../components/ui';
import type { PapelBanca } from '../../types';
import { dataHora, dataHoraLonga, PAPEIS, RESULTADOS } from '../../util';

interface ResultadoVerificacao {
  tipo: 'ATA_DEFESA' | 'PARTICIPACAO_BANCA' | 'ORIENTACAO' | 'FOLHA_APROVACAO';
  codigo: string;
  // ata
  titulo?: string; aluno?: string; curso?: string; dataHora?: string; resultado?: keyof typeof RESULTADOS;
  assinaturas?: { nome: string; papel: PapelBanca; assinadoEm: string | null; valida: boolean }[];
  assinaturaCompleta?: boolean; ataDigitalizada?: boolean;
  // declarações
  emitidaEm?: string; dados?: Record<string, string>;
}

const NOMES = { ATA_DEFESA: 'Ata de defesa de TCC', PARTICIPACAO_BANCA: 'Declaração de participação em banca', ORIENTACAO: 'Declaração de orientação', FOLHA_APROVACAO: 'Folha de aprovação' };

/** Página pública: qualquer pessoa confere se uma ata ou declaração é verdadeira, digitando o código. */
export function Verificar() {
  const { codigo } = useParams();
  const navegar = useNavigate();
  const [digitado, setDigitado] = useState(codigo ?? '');
  const [estado, setEstado] = useState<{ carregando: boolean; erro?: string; doc?: ResultadoVerificacao }>({ carregando: !!codigo });

  useEffect(() => {
    if (!codigo) return;
    setEstado({ carregando: true });
    api<ResultadoVerificacao>('GET', `/verificar/${encodeURIComponent(codigo)}`)
      .then((doc) => setEstado({ carregando: false, doc }))
      .catch((e) => setEstado({ carregando: false, erro: e instanceof ErroApi ? e.message : 'Não foi possível verificar.' }));
  }, [codigo]);

  const enviar = (e: FormEvent) => { e.preventDefault(); if (digitado.trim()) navegar(`/verificar/${encodeURIComponent(digitado.trim())}`); };
  const d = estado.doc;

  return (
    <div className="app">
      <header className="cabecalho">
        <div className="cabecalho-interno">
          <Link to="/login" className="marca"><img src="/uea.png" alt="" /><span><strong>SAG-TCC</strong><small>Verificação de documentos</small></span></Link>
          <div className="cabecalho-direita"><Link to="/login" className="botao-sair">Entrar</Link></div>
        </div>
      </header>
      <main className="conteudo">
        <section className="pagina">
          <div className="pagina-topo"><div>
            <h1>Verificar documento</h1>
            <p className="pagina-descricao">Digite o código que aparece no rodapé da ata ou da declaração (ex.: SAG-7F3K-92QA) para conferir se o documento é verdadeiro.</p>
          </div></div>
          <Cartao>
            <form className="linha-form" style={{ marginTop: 0 }} onSubmit={enviar}>
              <Campo rotulo="Código de verificação" value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder="SAG-XXXX-XXXX" autoComplete="off" />
              <button className="botao" type="submit">Verificar</button>
            </form>
          </Cartao>

          {estado.carregando && <Carregando texto="Verificando..." />}
          {estado.erro && <Dica tipo="alerta">{estado.erro}</Dica>}
          {d && (
            <Cartao className="verificado" titulo={<span className="com-icone"><ShieldCheck className="ic" aria-hidden="true" />Documento autêntico</span>} descricao={`${NOMES[d.tipo]} · código ${d.codigo}`}>
              {d.tipo === 'ATA_DEFESA' ? (
                <>
                  <dl className="infos">
                    <div className="info"><dt>TCC</dt><dd>{d.titulo}</dd></div>
                    <div className="info"><dt>Aluno(a)</dt><dd>{d.aluno}</dd></div>
                    <div className="info"><dt>Curso</dt><dd>{d.curso}</dd></div>
                    <div className="info"><dt>Defesa</dt><dd>{dataHoraLonga(d.dataHora)}</dd></div>
                    <div className="info"><dt>Resultado</dt><dd>{d.resultado ? RESULTADOS[d.resultado][0] : '—'}</dd></div>
                  </dl>
                  <h3 className="subtitulo">Assinaturas eletrônicas</h3>
                  <ul className="membros">
                    {d.assinaturas?.map((s) => (
                      <li key={s.nome}><span>{s.nome} <small>· {PAPEIS[s.papel]}</small></span>
                        {s.valida ? <Selo cor="verde">Assinou em {dataHora(s.assinadoEm)}</Selo> : <Selo cor="cinza">Não assinou eletronicamente</Selo>}
                      </li>
                    ))}
                  </ul>
                  {d.assinaturaCompleta ? <Dica tipo="sucesso">Assinada eletronicamente por todos os avaliadores, e o conteúdo não foi alterado depois das assinaturas.</Dica>
                    : d.ataDigitalizada ? <Dica>A ata foi assinada à mão e o PDF escaneado está guardado no sistema.</Dica>
                      : <Dica tipo="alerta">A ata ainda não foi assinada por todos os avaliadores.</Dica>}
                </>
              ) : (
                <dl className="infos">
                  {d.dados?.pessoa && <div className="info"><dt>Emitida para</dt><dd>{d.dados.pessoa}</dd></div>}
                  {d.dados?.papel && <div className="info"><dt>Função</dt><dd>{d.dados.papel}</dd></div>}
                  <div className="info"><dt>TCC</dt><dd>{d.dados?.titulo}</dd></div>
                  <div className="info"><dt>Aluno(a)</dt><dd>{d.dados?.aluno}</dd></div>
                  <div className="info"><dt>Curso</dt><dd>{d.dados?.curso}</dd></div>
                  <div className="info"><dt>Emitida em</dt><dd>{dataHora(d.emitidaEm)}</dd></div>
                </dl>
              )}
            </Cartao>
          )}
        </section>
      </main>
    </div>
  );
}
