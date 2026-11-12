# SAG-TCC – Sistema Automatizado de Governança de TCC (API)

API REST do SAG-TCC, desenvolvida na disciplina de Engenharia de Software (ESTCMP025 – UEA/EST, NUCOMP).
Equipe ByteQueens: Vitória Almeida, Wellyson Dias, Lenara Martins, Isadora Galvão e Laura Silveira.

O TP2 implementou os módulos **Acesso e Perfis** e **Propostas e Orientação** (RF01 a RF09 e RF32 a RF35),
com as regras de domínio RD01, RD02, RD03, RD04, RD05, RD10, RD11, RD13, RD14 e RD15.

O TP3 acrescenta o **calendário de etapas** (UC13), a **mudança de situação do TCC** (UC17) e o módulo de **bancas**:
cadastrar banca (UC19), registrar notas e resultado com ata (UC20) e agenda pública de defesas com convites (UC21),
com as regras RD07, RD08, RD09, RD10, RD11 e RN03.
Também traz o **acompanhamento**: envio de versões em PDF, parecer do orientador, entrega definitiva (versão final),
alertas automáticos 7 dias e 1 dia antes de cada prazo, marcação de TCC atrasado e conclusão por publicação de artigo.

## Tecnologias
- Node.js 20+ e TypeScript
- Express 5 (API REST)
- PostgreSQL 16
- Zod (validação), bcrypt (senhas), JWT (sessão de 30 min)
- Vitest + Supertest (testes automáticos)

## Como rodar
1. Instale o **Node.js 20 ou mais novo** e o **PostgreSQL 16**.
2. No pgAdmin, crie o banco `sagtcc` e rode, nesta ordem:
   - `database/schema.sql` (cria as tabelas)
   - `database/dados-exemplo.sql` (cria usuários de exemplo; senha de todos: `Senha@123`)
3. Copie o arquivo `.env.example` para `.env` e troque `SUA_SENHA` pela senha do seu PostgreSQL.
4. No terminal, dentro da pasta do projeto:
   ```bash
   npm install
   npm run dev
   ```
5. Acesse http://localhost:3000/api/saude – deve aparecer `{"status":"ok"}`.
6. Para testar as funcionalidades pelo navegador, abra http://localhost:3000 (tela de testes, explicada abaixo).
7. Também dá para testar pelo VS Code, com o arquivo `docs/exemplos.http` (extensão **REST Client**).

## Tela de testes
A própria API entrega uma tela simples (`public/index.html`) para testar as funcionalidades do TP2 e do TP3 sem ferramentas extras.
Com `npm run dev` rodando, abra **http://localhost:3000** e entre com um dos usuários de exemplo (senha `Senha@123`).

| Perfil | O que dá para testar |
|---|---|
| Aluno(a) | Enviar e editar proposta (UC06), escolher orientador (UC07), pedir troca (UC10) e desistência (UC12), ver histórico e notificações; ver a própria defesa e convidar a audiência (UC21); ver prazos, enviar versões em PDF, ver pareceres, pedir conclusão por publicação e fazer a entrega definitiva |
| Orientador(a) | Responder solicitações (UC08), agendar reunião e registrar encontro (UC09), confirmar desistência (UC12), áreas de interesse (UC05); alterar situação do TCC (UC17), cadastrar e remarcar banca (UC19), lançar nota, registrar resultado e ver a ata (UC20); baixar versões e dar parecer |
| Membro de banca | Ver as bancas em que participa e lançar nota (UC20) |
| Coordenação | Cadastrar e desativar usuários (UC03), cursos e áreas (UC04), aprovar trocas (UC11), confirmar desistências (UC12); calendário de etapas (UC13), TCCs do curso e alterar situação (UC17); aprovar conclusão por publicação; verificar prazos na hora |
| Sem login | Agenda pública de defesas (UC21), pelo botão na tela de entrada |

Há dois jeitos de preparar o banco:
- `npm run db:reset` – banco **limpo**: só os usuários de exemplo. Você cadastra calendário, propostas, bancas etc. pela tela.
- `npm run db:exemplos` – o mesmo **mais cenários prontos** (arquivo `database/cenarios-exemplo.sql`):
- calendário do semestre atual nos 3 cursos, com a etapa **Defesa** aberta por 30 dias a partir do dia em que o banco foi recriado;
- **Helena** (EC) apta à defesa, orientada pelo **Prof. Tiago**, sem banca: entre como Tiago e cadastre a banca em *Meus orientandos*;
- **Gabriel** (EC) com a banca de ontem (presidente: **Profa. Polianny**; titulares: Prof. Tiago e Dr. Rafael Costa, membro externo): cada um lança a nota em *Bancas* e a Polianny registra o resultado;
- **Karen** (LC) com defesa marcada para daqui a 7 dias, que aparece na agenda pública;
- **Lucas** (LC), orientado pelo **Prof. Almir**, entregou a Qualificação mas não a Versão final: ao ligar a API ele aparece como **atrasado** e os dois recebem aviso.

A verificação de prazos roda sozinha quando a API liga e depois a cada hora.

Quando a API recusa uma ação, a tela mostra a mensagem e a regra (por exemplo, **Regra RD04**). Na barra de baixo, **Registro da API** mostra o que foi enviado e o que a API respondeu.
Para o link de primeiro acesso e de recuperação de senha abrirem na tela, use `APP_URL=http://localhost:3000` no `.env`.

## Como rodar os testes
1. No pgAdmin, crie um banco vazio chamado `sagtcc_teste` (os testes recriam as tabelas sozinhos).
2. Confira a variável `DATABASE_URL_TEST` no `.env`.
3. Rode `npm test`.

## Organização do código
```
src/
  config/        variáveis de ambiente
  shared/        banco, erros, auditoria, notificações, autenticação e permissões
  modules/
    auth/        login, recuperação de senha, primeiro acesso (UC01, UC02)
    usuarios/    gestão de usuários e áreas de interesse (UC03, UC05)
    cursos/      cursos e áreas do conhecimento (UC04)
    propostas/   proposta de TCC e histórico (UC06)
    orientacao/  solicitação, aceite, reunião, troca e desistência (UC07 a UC12)
database/        script do modelo físico e dados de exemplo
tests/           testes automáticos das regras
```
Cada módulo tem: `*.routes.ts` (rotas e validação de entrada), `*.service.ts` (regras de negócio)
e `*.repository.ts` (acesso ao banco).

## Principais rotas
| Método | Rota | Perfil | Caso de uso |
|---|---|---|---|
| POST | /api/auth/login | todos | UC01 |
| POST | /api/auth/recuperar-senha | todos | UC02 |
| POST | /api/auth/definir-senha | todos | UC02, UC03 |
| GET/POST | /api/usuarios | Coordenação | UC03 |
| PUT | /api/usuarios/:id | Coordenação | UC03 |
| PATCH | /api/usuarios/:id/desativar | Coordenação | UC03 |
| GET/POST | /api/cursos, /api/areas | Coordenação | UC04 |
| PUT | /api/usuarios/me/areas | Orientador | UC05 |
| POST | /api/tccs | Aluno | UC06 |
| PUT | /api/tccs/:id | Aluno | UC06 |
| GET | /api/tccs/:id/historico | envolvidos | RF36 |
| GET | /api/orientacao/orientadores | todos | UC07 |
| POST | /api/orientacao/solicitacoes | Aluno | UC07 |
| PATCH | /api/orientacao/solicitacoes/:id | Orientador | UC08 |
| POST | /api/orientacao/tccs/:id/reunioes | Orientador | UC09 |
| POST | /api/orientacao/tccs/:id/encontros | Orientador | UC09 |
| POST | /api/orientacao/trocas | Aluno | UC10 |
| PATCH | /api/orientacao/trocas/:id | Coordenação | UC11 |
| POST | /api/orientacao/desistencias | Aluno | UC12 |
| PATCH | /api/orientacao/desistencias/:id | Orientador, Coordenação | UC12 |
| GET | /api/notificacoes | todos | RF37 |
| GET/POST | /api/calendarios | todos (consulta) / Coordenação | UC13 |
| PUT | /api/calendarios/:semestre | Coordenação | UC13 |
| GET | /api/tccs | Coordenação | UC17 |
| PATCH | /api/tccs/:id/situacao | Orientador, Coordenação | UC17 |
| GET | /api/bancas/membros-disponiveis | Orientador, Coordenação | UC19 |
| POST | /api/bancas | Orientador | UC19 |
| PATCH | /api/bancas/:id/remarcar | Orientador (presidente) | UC19 |
| GET | /api/bancas/minhas, /api/bancas/:id | envolvidos | UC19, UC20 |
| POST | /api/bancas/:id/notas | Presidente e titulares | UC20 |
| POST | /api/bancas/:id/resultado | Orientador (presidente) | UC20 |
| GET | /api/bancas/:id/ata | envolvidos | UC20 |
| POST | /api/bancas/:id/convites | Aluno, Orientador (presidente) | UC21 |
| GET | /api/agenda | público (sem login) | UC21 |
| GET/POST | /api/tccs/:id/versoes | envolvidos / Aluno | RF14, RF22 |
| GET | /api/tccs/:id/prazos | envolvidos | RF14 |
| GET | /api/versoes/recebidas | Orientador | RF15 |
| GET | /api/versoes/:id/arquivo | envolvidos | RF14 |
| POST | /api/versoes/:id/parecer | Orientador | RF15 |
| POST | /api/tccs/:id/publicacao | Aluno | RF21 |
| GET | /api/publicacoes/pendentes | Coordenação | RF21 |
| PATCH | /api/publicacoes/:id | Coordenação | RF21 |
| POST | /api/prazos/verificar | Coordenação | RF14 |

> Os e-mails ainda são exibidos só no terminal (nenhum e-mail de verdade é enviado). Antes de ligar um serviço de envio real,
> troque os e-mails dos dados de exemplo, porque alguns são de professores reais.

## Gerência de configuração
- Branches: `main` (versão entregue), `develop` (integração), `feature/*`, `fix/*`, `docs/*`.
- Todo código entra por **pull request** revisado por outro integrante, com os testes passando na integração contínua (`.github/workflows/ci.yml`).
- Commits no padrão `tipo(módulo): descrição (requisito)`, por exemplo `feat(orientacao): solicitar orientação (UC07, RD04)`.
- Cada entrega é marcada com uma tag: `v0.1.0` (TP1), `v0.2.0` (TP2), `v0.3.0` (TP3), `v0.4.0` (TP4), `v1.0.0` (versão final).
- Detalhes no Plano de Configuração (`docs/entregas/tp2`).
