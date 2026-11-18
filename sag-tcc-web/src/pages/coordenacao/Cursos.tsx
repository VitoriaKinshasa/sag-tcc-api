import { useState } from 'react';
import { api } from '../../api';
import { useUsuario } from '../../auth';
import { Campo, Cartao, Dica, Estado, Pagina, Selo, Tabela } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Area, Curso } from '../../types';
import { mesmoId } from '../../util';

export function Cursos() {
  const eu = useUsuario();
  const c = useCarregar(() => Promise.all([api<Curso[]>('GET', '/cursos'), api<Area[]>('GET', '/areas')]), []);
  const [curso, setCurso] = useState({ nome: '', sigla: '' });
  const [area, setArea] = useState('');
  const { executar, perguntar } = useFeedback();

  const acao = async (x: Curso, tipo: 'desativar' | 'excluir') => {
    const ok = await perguntar(tipo === 'excluir'
      ? { titulo: `Excluir ${x.sigla}?`, texto: 'Só é possível excluir cursos sem usuários e sem TCCs. Se houver, desative.', confirmar: 'Excluir', perigo: true }
      : { titulo: `Desativar ${x.sigla}?`, texto: 'O curso some das listas de cadastro, mas o histórico é mantido.', confirmar: 'Desativar' });
    if (!ok) return;
    const r = await executar(() => tipo === 'excluir' ? api('DELETE', `/cursos/${x.id}`) : api('PATCH', `/cursos/${x.id}/desativar`),
      tipo === 'excluir' ? 'Curso excluído.' : 'Curso desativado.');
    if (r) c.recarregar();
  };

  const novoCurso = async () => {
    const r = await executar(() => api('POST', '/cursos', { nome: curso.nome, sigla: curso.sigla }), 'Curso cadastrado.');
    if (r) { setCurso({ nome: '', sigla: '' }); c.recarregar(); }
  };
  const novaArea = async () => {
    const r = await executar(() => api('POST', '/areas', { nome: area }), 'Área cadastrada.');
    if (r) { setArea(''); c.recarregar(); }
  };

  return (
    <Pagina titulo="Cursos, áreas e regras" descricao="As regras do seu curso, os cursos que usam o SAG-TCC e as áreas do conhecimento usadas para ligar alunos e orientadores.">
      <Estado c={c}>
        {([cursos, areas]) => (
          <>
            <RegrasNucleo />
            {cursos.find((x) => mesmoId(x.id, eu.cursoId)) && (
              <RegrasDoCurso curso={cursos.find((x) => mesmoId(x.id, eu.cursoId))!} aoSalvar={c.recarregar} />
            )}
            <Cartao titulo="Cursos">
              <Tabela linhas={cursos} chave={(x) => String(x.id)}
                colunas={[
                  { titulo: 'Curso', valor: (x) => <strong>{x.nome}</strong> },
                  { titulo: 'Sigla', valor: (x) => x.sigla },
                  { titulo: 'Situação', valor: (x) => x.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo cor="cinza">Desativado</Selo> },
                  { titulo: '', className: 'col-acoes', valor: (x) => (
                    <div className="acoes">
                      {x.ativo && <button className="botao pequeno secundario" onClick={() => acao(x, 'desativar')}>Desativar</button>}
                      <button className="botao pequeno secundario perigo-texto" onClick={() => acao(x, 'excluir')}>Excluir</button>
                    </div>
                  ) },
                ]} />
              <h3 className="subtitulo">Novo curso</h3>
              <form className="grade-3" onSubmit={(e) => { e.preventDefault(); novoCurso(); }}>
                <Campo rotulo="Nome" obrigatorio value={curso.nome} onChange={(e) => setCurso({ ...curso, nome: e.target.value })} />
                <Campo rotulo="Sigla" obrigatorio maxLength={10} value={curso.sigla} onChange={(e) => setCurso({ ...curso, sigla: e.target.value })} />
                <div className="acoes"><button className="botao" type="submit">Cadastrar curso</button></div>
              </form>
            </Cartao>

            <Cartao titulo="Áreas do conhecimento">
              <div className="chips">{areas.map((a) => <span key={a.id} className="chip">{a.nome}</span>)}</div>
              <form className="linha-form" onSubmit={(e) => { e.preventDefault(); novaArea(); }}>
                <Campo rotulo="Nova área" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ex.: Computação Quântica" />
                <button className="botao" type="submit">Cadastrar área</button>
              </form>
            </Cartao>
          </>
        )}
      </Estado>
    </Pagina>
  );
}

/** Regras do curso da coordenação logada: cada curso da UEA pode ter as suas. */
function RegrasDoCurso({ curso, aoSalvar }: { curso: Curso; aoSalvar: () => void }) {
  const [r, setR] = useState({
    notaMinima: String(curso.nota_minima).replace('.', ','),
    minTitulares: String(curso.min_titulares), minSuplentes: String(curso.min_suplentes),
    diasCorrecoes: String(curso.dias_correcoes), notasIndividuaisAluno: curso.notas_individuais_aluno,
  });
  const { executar } = useFeedback();
  const muda = (k: keyof typeof r) => (e: { target: { value: string } }) => setR({ ...r, [k]: e.target.value });
  const salvar = async () => {
    const ok = await executar(() => api('PUT', `/cursos/${curso.id}/regras`, {
      notaMinima: Number(r.notaMinima.replace(',', '.')),
      minTitulares: Number(r.minTitulares), minSuplentes: Number(r.minSuplentes),
      diasCorrecoes: Number(r.diasCorrecoes), notasIndividuaisAluno: r.notasIndividuaisAluno,
    }), 'Regras do curso salvas. Elas valem a partir de agora.');
    if (ok) aoSalvar();
  };
  return (
    <Cartao className="regras" titulo={`Regras do curso ${curso.sigla}`} descricao="Ajuste de acordo com o regulamento de TCC do seu curso. As mudanças valem para as próximas bancas e resultados.">
      <div className="grade-3">
        <Campo rotulo="Nota mínima para aprovar" inputMode="decimal" value={r.notaMinima} onChange={muda('notaMinima')} ajuda="De 0 a 10. Ex.: 6 ou 7" />
        <Campo rotulo="Prazo das correções (dias)" type="number" min={1} max={180} value={r.diasCorrecoes} onChange={muda('diasCorrecoes')}
          ajuda="Quando o TCC é aprovado com correções" />
        <Campo rotulo="Titulares na banca (com o presidente)" type="number" min={2} max={7} value={r.minTitulares} onChange={muda('minTitulares')} />
        <Campo rotulo="Suplentes na banca" type="number" min={0} max={3} value={r.minSuplentes} onChange={muda('minSuplentes')} />
      </div>
      <label className="caixa-marcar">
        <input type="checkbox" checked={r.notasIndividuaisAluno} onChange={(e) => setR({ ...r, notasIndividuaisAluno: e.target.checked })} />
        O aluno pode ver a nota de cada membro da banca na ata
      </label>
      <Dica>Desmarcado (recomendado): o aluno vê a nota final e os pareceres, mas não a nota de cada professor.</Dica>
      <div className="acoes"><button className="botao" onClick={salvar}>Salvar regras</button></div>
    </Cartao>
  );
}

/** Regra que vale para o NUCOMP inteiro: os professores orientam alunos de todos os cursos. */
function RegrasNucleo() {
  const c = useCarregar(() => api<{ limiteOrientandos: number }>('GET', '/nucleo/regras'), []);
  const [limite, setLimite] = useState<string | null>(null);
  const { executar } = useFeedback();
  return (
    <Cartao className="regras" titulo="Regra do NUCOMP (todos os cursos)"
      descricao="Os professores do NUCOMP orientam alunos de qualquer curso. O limite abaixo é o TOTAL de orientandos de cada professor, somando SI, EC e LC.">
      <Estado c={c}>
        {(r) => (
          <div className="linha-form" style={{ marginTop: 0 }}>
            <Campo rotulo="Orientandos por professor (total)" type="number" min={1} max={30}
              value={limite ?? String(r.limiteOrientandos)} onChange={(e) => setLimite(e.target.value)} />
            <button className="botao" onClick={async () => {
              const ok = await executar(() => api('PUT', '/nucleo/regras', { limiteOrientandos: Number(limite ?? r.limiteOrientandos) }),
                'Limite salvo. Vale para todos os professores e cursos.');
              if (ok) c.recarregar();
            }}>Salvar</button>
          </div>
        )}
      </Estado>
      <Dica>Essa regra é compartilhada: qualquer coordenação de curso pode alterar.</Dica>
    </Cartao>
  );
}
