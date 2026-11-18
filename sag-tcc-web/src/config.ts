/**
 * Mostrar na tela de login a lista de contas de demonstração (senha Senha@123)?
 * Deixe `true` enquanto o grupo estiver testando. Quando o sistema for usado de verdade, troque para `false`.
 */
export const MOSTRAR_CONTAS_DEMO = true;

export const CONTAS_DEMO: [string, [string, string, string][]][] = [
  ['Coordenação (uma por curso, também orienta)', [
    ['Profa. Marcela Pessoa', 'msppessoa@uea.edu.br', 'SI'],
    ['Profa. Áurea Melo', 'asmelo@uea.edu.br', 'EC'],
    ['Profa. Danielle Valente', 'dvalente@uea.edu.br', 'LC'],
  ]],
  ['Professores do NUCOMP (orientam todos os cursos)', [
    ['Profa. Elloa Guedes', 'ebgcosta@uea.edu.br', 'Orientadora'],
    ['Prof. Fábio Santos', 'fssilva@uea.edu.br', 'Orientador'],
    ['Prof. Tiago de Melo', 'tmelo@uea.edu.br', 'Orientador'],
    ['Profa. Polianny Lima', 'palima@uea.edu.br', 'Orientadora'],
    ['Prof. Almir Oliveira', 'adjunior@uea.edu.br', 'Orientador'],
    ['Profa. Danielle Noronha', 'dnoronha@uea.edu.br', 'Orientadora'],
  ]],
  ['Alunos', [
    ['Carla Mendes', 'cm.snf22@uea.edu.br', 'SI'],
    ['Diego Rocha', 'dr.snf22@uea.edu.br', 'SI'],
    ['Gabriel Nunes', 'gn.eng22@uea.edu.br', 'EC'],
    ['Helena Prado', 'hp.eng22@uea.edu.br', 'EC'],
    ['Karen Oliveira', 'ko.lic22@uea.edu.br', 'LC'],
    ['Lucas Ferreira', 'lf.lic22@uea.edu.br', 'LC'],
  ]],
  ['Membro externo', [
    ['Dr. Rafael Costa (UFAM)', 'rcosta.externo@exemplo.com', 'Membro de banca'],
  ]],
];
