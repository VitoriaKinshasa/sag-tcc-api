

-- ---------- Regras configuráveis por curso ----------
ALTER TABLE curso ADD COLUMN IF NOT EXISTS nota_minima NUMERIC(4,2) NOT NULL DEFAULT 6
    CONSTRAINT ck_curso_nota_minima CHECK (nota_minima BETWEEN 0 AND 10);           -- média mínima para aprovar
ALTER TABLE curso ADD COLUMN IF NOT EXISTS min_titulares SMALLINT NOT NULL DEFAULT 3
    CONSTRAINT ck_curso_min_titulares CHECK (min_titulares BETWEEN 2 AND 7);        -- contando o presidente (RD08)
ALTER TABLE curso ADD COLUMN IF NOT EXISTS min_suplentes SMALLINT NOT NULL DEFAULT 1
    CONSTRAINT ck_curso_min_suplentes CHECK (min_suplentes BETWEEN 0 AND 3);
ALTER TABLE curso ADD COLUMN IF NOT EXISTS dias_correcoes SMALLINT NOT NULL DEFAULT 30
    CONSTRAINT ck_curso_dias_correcoes CHECK (dias_correcoes BETWEEN 1 AND 180);   -- prazo padrão do "aprovado com correções"
ALTER TABLE curso ADD COLUMN IF NOT EXISTS notas_individuais_aluno BOOLEAN NOT NULL DEFAULT FALSE; -- o aluno vê a nota de cada membro na ata?

-- ---------- Usuário: último acesso (tela "Meus dados") ----------
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS ultimo_acesso_em  TIMESTAMPTZ;
ALTER TABLE usuario ADD COLUMN IF NOT EXISTS acesso_anterior_em TIMESTAMPTZ;

-- ---------- TCC: correções pedidas pela banca e conclusão ----------
ALTER TABLE tcc ADD COLUMN IF NOT EXISTS correcoes_pendentes BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tcc ADD COLUMN IF NOT EXISTS prazo_correcoes     DATE;
ALTER TABLE tcc ADD COLUMN IF NOT EXISTS correcoes_alerta    VARCHAR(10);    -- último aviso enviado: 3_DIAS ou ATRASO
ALTER TABLE tcc ADD COLUMN IF NOT EXISTS concluido_em        TIMESTAMPTZ;    -- entrega definitiva aprovada pelo orientador

-- ---------- Versão: declaração de autoria ----------
ALTER TABLE versao_tcc ADD COLUMN IF NOT EXISTS declaracao_autoria BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------- Banca: cancelamento, lembrete, verificação e ata assinada à mão ----------
ALTER TABLE banca ADD COLUMN IF NOT EXISTS motivo_cancelamento   TEXT;
ALTER TABLE banca ADD COLUMN IF NOT EXISTS lembrete_enviado_em   TIMESTAMPTZ;
ALTER TABLE banca ADD COLUMN IF NOT EXISTS codigo_verificacao    VARCHAR(20);
ALTER TABLE banca ADD COLUMN IF NOT EXISTS ata_digitalizada      BYTEA;           -- PDF da ata assinada à mão e escaneada
ALTER TABLE banca ADD COLUMN IF NOT EXISTS ata_digitalizada_nome VARCHAR(200);
ALTER TABLE banca ADD COLUMN IF NOT EXISTS ata_digitalizada_em   TIMESTAMPTZ;
ALTER TABLE banca ADD COLUMN IF NOT EXISTS ata_digitalizada_por  BIGINT REFERENCES usuario(id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_banca_codigo ON banca (codigo_verificacao) WHERE codigo_verificacao IS NOT NULL;

-- Assinatura eletrônica da ata: cada avaliador confirma com a própria senha.
-- O hash guarda o "retrato" da ata no momento da assinatura: se a ata mudar depois, a assinatura deixa de valer.
CREATE TABLE IF NOT EXISTS ata_assinatura (
    banca_id             BIGINT NOT NULL,
    usuario_id           BIGINT NOT NULL,
    hash_conteudo        VARCHAR(64) NOT NULL,
    assinado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (banca_id, usuario_id),
    FOREIGN KEY (banca_id, usuario_id) REFERENCES banca_membro (banca_id, usuario_id)
);

-- ---------- Registro de downloads dos arquivos do TCC ----------
CREATE TABLE IF NOT EXISTS download_versao (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    versao_id            BIGINT NOT NULL REFERENCES versao_tcc(id),
    usuario_id           BIGINT NOT NULL REFERENCES usuario(id),
    baixado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_download_versao ON download_versao (versao_id, baixado_em);

-- ---------- Declarações com código de verificação ----------
CREATE TABLE IF NOT EXISTS declaracao (
    codigo               VARCHAR(20) PRIMARY KEY,
    tipo                 VARCHAR(30) NOT NULL
        CONSTRAINT ck_declaracao_tipo CHECK (tipo IN ('PARTICIPACAO_BANCA', 'ORIENTACAO', 'FOLHA_APROVACAO')),
    usuario_id           BIGINT NOT NULL REFERENCES usuario(id),     -- para quem a declaração foi emitida
    tcc_id               BIGINT NOT NULL REFERENCES tcc(id),
    banca_id             BIGINT REFERENCES banca(id),
    dados                JSONB  NOT NULL,                             -- conteúdo da declaração no momento da emissão
    emitida_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_declaracao_unica ON declaracao (tipo, usuario_id, tcc_id);

-- ---------- E-mails enviados (simulação: o sistema ainda não envia e-mail de verdade) ----------
CREATE TABLE IF NOT EXISTS email_enviado (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    para                 VARCHAR(150) NOT NULL,
    assunto              VARCHAR(200) NOT NULL,
    texto                TEXT NOT NULL,
    enviado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_email_enviado ON email_enviado (enviado_em DESC);

-- ---------- Professores do NUCOMP ----------
-- Só alunos e coordenação ficam ligados a um curso; professores e membros de banca, não.
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS ck_usuario_curso;
ALTER TABLE usuario ADD CONSTRAINT ck_usuario_curso CHECK (perfil NOT IN ('ALUNO', 'COORDENACAO') OR curso_id IS NOT NULL);
UPDATE usuario SET curso_id = NULL WHERE perfil IN ('ORIENTADOR', 'MEMBRO_BANCA') AND curso_id IS NOT NULL;

-- Regras que valem para o NUCOMP inteiro
CREATE TABLE IF NOT EXISTS regra_nucleo (
    chave                VARCHAR(40) PRIMARY KEY,
    valor                INTEGER NOT NULL,
    atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RD05: limite TOTAL de orientandos por professor, somando todos os cursos
INSERT INTO regra_nucleo (chave, valor) VALUES ('limite_orientandos', 5) ON CONFLICT (chave) DO NOTHING;
