-- ==================================================================
-- SAG-TCC – Cenários prontos para demonstração (TP3)
-- Opcional: só é carregado com "npm run db:exemplos".
-- Cria o calendário do semestre, TCCs aptos à defesa, bancas, versões e um TCC atrasado.
-- Rodar DEPOIS de schema.sql e dados-exemplo.sql.
-- ==================================================================

-- Calendário do semestre atual para os 3 cursos (datas contadas a partir de hoje,
-- para a etapa Defesa estar sempre aberta quando o banco for recriado)
INSERT INTO calendario_etapa (curso_id, semestre, etapa, data_inicio, data_limite)
SELECT c.id,
       to_char(current_date, 'YYYY') || '.' || CASE WHEN extract(month FROM current_date) <= 6 THEN '1' ELSE '2' END,
       e.etapa::etapa_calendario, current_date + e.inicio, current_date + e.limite
FROM curso c
CROSS JOIN (VALUES ('PROPOSTA', -100, -71), ('QUALIFICACAO', -70, -41), ('VERSAO_FINAL', -40, -1),
                   ('DEFESA', 0, 30), ('ENTREGA_DEFINITIVA', 31, 40)) AS e(etapa, inicio, limite);

-- TCCs "Aptos à defesa" em EC e LC
INSERT INTO tcc (aluno_id, curso_id, area_id, titulo, resumo, orientador_id, situacao)
SELECT al.id, al.curso_id, a.id, v.titulo, v.resumo, p.id, 'APTO_DEFESA'
FROM (VALUES
  ('hp.eng22@uea.edu.br', 'tmelo@uea.edu.br',    'Sistemas Embarcados',
   'Monitoramento do nível de rios com sensores de baixo custo',
   'Este trabalho desenvolve um sistema de sensores de baixo custo para monitorar o nível dos rios no Amazonas.'),
  ('gn.eng22@uea.edu.br', 'palima@uea.edu.br',   'Inteligência Artificial',
   'Visão computacional para contagem de peixes em tanques de piscicultura',
   'Este trabalho aplica redes neurais para contar peixes em imagens de tanques de piscicultura.'),
  ('ko.lic22@uea.edu.br', 'dnoronha@uea.edu.br', 'Informática na Educação',
   'Jogos digitais no ensino de lógica de programação no ensino médio',
   'Este trabalho avalia o uso de jogos digitais para ensinar lógica de programação em escolas públicas.')
) AS v(aluno, orientador, area, titulo, resumo)
JOIN usuario al ON al.email = v.aluno
JOIN usuario p  ON p.email  = v.orientador
JOIN area_conhecimento a ON a.nome = v.area;

INSERT INTO vinculo_orientacao (tcc_id, professor_id, papel)
SELECT id, orientador_id, 'ORIENTADOR' FROM tcc WHERE situacao = 'APTO_DEFESA';

INSERT INTO evento_tcc (tcc_id, tipo, descricao, autor_id)
SELECT id, 'SITUACAO_ALTERADA', 'Situação alterada de Em desenvolvimento para Apto à defesa', orientador_id
FROM tcc WHERE situacao = 'APTO_DEFESA';

-- Banca do Gabriel (EC): aconteceu ontem, falta registrar as notas e o resultado (UC20)
-- Banca da Karen (LC): marcada para daqui a 7 dias, aparece na agenda pública (UC21)
INSERT INTO banca (tcc_id, data_hora, local_ou_link, criado_por)
SELECT t.id, v.quando, v.local, t.orientador_id
FROM (VALUES
  ('gn.eng22@uea.edu.br', ((current_date - 1)::timestamp + time '10:00') AT TIME ZONE 'America/Manaus', 'Auditório da EST'),
  ('ko.lic22@uea.edu.br', ((current_date + 7)::timestamp + time '14:00') AT TIME ZONE 'America/Manaus', 'Sala 12 – EST')
) AS v(aluno, quando, local)
JOIN usuario al ON al.email = v.aluno
JOIN tcc t ON t.aluno_id = al.id AND t.situacao = 'APTO_DEFESA';

INSERT INTO banca_membro (banca_id, usuario_id, papel)
SELECT b.id, m.id, v.papel::papel_banca
FROM (VALUES
  ('gn.eng22@uea.edu.br', 'palima@uea.edu.br',          'PRESIDENTE'),
  ('gn.eng22@uea.edu.br', 'tmelo@uea.edu.br',           'TITULAR'),
  ('gn.eng22@uea.edu.br', 'rcosta.externo@exemplo.com', 'TITULAR'),
  ('gn.eng22@uea.edu.br', 'adjunior@uea.edu.br',        'SUPLENTE'),
  ('ko.lic22@uea.edu.br', 'dnoronha@uea.edu.br',        'PRESIDENTE'),
  ('ko.lic22@uea.edu.br', 'adjunior@uea.edu.br',        'TITULAR'),
  ('ko.lic22@uea.edu.br', 'ebgcosta@uea.edu.br',        'TITULAR'),
  ('ko.lic22@uea.edu.br', 'tmelo@uea.edu.br',           'SUPLENTE')
) AS v(aluno, membro, papel)
JOIN usuario al ON al.email = v.aluno
JOIN tcc t ON t.aluno_id = al.id
JOIN banca b ON b.tcc_id = t.id
JOIN usuario m ON m.email = v.membro;

INSERT INTO evento_tcc (tcc_id, tipo, descricao, autor_id)
SELECT b.tcc_id, 'BANCA_AGENDADA', 'Banca de defesa agendada', b.criado_por FROM banca b;

-- ==================================================================
-- TP3 – Acompanhamento: versões, pareceres e TCC atrasado
-- ==================================================================

-- Os TCCs aptos à defesa começaram há 90 dias e já entregaram Qualificação e Versão final
UPDATE tcc SET criado_em = now() - interval '90 days' WHERE situacao = 'APTO_DEFESA';

-- Lucas (LC), orientado pelo Prof. Almir: entregou a Qualificação, mas NÃO entregou a Versão final,
-- cujo prazo terminou ontem. Ao ligar a API, a verificação de prazos marca o TCC como atrasado e avisa os dois.
INSERT INTO tcc (aluno_id, curso_id, area_id, titulo, resumo, orientador_id, situacao, criado_em)
SELECT al.id, al.curso_id, a.id, 'Robótica educacional com Arduino nas escolas de Manaus',
       'Este trabalho investiga o uso de kits de robótica com Arduino para ensinar pensamento computacional.',
       p.id, 'EM_DESENVOLVIMENTO', now() - interval '90 days'
FROM usuario al, usuario p, area_conhecimento a
WHERE al.email = 'lf.lic22@uea.edu.br' AND p.email = 'adjunior@uea.edu.br' AND a.nome = 'Informática na Educação';

INSERT INTO vinculo_orientacao (tcc_id, professor_id, papel, inicio)
SELECT t.id, t.orientador_id, 'ORIENTADOR', t.criado_em FROM tcc t JOIN usuario u ON u.id = t.aluno_id
WHERE u.email = 'lf.lic22@uea.edu.br';

-- Versões em PDF (arquivo de exemplo de 1 página)
INSERT INTO versao_tcc (tcc_id, etapa, numero, comentario, arquivo_nome, arquivo_tamanho, arquivo, enviado_por, enviado_em)
SELECT t.id, v.etapa::etapa_calendario, v.numero, v.comentario, v.nome, length(decode('JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMjUgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3NjAgVGQgKFNBRy1UQ0MgLSBhcnF1aXZvIGRlIGV4ZW1wbG8pIFRqIDAgLTI4IFRkIC9GMSAxMiBUZiAoVmVyc2FvIGRvIFRDQyB1c2FkYSBub3MgZGFkb3MgZGUgZXhlbXBsby4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwNDE3IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDg3CiUlRU9GCg==', 'base64')),
       decode('JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMjUgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3NjAgVGQgKFNBRy1UQ0MgLSBhcnF1aXZvIGRlIGV4ZW1wbG8pIFRqIDAgLTI4IFRkIC9GMSAxMiBUZiAoVmVyc2FvIGRvIFRDQyB1c2FkYSBub3MgZGFkb3MgZGUgZXhlbXBsby4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwNDE3IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDg3CiUlRU9GCg==', 'base64'), t.aluno_id, now() - (v.dias || ' days')::interval
FROM tcc t
CROSS JOIN (VALUES ('QUALIFICACAO', 1, 'Introdução, referencial teórico e metodologia', 'qualificacao.pdf', 45),
                   ('VERSAO_FINAL', 2, 'Texto completo para a banca', 'versao-final.pdf', 3)) AS v(etapa, numero, comentario, nome, dias)
WHERE t.situacao = 'APTO_DEFESA'
UNION ALL
SELECT t.id, 'QUALIFICACAO', 1, 'Introdução e referencial teórico', 'qualificacao.pdf', length(decode('JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMjUgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3NjAgVGQgKFNBRy1UQ0MgLSBhcnF1aXZvIGRlIGV4ZW1wbG8pIFRqIDAgLTI4IFRkIC9GMSAxMiBUZiAoVmVyc2FvIGRvIFRDQyB1c2FkYSBub3MgZGFkb3MgZGUgZXhlbXBsby4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwNDE3IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDg3CiUlRU9GCg==', 'base64')),
       decode('JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA1OTUgODQyXSAvQ29udGVudHMgNCAwIFIgL1Jlc291cmNlcyA8PCAvRm9udCA8PCAvRjEgNSAwIFIgPj4gPj4gPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAxMjUgPj4Kc3RyZWFtCkJUIC9GMSAxOCBUZiA3MiA3NjAgVGQgKFNBRy1UQ0MgLSBhcnF1aXZvIGRlIGV4ZW1wbG8pIFRqIDAgLTI4IFRkIC9GMSAxMiBUZiAoVmVyc2FvIGRvIFRDQyB1c2FkYSBub3MgZGFkb3MgZGUgZXhlbXBsby4pIFRqIEVUCmVuZHN0cmVhbQplbmRvYmoKNSAwIG9iago8PCAvVHlwZSAvRm9udCAvU3VidHlwZSAvVHlwZTEgL0Jhc2VGb250IC9IZWx2ZXRpY2EgPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0MSAwMDAwMCBuIAowMDAwMDAwNDE3IDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgNiAvUm9vdCAxIDAgUiA+PgpzdGFydHhyZWYKNDg3CiUlRU9GCg==', 'base64'), t.aluno_id, now() - interval '42 days'
FROM tcc t JOIN usuario u ON u.id = t.aluno_id WHERE u.email = 'lf.lic22@uea.edu.br';

INSERT INTO parecer_versao (versao_id, autor_id, decisao, texto, criado_em)
SELECT v.id, t.orientador_id,
       CASE WHEN t.situacao = 'APTO_DEFESA' THEN 'APROVADA' ELSE 'AJUSTES' END::decisao_parecer,
       CASE WHEN t.situacao = 'APTO_DEFESA' THEN NULL ELSE 'Detalhar melhor a metodologia e incluir o cronograma de aplicação nas escolas.' END,
       v.enviado_em + interval '2 days'
FROM versao_tcc v JOIN tcc t ON t.id = v.tcc_id;

INSERT INTO evento_tcc (tcc_id, tipo, descricao, autor_id, criado_em)
SELECT v.tcc_id, 'VERSAO_ENVIADA', 'Versão ' || v.numero || ' enviada (' || CASE v.etapa WHEN 'QUALIFICACAO' THEN 'Qualificação' ELSE 'Versão final' END || ')',
       v.enviado_por, v.enviado_em
FROM versao_tcc v;
