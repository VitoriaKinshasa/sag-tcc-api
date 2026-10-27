-- =====================================================================
-- SAG-TCC – Usuários de exemplo para testar a API (rodar DEPOIS do schema.sql)
-- Senha de todos: Senha@123
-- =====================================================================
INSERT INTO usuario (nome, email, senha_hash, perfil, curso_id, matricula, termo_aceito_em) VALUES
  ('Coordenação de Sistemas de Informação', 'coordenacao.si@uea.edu.br', '$2b$10$v4JxVsvCccxSv2GnSJkhNOXRZxjY2RCH0BZir5TyzGJq/pTvnmM0K', 'COORDENACAO', 2, NULL, now()),
  ('Prof. Ana Souza',      'ana.souza@uea.edu.br',  '$2b$10$v4JxVsvCccxSv2GnSJkhNOXRZxjY2RCH0BZir5TyzGJq/pTvnmM0K', 'ORIENTADOR', 2, NULL, now()),
  ('Prof. Bruno Lima',     'bruno.lima@uea.edu.br', '$2b$10$v4JxVsvCccxSv2GnSJkhNOXRZxjY2RCH0BZir5TyzGJq/pTvnmM0K', 'ORIENTADOR', 2, NULL, now()),
  ('Carla Mendes (aluna)', 'carla.mendes@uea.edu.br', '$2b$10$v4JxVsvCccxSv2GnSJkhNOXRZxjY2RCH0BZir5TyzGJq/pTvnmM0K', 'ALUNO', 2, '2022000001', now()),
  ('Diego Rocha (aluno)',  'diego.rocha@uea.edu.br',  '$2b$10$v4JxVsvCccxSv2GnSJkhNOXRZxjY2RCH0BZir5TyzGJq/pTvnmM0K', 'ALUNO', 2, '2022000002', now());

UPDATE curso SET coordenador_id = (SELECT id FROM usuario WHERE email = 'coordenacao.si@uea.edu.br') WHERE sigla = 'SI';

INSERT INTO professor_area (professor_id, area_id)
SELECT u.id, a.id FROM usuario u, area_conhecimento a
WHERE (u.email = 'ana.souza@uea.edu.br'  AND a.nome IN ('Engenharia de Software', 'Banco de Dados'))
   OR (u.email = 'bruno.lima@uea.edu.br' AND a.nome IN ('Inteligência Artificial', 'Informática na Educação'));
