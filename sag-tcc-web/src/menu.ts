import type { Perfil } from './types';

export interface ItemMenu { rotulo: string; caminho?: string; filhos?: { rotulo: string; caminho: string }[] }

/** Menu de cada perfil (parecido com o menu do Aluno Online). Para mudar o menu, é só editar aqui. */
export const MENU: Record<Perfil, ItemMenu[]> = {
  ALUNO: [
    { rotulo: 'Início', caminho: '/' },
    { rotulo: 'Meu TCC', caminho: '/meu-tcc' },
    { rotulo: 'Versões', caminho: '/versoes' },
    { rotulo: 'Prazos', caminho: '/prazos' },
    { rotulo: 'Minha defesa', caminho: '/defesa' },
    { rotulo: 'Pedidos', caminho: '/pedidos' },
    { rotulo: 'Declarações', caminho: '/declaracoes' },
    { rotulo: 'Agenda de defesas', caminho: '/agenda' },
  ],
  ORIENTADOR: [
    { rotulo: 'Início', caminho: '/' },
    { rotulo: 'Orientação', filhos: [
      { rotulo: 'Solicitações recebidas', caminho: '/solicitacoes' },
      { rotulo: 'Meus orientandos', caminho: '/orientandos' },
      { rotulo: 'Versões para parecer', caminho: '/versoes-recebidas' },
      { rotulo: 'Pedidos de desistência', caminho: '/desistencias' },
    ] },
    { rotulo: 'Bancas', caminho: '/bancas' },
    { rotulo: 'Declarações', caminho: '/declaracoes' },
    { rotulo: 'Minhas áreas', caminho: '/areas' },
    { rotulo: 'Agenda de defesas', caminho: '/agenda' },
  ],
  MEMBRO_BANCA: [
    { rotulo: 'Início', caminho: '/' },
    { rotulo: 'Minhas bancas', caminho: '/bancas' },
    { rotulo: 'Declarações', caminho: '/declaracoes' },
    { rotulo: 'Agenda de defesas', caminho: '/agenda' },
  ],
  // A coordenação também é professora: orienta e participa de bancas.
  COORDENACAO: [
    { rotulo: 'Início', caminho: '/' },
    { rotulo: 'TCCs do curso', caminho: '/tccs' },
    { rotulo: 'Minha orientação', filhos: [
      { rotulo: 'Solicitações recebidas', caminho: '/solicitacoes' },
      { rotulo: 'Meus orientandos', caminho: '/orientandos' },
      { rotulo: 'Versões para parecer', caminho: '/versoes-recebidas' },
      { rotulo: 'Minhas áreas', caminho: '/areas' },
      { rotulo: 'Declarações', caminho: '/declaracoes' },
    ] },
    { rotulo: 'Bancas', caminho: '/bancas' },
    { rotulo: 'Calendário', caminho: '/calendario' },
    { rotulo: 'Pedidos', filhos: [
      { rotulo: 'Trocas de orientador', caminho: '/trocas' },
      { rotulo: 'Desistências', caminho: '/desistencias' },
      { rotulo: 'Conclusão por publicação', caminho: '/publicacoes' },
    ] },
    { rotulo: 'Cadastros', filhos: [
      { rotulo: 'Usuários', caminho: '/usuarios' },
      { rotulo: 'Cursos, áreas e regras', caminho: '/cursos' },
      { rotulo: 'E-mails enviados (simulação)', caminho: '/emails' },
    ] },
    { rotulo: 'Relatórios', caminho: '/relatorios' },
    { rotulo: 'Agenda de defesas', caminho: '/agenda' },
  ],
};
