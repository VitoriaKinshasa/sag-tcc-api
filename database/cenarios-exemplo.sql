-- ==================================================================
-- SAG-TCC – Cenários prontos para demonstração (TP3)
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

-- ==================================================================
-- Complementos do TP3: defesa JÁ REALIZADA, para testar ata, assinaturas e declarações
-- Carla (SI), orientada pela Profa. Elloa: defendeu há 3 dias e foi APROVADA COM CORREÇÕES.
--   Banca: Elloa (presidente), Prof. Fábio e Dr. Rafael (titulares), Profa. Polianny (suplente).
--   Notas: 9,0 / 8,0 / 8,5 → média 8,50. Prazo das correções: daqui a 20 dias.
--   A ata ainda NÃO foi assinada.
--   Código de verificação da ata: SAG-DEMO-ATA1.
-- ==================================================================
INSERT INTO tcc (aluno_id, curso_id, area_id, titulo, resumo, orientador_id, situacao, justificativa_situacao,
                 correcoes_pendentes, prazo_correcoes, criado_em)
SELECT al.id, al.curso_id, a.id, 'Chatbot para atendimento acadêmico da EST',
       'Este trabalho desenvolve um chatbot que responde dúvidas frequentes dos alunos sobre matrícula, estágio e TCC.',
       p.id, 'APROVADO', 'Revisar a seção de trabalhos relacionados e corrigir as referências no padrão ABNT.',
       TRUE, current_date + 20, now() - interval '120 days'
FROM usuario al, usuario p, area_conhecimento a
WHERE al.email = 'cm.snf22@uea.edu.br' AND p.email = 'ebgcosta@uea.edu.br' AND a.nome = 'Inteligência Artificial';

INSERT INTO vinculo_orientacao (tcc_id, professor_id, papel, inicio, fim)
SELECT t.id, t.orientador_id, 'ORIENTADOR', t.criado_em, now() - interval '3 days'
FROM tcc t JOIN usuario u ON u.id = t.aluno_id WHERE u.email = 'cm.snf22@uea.edu.br';

-- Qualificação e versão final (com a declaração de autoria marcada), as duas aprovadas pela orientadora
INSERT INTO versao_tcc (tcc_id, etapa, numero, comentario, arquivo_nome, arquivo_tamanho, arquivo, enviado_por, enviado_em, declaracao_autoria)
SELECT t.id, v.etapa::etapa_calendario, v.numero, v.comentario, v.nome, octet_length(modelo.arquivo), modelo.arquivo, t.aluno_id,
       now() - (v.dias || ' days')::interval, v.etapa = 'VERSAO_FINAL'
FROM tcc t JOIN usuario u ON u.id = t.aluno_id
CROSS JOIN (SELECT arquivo FROM versao_tcc ORDER BY id LIMIT 1) AS modelo
CROSS JOIN (VALUES ('QUALIFICACAO', 1, 'Introdução, referencial teórico e protótipo', 'qualificacao-chatbot.pdf', 60),
                   ('VERSAO_FINAL', 2, 'Texto completo para a banca', 'versao-final-chatbot.pdf', 10)) AS v(etapa, numero, comentario, nome, dias)
WHERE u.email = 'cm.snf22@uea.edu.br';
INSERT INTO parecer_versao (versao_id, autor_id, decisao, criado_em)
SELECT v.id, t.orientador_id, 'APROVADA', v.enviado_em + interval '2 days'
FROM versao_tcc v JOIN tcc t ON t.id = v.tcc_id JOIN usuario u ON u.id = t.aluno_id WHERE u.email = 'cm.snf22@uea.edu.br';

-- Banca realizada há 3 dias, com as notas e o resultado registrados
INSERT INTO banca (tcc_id, data_hora, local_ou_link, criado_por, status, codigo_verificacao)
SELECT t.id, ((current_date - 3)::timestamp + time '09:00') AT TIME ZONE 'America/Manaus', 'Sala 05 – EST',
       t.orientador_id, 'REALIZADA', 'SAG-DEMO-ATA1'
FROM tcc t JOIN usuario u ON u.id = t.aluno_id WHERE u.email = 'cm.snf22@uea.edu.br';

INSERT INTO banca_membro (banca_id, usuario_id, papel)
SELECT b.id, m.id, v.papel::papel_banca
FROM (VALUES ('ebgcosta@uea.edu.br', 'PRESIDENTE'), ('fssilva@uea.edu.br', 'TITULAR'),
             ('rcosta.externo@exemplo.com', 'TITULAR'), ('palima@uea.edu.br', 'SUPLENTE')) AS v(membro, papel)
JOIN usuario m ON m.email = v.membro
CROSS JOIN (SELECT b.id FROM banca b WHERE b.codigo_verificacao = 'SAG-DEMO-ATA1') AS b;

INSERT INTO nota_banca (banca_id, membro_id, nota, parecer, registrado_em)
SELECT b.id, m.id, v.nota, v.parecer, b.data_hora + interval '2 hours'
FROM (VALUES ('ebgcosta@uea.edu.br', 9.0, 'Trabalho bem desenvolvido e de grande utilidade para a EST.'),
             ('fssilva@uea.edu.br', 8.0, 'Rever os trabalhos relacionados e as referências.'),
             ('rcosta.externo@exemplo.com', 8.5, 'Boa apresentação; a avaliação com usuários pode ser ampliada.')) AS v(membro, nota, parecer)
JOIN usuario m ON m.email = v.membro
CROSS JOIN (SELECT id, data_hora FROM banca WHERE codigo_verificacao = 'SAG-DEMO-ATA1') AS b;

INSERT INTO resultado_defesa (banca_id, resultado, nota_final, observacao, registrado_por, registrado_em)
SELECT b.id, 'APROVADO_COM_CORRECOES', 8.50,
       'Revisar a seção de trabalhos relacionados e corrigir as referências no padrão ABNT.',
       t.orientador_id, b.data_hora + interval '2 hours'
FROM banca b JOIN tcc t ON t.id = b.tcc_id WHERE b.codigo_verificacao = 'SAG-DEMO-ATA1';

INSERT INTO evento_tcc (tcc_id, tipo, descricao, autor_id, criado_em)
SELECT t.id, v.tipo, v.descricao, t.orientador_id, b.data_hora + v.depois
FROM banca b JOIN tcc t ON t.id = b.tcc_id
CROSS JOIN (VALUES ('BANCA_AGENDADA', 'Banca de defesa agendada', interval '-15 days'),
                   ('RESULTADO_DEFESA', 'Resultado da defesa: Aprovado com correções – nota final 8,50. Prazo para entregar o TCC corrigido: ' ||
                     to_char(current_date + 20, 'DD/MM/YYYY'), interval '2 hours')) AS v(tipo, descricao, depois)
WHERE b.codigo_verificacao = 'SAG-DEMO-ATA1';

-- ==================================================================
-- Acervo público (UC26): TCCs de semestres anteriores, já aprovados e concluídos.
-- Nomes de alunos fictícios. Uns liberaram o texto completo, outros só os dados (UC27).
-- ==================================================================
INSERT INTO usuario (nome, email, senha_hash, perfil, curso_id, matricula, termo_aceito_em)
SELECT v.nome, v.email, '$2b$10$v4JxVsvCccxSv2GnSJkhNOXRZxjY2RCH0BZir5TyzGJq/pTvnmM0K', 'ALUNO', c.id, v.matricula, now()
FROM (VALUES
  ('Beatriz Sales (aluna)',    'bs.snf20@uea.edu.br', 'SI', '2020000011'),
  ('Rodrigo Teixeira (aluno)', 'rt.eng20@uea.edu.br', 'EC', '2020000012'),
  ('Juliana Cardoso (aluna)',  'jc.lic21@uea.edu.br', 'LC', '2021000013'),
  ('Marcos Lima (aluno)',      'ml.snf21@uea.edu.br', 'SI', '2021000014')
) AS v(nome, email, sigla, matricula)
JOIN curso c ON c.sigla = v.sigla;

INSERT INTO tcc (aluno_id, curso_id, area_id, titulo, subtitulo, resumo, orientador_id, situacao, justificativa_situacao,
                 visibilidade, criado_em, concluido_em)
SELECT al.id, al.curso_id, a.id, v.titulo, v.subtitulo, v.resumo, p.id, v.situacao::situacao_tcc, v.justificativa,
       v.visibilidade::visibilidade_tcc, v.criado::timestamptz, v.concluido::timestamptz
FROM (VALUES
  ('bs.snf20@uea.edu.br', 'ebgcosta@uea.edu.br', 'Engenharia de Software',
   'Aplicativo de caronas solidárias para estudantes da UEA', NULL,
   'Este trabalho apresenta um aplicativo para celular que ajuda estudantes da UEA a combinar caronas até os campi. O aplicativo foi desenvolvido com React Native e testado com 40 estudantes durante um mês. Os participantes avaliaram bem a facilidade de uso e o número de viagens compartilhadas cresceu ao longo do teste.',
   'APROVADO', 'Aprovado pela banca', 'TEXTO_COMPLETO', '2024-08-10', '2025-07-02'),
  ('rt.eng20@uea.edu.br', 'tmelo@uea.edu.br', 'Sistemas Embarcados',
   'Estação meteorológica de baixo custo para comunidades ribeirinhas', 'Um protótipo com ESP32 e energia solar',
   'Este trabalho desenvolve uma estação meteorológica com ESP32, sensores de baixo custo e alimentação por energia solar, para comunidades ribeirinhas do Amazonas. A estação mede temperatura, umidade, chuva e nível do rio e envia os dados por rádio LoRa. O protótipo funcionou por 60 dias sem interrupção.',
   'APROVADO', 'Aprovado pela banca', 'SOMENTE_METADADOS', '2024-08-15', '2025-12-05'),
  ('jc.lic21@uea.edu.br', 'dnoronha@uea.edu.br', 'Informática na Educação',
   'Ensino de algoritmos com computação desplugada no ensino fundamental', NULL,
   'Este trabalho avalia atividades de computação desplugada, sem uso de computador, para ensinar algoritmos a turmas do 6º ano de uma escola pública de Manaus. Foram aplicadas oito aulas e um questionário antes e depois. Os alunos melhoraram a compreensão de sequência e repetição.',
   'APROVADO_PUBLICACAO', 'Artigo publicado aceito pela coordenação', 'TEXTO_COMPLETO', '2025-02-20', '2026-03-18'),
  ('ml.snf21@uea.edu.br', 'fssilva@uea.edu.br', 'Inteligência Artificial',
   'Classificação de notícias falsas em português com aprendizado de máquina', NULL,
   'Este trabalho compara modelos de aprendizado de máquina para identificar notícias falsas escritas em português. Foram usados três conjuntos de dados públicos e quatro modelos, do mais simples ao baseado em transformers. O melhor modelo acertou 91% das notícias do conjunto de teste.',
   'APROVADO', 'Aprovado pela banca', 'TEXTO_COMPLETO', '2025-02-25', '2026-06-30')
) AS v(aluno, orientador, area, titulo, subtitulo, resumo, situacao, justificativa, visibilidade, criado, concluido)
JOIN usuario al ON al.email = v.aluno
JOIN usuario p  ON p.email  = v.orientador
JOIN area_conhecimento a ON a.nome = v.area;

INSERT INTO vinculo_orientacao (tcc_id, professor_id, papel, inicio, fim)
SELECT t.id, t.orientador_id, 'ORIENTADOR', t.criado_em, t.concluido_em
FROM tcc t JOIN usuario u ON u.id = t.aluno_id WHERE u.email IN ('bs.snf20@uea.edu.br', 'rt.eng20@uea.edu.br', 'jc.lic21@uea.edu.br', 'ml.snf21@uea.edu.br');

-- Entrega definitiva de cada um (é o PDF que pode ser baixado no acervo quando o texto completo foi liberado)
INSERT INTO versao_tcc (tcc_id, etapa, numero, comentario, arquivo_nome, arquivo_tamanho, arquivo, enviado_por, enviado_em, declaracao_autoria)
SELECT t.id, 'ENTREGA_DEFINITIVA', 1, 'Versão definitiva com as correções da banca', 'tcc-definitivo.pdf',
       octet_length(modelo.arquivo), modelo.arquivo, t.aluno_id, t.concluido_em - interval '2 days', TRUE
FROM tcc t JOIN usuario u ON u.id = t.aluno_id
CROSS JOIN (SELECT arquivo FROM versao_tcc ORDER BY id LIMIT 1) AS modelo
WHERE u.email IN ('bs.snf20@uea.edu.br', 'rt.eng20@uea.edu.br', 'jc.lic21@uea.edu.br', 'ml.snf21@uea.edu.br');

-- Juliana concluiu por publicação de artigo
INSERT INTO pedido_publicacao (tcc_id, titulo_artigo, veiculo, ano, link, status, decidido_por, criado_em, decidido_em)
SELECT t.id, 'Computação desplugada no ensino de algoritmos: um relato no ensino fundamental',
       'Anais do Workshop de Informática na Escola (WIE)', 2026, 'https://doi.org/10.0000/exemplo.wie.2026',
       'APROVADA', (SELECT id FROM usuario WHERE email = 'dvalente@uea.edu.br'), t.concluido_em - interval '20 days', t.concluido_em
FROM tcc t JOIN usuario u ON u.id = t.aluno_id WHERE u.email = 'jc.lic21@uea.edu.br';
