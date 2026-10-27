-- =====================================================================
-- SAG-TCC – Modelo físico (PostgreSQL 16) – Núcleo do sistema (TP2)
-- =====================================================================

-- ---------- Tipos enumerados ----------
CREATE TYPE perfil_usuario     AS ENUM ('COORDENACAO', 'ORIENTADOR', 'ALUNO', 'MEMBRO_BANCA');
CREATE TYPE situacao_tcc       AS ENUM ('EM_PROPOSTA', 'EM_DESENVOLVIMENTO', 'APTO_DEFESA', 'APROVADO',
                                        'APROVADO_PUBLICACAO', 'NAO_APRESENTADO', 'REPROVADO', 'CANCELADO');
CREATE TYPE visibilidade_tcc   AS ENUM ('TEXTO_COMPLETO', 'SOMENTE_METADADOS');
CREATE TYPE status_solicitacao AS ENUM ('PENDENTE', 'ACEITA', 'RECUSADA', 'CANCELADA');
CREATE TYPE status_decisao     AS ENUM ('PENDENTE', 'APROVADA', 'RECUSADA');
CREATE TYPE papel_vinculo      AS ENUM ('ORIENTADOR', 'COORIENTADOR');
CREATE TYPE tipo_reuniao       AS ENUM ('ALINHAMENTO', 'ENCONTRO');
CREATE TYPE tipo_token         AS ENUM ('PRIMEIRO_ACESSO', 'REDEFINICAO_SENHA');
CREATE TYPE operacao_auditoria AS ENUM ('INSERT', 'UPDATE', 'DELETE');

-- ---------- Cursos e áreas (RF32) ----------
CREATE TABLE curso (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome                 VARCHAR(120) NOT NULL,
    sigla                VARCHAR(10)  NOT NULL UNIQUE,
    coordenador_id       BIGINT,
    limite_orientandos   SMALLINT     NOT NULL DEFAULT 5 CHECK (limite_orientandos > 0),  -- RD05
    ativo                BOOLEAN      NOT NULL DEFAULT TRUE,
    criado_em            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE area_conhecimento (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome                 VARCHAR(120) NOT NULL UNIQUE,
    ativo                BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ---------- Usuários (RF01–RF05) ----------
CREATE TABLE usuario (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome                 VARCHAR(150) NOT NULL,
    email                VARCHAR(150) NOT NULL,
    senha_hash           VARCHAR(100),                       -- nulo até o primeiro acesso
    perfil               perfil_usuario NOT NULL,
    curso_id             BIGINT REFERENCES curso(id),
    matricula            VARCHAR(20) UNIQUE,
    externo              BOOLEAN      NOT NULL DEFAULT FALSE,  -- coorientador / membro de banca externo
    instituicao          VARCHAR(150),
    titulacao            VARCHAR(30),
    ativo                BOOLEAN      NOT NULL DEFAULT TRUE,
    tentativas_login     SMALLINT     NOT NULL DEFAULT 0,
    bloqueado_ate        TIMESTAMPTZ,                         -- RNF04
    termo_aceito_em      TIMESTAMPTZ,                         -- RNF15
    criado_em            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_usuario_matricula_aluno CHECK (perfil <> 'ALUNO' OR matricula IS NOT NULL),
    CONSTRAINT ck_usuario_curso CHECK (perfil = 'MEMBRO_BANCA' OR externo OR curso_id IS NOT NULL),
    CONSTRAINT ck_usuario_externo CHECK (NOT externo OR instituicao IS NOT NULL)
);
CREATE UNIQUE INDEX ux_usuario_email ON usuario (lower(email));

ALTER TABLE curso ADD CONSTRAINT fk_curso_coordenador FOREIGN KEY (coordenador_id) REFERENCES usuario(id);

CREATE TABLE professor_area (                               -- RF05
    professor_id         BIGINT NOT NULL REFERENCES usuario(id),
    area_id              BIGINT NOT NULL REFERENCES area_conhecimento(id),
    PRIMARY KEY (professor_id, area_id)
);

CREATE TABLE token_acesso (                                 -- RF04 e primeiro acesso
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id           BIGINT NOT NULL REFERENCES usuario(id),
    token_hash           VARCHAR(100) NOT NULL UNIQUE,
    tipo                 tipo_token   NOT NULL,
    expira_em            TIMESTAMPTZ  NOT NULL,
    usado_em             TIMESTAMPTZ
);

-- ---------- TCC (RF06, RF15, RF28) ----------
CREATE TABLE tcc (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aluno_id               BIGINT NOT NULL REFERENCES usuario(id),
    curso_id               BIGINT NOT NULL REFERENCES curso(id),
    area_id                BIGINT NOT NULL REFERENCES area_conhecimento(id),
    titulo                 VARCHAR(250) NOT NULL,
    subtitulo              VARCHAR(250),
    resumo                 TEXT NOT NULL,
    orientador_id          BIGINT REFERENCES usuario(id),
    coorientador_id        BIGINT REFERENCES usuario(id),
    situacao               situacao_tcc     NOT NULL DEFAULT 'EM_PROPOSTA',
    justificativa_situacao TEXT,
    atrasado               BOOLEAN          NOT NULL DEFAULT FALSE,     -- RF14 (TP3)
    visibilidade           visibilidade_tcc NOT NULL DEFAULT 'SOMENTE_METADADOS',
    criado_em              TIMESTAMPTZ      NOT NULL DEFAULT now(),
    atualizado_em          TIMESTAMPTZ      NOT NULL DEFAULT now(),
    CONSTRAINT ck_tcc_orientadores_distintos CHECK (coorientador_id IS NULL OR coorientador_id <> orientador_id),
    CONSTRAINT ck_tcc_justificativa CHECK (                               -- RD11
        situacao NOT IN ('NAO_APRESENTADO', 'CANCELADO', 'REPROVADO') OR justificativa_situacao IS NOT NULL)
);
-- RD01: apenas um TCC ativo por aluno e curso
CREATE UNIQUE INDEX ux_tcc_ativo_por_aluno ON tcc (aluno_id, curso_id)
    WHERE situacao IN ('EM_PROPOSTA', 'EM_DESENVOLVIMENTO', 'APTO_DEFESA');
CREATE INDEX ix_tcc_orientador ON tcc (orientador_id) WHERE orientador_id IS NOT NULL;

-- ---------- Orientação (RF07–RF09, RF33–RF35) ----------
CREATE TABLE solicitacao_orientacao (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tcc_id               BIGINT NOT NULL REFERENCES tcc(id),
    professor_id         BIGINT NOT NULL REFERENCES usuario(id),
    status               status_solicitacao NOT NULL DEFAULT 'PENDENTE',
    justificativa        TEXT,
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
    respondido_em        TIMESTAMPTZ,
    CONSTRAINT ck_solicitacao_recusa CHECK (status <> 'RECUSADA' OR justificativa IS NOT NULL)
);
-- RD04: uma solicitação pendente por vez
CREATE UNIQUE INDEX ux_solicitacao_pendente ON solicitacao_orientacao (tcc_id) WHERE status = 'PENDENTE';
CREATE INDEX ix_solicitacao_professor ON solicitacao_orientacao (professor_id, status);

CREATE TABLE vinculo_orientacao (                           -- histórico de orientadores (RD14)
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tcc_id               BIGINT NOT NULL REFERENCES tcc(id),
    professor_id         BIGINT NOT NULL REFERENCES usuario(id),
    papel                papel_vinculo NOT NULL,
    inicio               TIMESTAMPTZ   NOT NULL DEFAULT now(),
    fim                  TIMESTAMPTZ,
    CONSTRAINT ck_vinculo_periodo CHECK (fim IS NULL OR fim >= inicio)
);
CREATE UNIQUE INDEX ux_vinculo_atual ON vinculo_orientacao (tcc_id, papel) WHERE fim IS NULL;

CREATE TABLE reuniao (                                      -- RF33 e RF16
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tcc_id               BIGINT NOT NULL REFERENCES tcc(id),
    tipo                 tipo_reuniao NOT NULL,
    data_hora            TIMESTAMPTZ  NOT NULL,
    local_ou_link        VARCHAR(250),
    resumo               TEXT,
    criado_por           BIGINT NOT NULL REFERENCES usuario(id),
    criado_em            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT ck_reuniao_alinhamento CHECK (tipo <> 'ALINHAMENTO' OR local_ou_link IS NOT NULL),
    CONSTRAINT ck_reuniao_encontro    CHECK (tipo <> 'ENCONTRO' OR resumo IS NOT NULL)
);

CREATE TABLE solicitacao_troca (                            -- RF34, RD14
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tcc_id                BIGINT NOT NULL REFERENCES tcc(id),
    orientador_atual_id   BIGINT NOT NULL REFERENCES usuario(id),
    novo_orientador_id    BIGINT NOT NULL REFERENCES usuario(id),
    motivo                TEXT   NOT NULL,
    status                status_decisao NOT NULL DEFAULT 'PENDENTE',
    justificativa_decisao TEXT,
    decidido_por          BIGINT REFERENCES usuario(id),
    criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
    decidido_em           TIMESTAMPTZ,
    CONSTRAINT ck_troca_orientadores CHECK (novo_orientador_id <> orientador_atual_id),
    CONSTRAINT ck_troca_recusa CHECK (status <> 'RECUSADA' OR justificativa_decisao IS NOT NULL)
);
CREATE UNIQUE INDEX ux_troca_pendente ON solicitacao_troca (tcc_id) WHERE status = 'PENDENTE';

CREATE TABLE pedido_desistencia (                           -- RF35
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tcc_id               BIGINT NOT NULL REFERENCES tcc(id),
    motivo               TEXT   NOT NULL,
    status               status_decisao NOT NULL DEFAULT 'PENDENTE',
    decidido_por         BIGINT REFERENCES usuario(id),
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
    decidido_em          TIMESTAMPTZ
);
CREATE UNIQUE INDEX ux_desistencia_pendente ON pedido_desistencia (tcc_id) WHERE status = 'PENDENTE';

-- ---------- Histórico, notificações e auditoria ----------
CREATE TABLE evento_tcc (                                   -- RF36 (linha do tempo)
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tcc_id               BIGINT NOT NULL REFERENCES tcc(id),
    tipo                 VARCHAR(50) NOT NULL,
    descricao            TEXT        NOT NULL,
    autor_id             BIGINT REFERENCES usuario(id),     -- nulo = ação do sistema
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_evento_tcc ON evento_tcc (tcc_id, criado_em);

CREATE TABLE notificacao (                                  -- RF37
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id           BIGINT NOT NULL REFERENCES usuario(id),
    titulo               VARCHAR(150) NOT NULL,
    mensagem             TEXT         NOT NULL,
    lida                 BOOLEAN      NOT NULL DEFAULT FALSE,
    criado_em            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_notificacao_usuario ON notificacao (usuario_id, lida);

CREATE TABLE auditoria (                                    -- RF25, RD13
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id           BIGINT REFERENCES usuario(id),
    tabela               VARCHAR(60)  NOT NULL,
    registro_id          BIGINT       NOT NULL,
    operacao             operacao_auditoria NOT NULL,
    valor_anterior       JSONB,
    valor_novo           JSONB,
    criado_em            TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX ix_auditoria_registro ON auditoria (tabela, registro_id);

-- RD13: o log de auditoria não pode ser alterado nem excluído
CREATE FUNCTION fn_bloquear_auditoria() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'O log de auditoria não pode ser alterado nem excluído (RD13)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auditoria_imutavel
    BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION fn_bloquear_auditoria();

-- Atualiza tcc.atualizado_em a cada alteração
CREATE FUNCTION fn_tcc_atualizado_em() RETURNS trigger AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tcc_atualizado_em
    BEFORE UPDATE ON tcc
    FOR EACH ROW EXECUTE FUNCTION fn_tcc_atualizado_em();

-- ---------- Dados iniciais ----------
INSERT INTO curso (nome, sigla) VALUES
    ('Engenharia de Computação', 'EC'),
    ('Sistemas de Informação', 'SI'),
    ('Licenciatura em Computação', 'LC');

INSERT INTO area_conhecimento (nome) VALUES
    ('Engenharia de Software'), ('Banco de Dados'), ('Inteligência Artificial'),
    ('Redes de Computadores'), ('Informática na Educação'), ('Sistemas Embarcados');
