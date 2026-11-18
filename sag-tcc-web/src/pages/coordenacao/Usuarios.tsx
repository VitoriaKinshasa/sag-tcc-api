import { CircleCheck, CircleX, Upload } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { useUsuario } from '../../auth';
import { Modal } from '../../components/Modal';
import { Campo, CampoSelecao, Cartao, Coluna, Dica, Estado, Pagina, Selo, Tabela } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Curso, Id, Perfil } from '../../types';
import { mesmoId } from '../../util';

interface UsuarioLista {
  id: Id; nome: string; email: string; perfil: Perfil; curso_id: Id | null; matricula: string | null;
  externo: boolean; instituicao: string | null; titulacao: string | null; ativo: boolean;
}

/** As três abas da tela. */
type Aba = 'alunos' | 'professores' | 'externos';
const ABAS: { id: Aba; titulo: string; botao: string; descricao: string }[] = [
  { id: 'alunos', titulo: 'Alunos', botao: '+ Novo aluno', descricao: 'Alunos do curso. A matrícula é obrigatória.' },
  { id: 'professores', titulo: 'Professores', botao: '+ Novo professor', descricao: 'Professores do NUCOMP: dão aula e orientam alunos de todos os cursos. Aparece também a coordenação do seu curso.' },
  { id: 'externos', titulo: 'Membros externos', botao: '+ Novo membro externo', descricao: 'Pessoas de fora da UEA que participam de bancas. Eles são compartilhados entre todos os cursos.' },
];

const abaDe = (u: UsuarioLista): Aba => (u.externo ? 'externos' : u.perfil === 'ALUNO' ? 'alunos' : 'professores');

const FUNCAO: Record<Perfil, string> = {
  ALUNO: 'Aluno(a)', ORIENTADOR: 'Orientador(a)', COORDENACAO: 'Coordenação', MEMBRO_BANCA: 'Só banca',
};

export function Usuarios() {
  const eu = useUsuario();
  const c = useCarregar(() => Promise.all([api<UsuarioLista[]>('GET', '/usuarios'), api<Curso[]>('GET', '/cursos')]), []);
  const [aba, setAba] = useState<Aba>('alunos');
  const [busca, setBusca] = useState('');
  const [verDesativados, setVerDesativados] = useState(false);
  const [editar, setEditar] = useState<UsuarioLista | Aba | null>(null);
  const [importar, setImportar] = useState(false);
  const { executar, perguntar } = useFeedback();

  const desativar = async (u: UsuarioLista) => {
    if (!(await perguntar({ titulo: 'Desativar usuário?', texto: `${u.nome} não vai mais conseguir entrar no sistema. O histórico dele é mantido.`, confirmar: 'Desativar', perigo: true }))) return;
    if (await executar(() => api('PATCH', `/usuarios/${u.id}/desativar`), 'Usuário desativado.')) c.recarregar();
  };

  const acoes: Coluna<UsuarioLista> = {
    titulo: '', className: 'col-acoes', valor: (u) => u.ativo && (
      <div className="acoes">
        <button className="botao pequeno secundario" onClick={() => setEditar(u)}>Editar</button>
        {!mesmoId(u.id, eu.id) && <button className="botao pequeno secundario perigo-texto" onClick={() => desativar(u)}>Desativar</button>}
      </div>
    ),
  };
  const situacao: Coluna<UsuarioLista> = { titulo: 'Situação', valor: (u) => u.ativo ? <Selo cor="verde">Ativo</Selo> : <Selo cor="cinza">Desativado</Selo> };
  const nome: Coluna<UsuarioLista> = { titulo: 'Nome', valor: (u) => <strong>{u.nome}</strong> };
  const email: Coluna<UsuarioLista> = { titulo: 'E-mail', valor: (u) => u.email };

  const COLUNAS: Record<Aba, Coluna<UsuarioLista>[]> = {
    alunos: [nome, { titulo: 'Matrícula', valor: (u) => u.matricula ?? '—' }, email, situacao, acoes],
    professores: [nome, { titulo: 'Função', valor: (u) => FUNCAO[u.perfil] }, { titulo: 'Titulação', valor: (u) => u.titulacao ?? '—' }, email, situacao, acoes],
    externos: [nome, { titulo: 'Instituição', valor: (u) => u.instituicao ?? '—' }, { titulo: 'Titulação', valor: (u) => u.titulacao ?? '—' }, email, situacao, acoes],
  };

  const info = ABAS.find((a) => a.id === aba)!;

  return (
    <Estado c={c}>
      {([usuarios, cursos]) => {
        const meuCurso = cursos.find((x) => mesmoId(x.id, eu.cursoId));
        const termo = busca.trim().toLowerCase();
        const daAba = (a: Aba) => usuarios.filter((u) => abaDe(u) === a && (verDesativados || u.ativo));
        const lista = daAba(aba).filter((u) => !termo || u.nome.toLowerCase().includes(termo)
          || u.email.toLowerCase().includes(termo) || (u.matricula ?? '').includes(termo) || (u.instituicao ?? '').toLowerCase().includes(termo));

        return (
          <Pagina titulo="Usuários"
            descricao={<>Pessoas do curso <strong>{meuCurso ? `${meuCurso.nome} (${meuCurso.sigla})` : ''}</strong>. Quem é cadastrado recebe por e-mail um link para criar a própria senha.</>}
            acoes={<>
              {aba === 'alunos' && <button className="botao secundario" onClick={() => setImportar(true)}><Upload className="ic" aria-hidden="true" /> Importar planilha</button>}
              <button className="botao" onClick={() => setEditar(aba)}>{info.botao}</button>
            </>}>
            <div className="abas" role="tablist">
              {ABAS.map((a) => (
                <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => { setAba(a.id); setBusca(''); }}>
                  {a.titulo} <span className="aba-numero">{daAba(a.id).length}</span>
                </button>
              ))}
            </div>
            <Cartao>
              <p className="ajuda" style={{ marginTop: 0 }}>{info.descricao}</p>
              <div className="linha-form" style={{ marginTop: 0 }}>
                <Campo rotulo="Buscar" type="search" value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder={aba === 'alunos' ? 'Nome, e-mail ou matrícula' : aba === 'externos' ? 'Nome, e-mail ou instituição' : 'Nome ou e-mail'} />
                <label className="caixa-marcar" style={{ marginBottom: 10 }}>
                  <input type="checkbox" checked={verDesativados} onChange={(e) => setVerDesativados(e.target.checked)} />
                  Mostrar desativados
                </label>
              </div>
            </Cartao>
            <Tabela linhas={lista} chave={(u) => String(u.id)} colunas={COLUNAS[aba]}
              vazio={termo ? 'Ninguém encontrado com essa busca.' : `Nenhum cadastro em “${info.titulo}”.`} />

            {editar && (
              <ModalUsuario usuario={typeof editar === 'string' ? null : editar} aba={typeof editar === 'string' ? editar : abaDe(editar)}
                cursoNome={meuCurso ? `${meuCurso.nome} (${meuCurso.sigla})` : '—'}
                aoFechar={() => setEditar(null)} aoSalvar={() => { setEditar(null); c.recarregar(); }} />
            )}
            {importar && <ModalImportar aoFechar={() => { setImportar(false); c.recarregar(); }} />}
          </Pagina>
        );
      }}
    </Estado>
  );
}

function ModalUsuario({ usuario, aba, cursoNome, aoFechar, aoSalvar }: {
  usuario: UsuarioLista | null; aba: Aba; cursoNome: string; aoFechar: () => void; aoSalvar: () => void;
}) {
  const novo = !usuario;
  const perfilInicial: Perfil = usuario?.perfil ?? (aba === 'alunos' ? 'ALUNO' : aba === 'externos' ? 'MEMBRO_BANCA' : 'ORIENTADOR');
  const [f, setF] = useState({
    nome: usuario?.nome ?? '', email: usuario?.email ?? '', perfil: perfilInicial,
    matricula: usuario?.matricula ?? '', titulacao: usuario?.titulacao ?? '', instituicao: usuario?.instituicao ?? '',
  });
  const { executar } = useFeedback();
  const muda = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const externo = aba === 'externos';
  const aluno = aba === 'alunos';

  const salvar = async () => {
    const base = { nome: f.nome, email: f.email.trim(), matricula: aluno ? f.matricula.trim() || null : null, titulacao: aluno ? null : f.titulacao.trim() || null };
    const r = novo
      ? await executar(() => api('POST', '/usuarios', { ...base, perfil: f.perfil, externo, instituicao: externo ? f.instituicao.trim() || null : null }),
        'Cadastrado! A pessoa vai receber um e-mail com o link para criar a senha.')
      : await executar(() => api('PUT', `/usuarios/${usuario!.id}`, base), 'Dados atualizados.');
    if (r) aoSalvar();
  };

  const titulo = novo ? ABAS.find((a) => a.id === aba)!.botao.replace('+ ', '') : 'Editar cadastro';

  return (
    <Modal titulo={titulo} subtitulo={novo ? 'A coordenação não define senha: a própria pessoa cria a dela pelo link do e-mail.' : usuario!.email}
      aoFechar={aoFechar}
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>{novo ? 'Cadastrar' : 'Salvar'}</button></>}>
      {novo && aba === 'professores' && (
        <CampoSelecao rotulo="Função" obrigatorio value={f.perfil} onChange={muda('perfil')}>
          <option value="ORIENTADOR">Orientador(a): orienta TCCs e participa de bancas</option>
          <option value="MEMBRO_BANCA">Só banca: participa de bancas, mas não orienta</option>
          <option value="COORDENACAO">Coordenação do meu curso (também orienta)</option>
        </CampoSelecao>
      )}
      <Campo rotulo="Nome completo" obrigatorio value={f.nome} onChange={muda('nome')} />
      <Campo rotulo="E-mail" type="email" obrigatorio value={f.email} onChange={muda('email')}
        ajuda={externo ? 'E-mail que a pessoa usa no dia a dia.' : 'De preferência o e-mail institucional (@uea.edu.br).'} />
      <div className="grade-2">
        {aluno && <Campo rotulo="Matrícula" obrigatorio value={f.matricula} onChange={muda('matricula')} />}
        {!aluno && <Campo rotulo="Titulação" value={f.titulacao} onChange={muda('titulacao')} placeholder="Ex.: Mestre, Doutor(a)" />}
        {externo && <Campo rotulo="Instituição" obrigatorio={novo} disabled={!novo} value={f.instituicao} onChange={muda('instituicao')} placeholder="Ex.: UFAM" />}
      </div>
      {externo
        ? <Dica>Membros externos não pertencem a nenhum curso e podem ser chamados para bancas de qualquer curso.</Dica>
        : aba === 'professores' && f.perfil !== 'COORDENACAO'
          ? <Dica>Professores são do <strong>NUCOMP</strong>: não ficam presos a um curso e podem orientar alunos de qualquer curso.</Dica>
          : <Dica>Curso: <strong>{cursoNome}</strong>.{f.perfil === 'COORDENACAO' ? ' A coordenação também orienta e participa de bancas.' : ''}</Dica>}
      {!novo && <p className="ajuda">A função não pode ser trocada. Se a pessoa mudou de papel, desative este cadastro e crie outro.</p>}
    </Modal>
  );
}

interface LinhaImportacao { nome: string; email: string; matricula: string }
interface ResultadoImportacao { cadastrados: number; comErro: number; linhas: { linha: number; nome: string; ok: boolean; erro?: string }[] }

/** Lê o CSV (salvo pelo Excel ou Google Planilhas). Aceita ; ou , e ignora a linha de títulos. */
function lerCsv(texto: string): LinhaImportacao[] {
  const linhas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!linhas.length) return [];
  const sep = linhas[0].includes(';') ? ';' : ',';
  const partes = linhas.map((l) => l.split(sep).map((p) => p.trim().replace(/^"|"$/g, '')));
  const semTitulo = /nome/i.test(partes[0][0] ?? '') ? partes.slice(1) : partes;
  return semTitulo.map(([nome = '', email = '', matricula = '']) => ({ nome, email, matricula }));
}

function ModalImportar({ aoFechar }: { aoFechar: () => void }) {
  const [linhas, setLinhas] = useState<LinhaImportacao[]>([]);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { executar } = useFeedback();

  const escolher = async (f: File | undefined) => {
    if (!f) return;
    setResultado(null);
    setNomeArquivo(f.name);
    setLinhas(lerCsv(await f.text()));
  };
  const baixarModelo = () => {
    const csv = '\uFEFFnome;email;matricula\r\nMaria da Silva;mds.si26@uea.edu.br;2026000001\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'modelo-alunos.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  const importar = async () => {
    setEnviando(true);
    const r = await executar(() => api<ResultadoImportacao>('POST', '/usuarios/importar', { linhas }),
      (r) => `${r.cadastrados} aluno(s) cadastrado(s)${r.comErro ? `, ${r.comErro} linha(s) com erro` : ''}.`);
    setEnviando(false);
    if (r) setResultado(r);
  };

  return (
    <Modal titulo="Importar alunos de uma planilha" subtitulo="Cada aluno recebe por e-mail o link para criar a senha." aoFechar={aoFechar}
      rodape={resultado
        ? <button className="botao" onClick={aoFechar}>Concluir</button>
        : <><button className="botao secundario" onClick={aoFechar}>Cancelar</button>
          <button className="botao" onClick={importar} disabled={!linhas.length || enviando}>{enviando ? 'Importando...' : `Importar ${linhas.length || ''} aluno(s)`}</button></>}>
      {!resultado && <>
        <ol className="passos-simples">
          <li>Baixe o <button className="link-botao" onClick={baixarModelo}>modelo da planilha</button>.</li>
          <li>Preencha uma linha por aluno: <strong>nome</strong>, <strong>e-mail</strong> e <strong>matrícula</strong> (até 200 por vez).</li>
          <li>No Excel ou no Google Planilhas, salve como <strong>CSV</strong> e escolha o arquivo abaixo.</li>
        </ol>
        <div className="campo">
          <label htmlFor="csv-alunos">Arquivo CSV</label>
          <input id="csv-alunos" type="file" accept=".csv,text/csv" onChange={(e) => escolher(e.target.files?.[0])} />
          {nomeArquivo && <span className="ajuda">{nomeArquivo}: {linhas.length} aluno(s) encontrado(s)</span>}
        </div>
        {linhas.length > 0 && (
          <div className="previa-importacao">
            <table className="tabela"><thead><tr><th>#</th><th>Nome</th><th>E-mail</th><th>Matrícula</th></tr></thead>
              <tbody>{linhas.slice(0, 50).map((l, i) => <tr key={i}><td>{i + 1}</td><td>{l.nome}</td><td>{l.email}</td><td>{l.matricula}</td></tr>)}</tbody>
            </table>
            {linhas.length > 50 && <p className="ajuda">... e mais {linhas.length - 50} linha(s).</p>}
          </div>
        )}
        <Dica>Todos entram como alunos do seu curso. Linhas com erro (e-mail inválido, matrícula repetida) são mostradas e não impedem as outras.</Dica>
      </>}
      {resultado && <>
        <Dica tipo={resultado.comErro ? 'alerta' : 'sucesso'}>{resultado.cadastrados} cadastrado(s). {resultado.comErro} com erro.</Dica>
        <div className="previa-importacao">
          <table className="tabela"><thead><tr><th>Linha</th><th>Nome</th><th>Situação</th></tr></thead>
            <tbody>{resultado.linhas.map((l) => (
              <tr key={l.linha} className={l.ok ? '' : 'linha-erro'}><td>{l.linha}</td><td>{l.nome}</td><td><span className="com-icone">{l.ok ? <><CircleCheck className="ic ok" aria-hidden="true" />Cadastrado</> : <><CircleX className="ic erro" aria-hidden="true" />{l.erro}</>}</span></td></tr>
            ))}</tbody>
          </table>
        </div>
      </>}
    </Modal>
  );
}
