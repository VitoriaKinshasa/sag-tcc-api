// Tipos dos dados que chegam da API.
// Os ids vêm do PostgreSQL (BIGINT) e às vezes chegam como texto, por isso `Id` aceita os dois.
export type Id = number | string;

export type Perfil = 'ALUNO' | 'ORIENTADOR' | 'COORDENACAO' | 'MEMBRO_BANCA' | 'ADMINISTRADOR';

export interface Usuario {
  id: Id;
  nome: string;
  perfil: Perfil;
  cursoId: Id | null;
}

export type Situacao =
  | 'EM_PROPOSTA' | 'EM_DESENVOLVIMENTO' | 'APTO_DEFESA' | 'APROVADO'
  | 'APROVADO_PUBLICACAO' | 'REPROVADO' | 'NAO_APRESENTADO' | 'CANCELADO';

export interface Tcc {
  id: Id;
  titulo: string;
  subtitulo: string | null;
  resumo: string;
  area_id: Id | null;
  situacao: Situacao;
  orientador_id: Id | null;
  coorientador_id: Id | null;
  atrasado?: boolean;
  /** Aprovado com correções: o aluno ainda precisa entregar o texto corrigido até prazo_correcoes. */
  correcoes_pendentes?: boolean;
  prazo_correcoes?: string | null;
  concluido_em?: string | null;
  visibilidade?: 'TEXTO_COMPLETO' | 'SOMENTE_METADADOS';
}

export interface Area { id: Id; nome: string }

export interface Curso {
  id: Id; nome: string; sigla: string; limite_orientandos: number; ativo: boolean;
  nota_minima: number; min_titulares: number; min_suplentes: number; dias_correcoes: number; notas_individuais_aluno: boolean;
  coordenacao?: string | null;
}

export interface Orientador {
  id: Id; nome: string; curso: string; areas: string[]; orientandos: number; limite: number; disponivel: boolean;
}

export interface Notificacao { id: Id; titulo: string; mensagem: string; lida: boolean; criado_em: string }

export interface Evento { descricao: string; tipo: string; criado_em: string; autor: string | null }

export type Etapa = 'PROPOSTA' | 'QUALIFICACAO' | 'VERSAO_FINAL' | 'DEFESA' | 'ENTREGA_DEFINITIVA';

export interface PrazoEtapa {
  etapa: Etapa; dataInicio: string; dataLimite: string; exigeEntrega: boolean;
  situacao: 'ENTREGUE' | 'PENDENTE' | 'ATRASADA' | 'NAO_SE_APLICA'; dias: number | null;
}
export interface Prazos { semestre: string; etapas: PrazoEtapa[]; correcoes: { prazo: string; dias: number } | null }

export interface Versao {
  id: Id; numero: number; etapa: Etapa; enviado_em: string; fora_do_prazo: boolean; arquivo_nome: string;
  comentario?: string | null; parecer_decisao: 'APROVADA' | 'AJUSTES' | null; parecer_texto: string | null;
  titulo?: string; aluno?: string; declaracao_autoria?: boolean;
}

export type PapelBanca = 'PRESIDENTE' | 'TITULAR' | 'SUPLENTE';
export type Resultado = 'APROVADO' | 'APROVADO_COM_CORRECOES' | 'REPROVADO';

export interface MembroBanca {
  usuarioId: Id; nome: string; papel: PapelBanca; externo: boolean; instituicao: string | null; notaRegistrada: boolean;
}

export interface Banca {
  id: Id; tcc_id: Id; titulo: string; aluno: string; aluno_id: Id; curso: string;
  status: 'AGENDADA' | 'REALIZADA' | 'CANCELADA'; data_hora: string; local_ou_link: string;
  meuPapel: PapelBanca | null; resultado: Resultado | null; nota_final: number | null; observacao: string | null;
  membros: MembroBanca[];
  curso_id: Id; motivo_cancelamento: string | null; nota_minima: number; dias_correcoes: number;
  prazo_correcoes: string | null; correcoes_pendentes: boolean;
  versao_final: { id: Id; numero: number; arquivoNome: string; enviadoEm: string } | null;
}

export interface AssinaturaAta { usuarioId: Id; nome: string; papel: PapelBanca; assinadoEm: string | null; valida: boolean }

export interface Ata {
  id: Id; curso_id: Id; aluno_id: Id; curso_nome: string; data_hora: string; local_ou_link: string; titulo: string; subtitulo: string | null; aluno: string;
  resultado: Resultado; nota_final: number; observacao: string | null; ata_url?: string | null;
  prazo_correcoes: string | null; codigo_verificacao: string | null;
  notas: { membro_id: Id; nome: string; papel: PapelBanca; nota: number | null; parecer: string | null }[];
  notasIndividuaisOcultas: boolean;
  membros: MembroBanca[];
  assinaturas: AssinaturaAta[];
  assinaturaCompleta: boolean;
  ataDigitalizada: { nome: string; enviadaEm: string } | null;
}

export type TipoDeclaracao = 'PARTICIPACAO_BANCA' | 'ORIENTACAO' | 'FOLHA_APROVACAO';
export interface DeclaracaoDisponivel {
  tipo: TipoDeclaracao; tcc_id: Id; banca_id: Id | null; titulo: string; aluno: string; data: string; papel: string | null;
  codigo: string | null; emitidaEm: string | null;
}
export interface Declaracao { codigo: string; tipo: TipoDeclaracao; emitida_em: string; dados: Record<string, unknown> }

export interface Orientando {
  id: Id; titulo: string; aluno: string; situacao: Situacao; papel: 'ORIENTADOR' | 'COORIENTADOR'; atrasado: boolean;
  visibilidade?: 'TEXTO_COMPLETO' | 'SOMENTE_METADADOS';
  curso_id: Id; curso: string;
}

export interface TccCurso {
  id: Id; titulo: string; aluno: string; orientador: string | null; situacao: Situacao; atrasado: boolean;
  banca: { status: Banca['status']; dataHora: string } | null;
}

export interface Calendario { semestre: string; etapas: { etapa: Etapa; dataInicio: string; dataLimite: string }[] }

export interface DefesaAgenda {
  id: Id; data_hora: string; titulo: string; aluno: string; curso: string; local_ou_link: string;
  membros: { nome: string; papel: PapelBanca; instituicao: string | null }[];
}

// ---------- Painel, busca e auditoria (UC22 a UC24) ----------
export interface Painel {
  curso: { id: Id; nome: string; sigla: string };
  filtros: { semestre: string; areaId: Id | null; situacao: string | null };
  semestres: string[];
  porSituacao: Record<Situacao, number>;
  total: number;
  atrasados: { id: Id; titulo: string; aluno: string; orientador: string | null; situacao: Situacao; etapa: string | null; dataLimite: string | null; dias: number | null }[];
  professores: { id: Id; nome: string; no_curso: number; total: number; limite: number; bancas: number }[];
}

export interface TccBusca extends TccCurso { area: string; curso: string; semestre: string; justificativa_situacao: string | null }
export interface Pagina<T> { total: number; pagina: number; porPagina: number; itens: T[] }

export type Operacao = 'INSERT' | 'UPDATE' | 'DELETE';
export interface ItemAuditoria { id: Id; criado_em: string; tabela: string; registro_id: Id; operacao: Operacao; usuario: string | null; descricao: string | null }
export interface DetalheAuditoria extends ItemAuditoria { valor_anterior: Record<string, unknown> | null; valor_novo: Record<string, unknown> | null }

// ---------- Divulgação (UC25 a UC27) ----------
export type Visibilidade = 'TEXTO_COMPLETO' | 'SOMENTE_METADADOS';
export interface TccAcervo {
  id: Id; titulo: string; subtitulo: string | null; autor: string; orientador: string | null; area: string; curso: string;
  ano: number; visibilidade: Visibilidade; tem_pdf: boolean;
}
export interface TccAcervoDetalhe extends TccAcervo {
  resumo: string; coorientador: string | null; situacao: Situacao;
  publicacao: { titulo: string; veiculo: string; ano: number; link: string } | null;
}
export interface TextosBanner { titulo: string; introducao: string; objetivo: string; metodologia: string; resultados: string; conclusao: string }
/** Tudo o que vai no banner: os textos (que a IA pode sugerir) e as partes que só o aluno preenche. */
export interface ConteudoBanner extends TextosBanner { areaTematica: string; coautores: string; agradecimentos: string; referencias: string }
export interface SituacaoBanner {
  dados: { id: Id; titulo: string; subtitulo: string | null; resumo: string; aluno: string; orientador: string | null; coorientador: string | null; area: string; curso: string; ano: number };
  usadasHoje: number; limite: number; iaConfigurada: boolean;
  ultimo: { id: Id; conteudo: Partial<ConteudoBanner> & TextosBanner; gerado_em: string } | null;
}
