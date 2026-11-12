-- ==================================================================
-- SAG-TCC – Usuários de exemplo para testar a API
-- Senha de todos: Senha@123
-- ==================================================================

-- Usuários dos 3 cursos (o curso é encontrado pela sigla: EC, SI e LC)
INSERT INTO usuario (nome, email, senha_hash, perfil, curso_id, matricula, termo_aceito_em)
SELECT v.nome, v.email,
       '$2b$10$v4JxVsvCccxSv2GnSJkhNOXRZxjY2RCH0BZir5TyzGJq/pTvnmM0K',
       v.perfil::perfil_usuario, c.id, v.matricula, now()
FROM (VALUES
  -- Sistemas de Informação (SI)
  ('Profa. Marcela Pessoa',        'msppessoa@uea.edu.br',          'COORDENACAO', 'SI', NULL),
  ('Profa. Elloa Guedes',          'ebgcosta@uea.edu.br',          'ORIENTADOR',  'SI', NULL),
  ('Prof. Fábio Santos',           'fssilva@uea.edu.br',          'ORIENTADOR',  'SI', NULL),
  ('Carla Mendes (aluna)',         'cm.snf22@uea.edu.br',         'ALUNO',       'SI', '2022000001'),
  ('Diego Rocha (aluno)',          'dr.snf22@uea.edu.br',         'ALUNO',       'SI', '2022000002'),

  -- Engenharia de Computação (EC)
  ('Profa. Áurea Melo',            'asmelo@uea.edu.br',            'COORDENACAO', 'EC', NULL),
  ('Prof. Tiago de Melo',          'tmelo@uea.edu.br',            'ORIENTADOR',  'EC', NULL),
  ('Profa. Polianny Lima',         'palima@uea.edu.br',            'ORIENTADOR',  'EC', NULL),
  ('Gabriel Nunes (aluno)',        'gn.eng22@uea.edu.br',         'ALUNO',       'EC', '2022000003'),
  ('Helena Prado (aluna)',         'hp.eng22@uea.edu.br',         'ALUNO',       'EC', '2022000004'),

  -- Licenciatura em Computação (LC)
  ('Profa. Danielle Valente',      'dvalente@uea.edu.br',         'COORDENACAO', 'LC', NULL),
  ('Prof. Almir Oliveira',         'adjunior@uea.edu.br',        'ORIENTADOR',  'LC', NULL),
  ('Profa. Danielle Noronha',      'dnoronha@uea.edu.br',         'ORIENTADOR',  'LC', NULL),
  ('Karen Oliveira (aluna)',       'ko.lic22@uea.edu.br',         'ALUNO',       'LC', '2022000005'),
  ('Lucas Ferreira (aluno)',       'lf.lic22@uea.edu.br',         'ALUNO',       'LC', '2022000006')
) AS v(nome, email, perfil, sigla, matricula)
JOIN curso c ON c.sigla = v.sigla;

-- Coordenador de cada curso
UPDATE curso SET coordenador_id = (SELECT id FROM usuario WHERE email = 'msppessoa@uea.edu.br')  WHERE sigla = 'SI';
UPDATE curso SET coordenador_id = (SELECT id FROM usuario WHERE email = 'asmelo@uea.edu.br')    WHERE sigla = 'EC';
UPDATE curso SET coordenador_id = (SELECT id FROM usuario WHERE email = 'dvalente@uea.edu.br') WHERE sigla = 'LC';

-- Áreas de interesse dos orientadores
INSERT INTO professor_area (professor_id, area_id)
SELECT u.id, a.id FROM usuario u, area_conhecimento a
WHERE (u.email = 'ebgcosta@uea.edu.br'   AND a.nome IN ('Engenharia de Software', 'Banco de Dados'))
   OR (u.email = 'fssilva@uea.edu.br'   AND a.nome IN ('Inteligência Artificial', 'Informática na Educação'))
   OR (u.email = 'tmelo@uea.edu.br'     AND a.nome IN ('Sistemas Embarcados', 'Redes de Computadores'))
   OR (u.email = 'palima@uea.edu.br'     AND a.nome IN ('Inteligência Artificial', 'Sistemas Embarcados'))
   OR (u.email = 'adjunior@uea.edu.br' AND a.nome IN ('Informática na Educação', 'Engenharia de Software'))
   OR (u.email = 'dnoronha@uea.edu.br'  AND a.nome IN ('Informática na Educação', 'Banco de Dados'));

-- ==================================================================
-- TP3 – Membro de banca externo
-- ==================================================================

-- Membro de banca externo à UEA (perfil MEMBRO_BANCA)
INSERT INTO usuario (nome, email, senha_hash, perfil, curso_id, matricula, externo, instituicao, titulacao, termo_aceito_em)
VALUES ('Dr. Rafael Costa (membro externo)', 'rcosta.externo@exemplo.com',
        '$2b$10$v4JxVsvCccxSv2GnSJkhNOXRZxjY2RCH0BZir5TyzGJq/pTvnmM0K',
        'MEMBRO_BANCA', NULL, NULL, TRUE, 'UFAM', 'Doutor', now());
