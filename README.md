# SAG-TCC – Sistema Automatizado de Governança de TCC (API)

API REST do SAG-TCC, desenvolvida na disciplina de Engenharia de Software (ESTCMP025 – UEA/EST, NUCOMP).
Equipe ByteQueens: Vitória Almeida, Wellyson Dias, Lenara Martins, Isadora Galvão e Laura Silveira.

Esta versão (TP2) implementa os módulos **Acesso e Perfis** e **Propostas e Orientação** (RF01 a RF09 e RF32 a RF35),
com as regras de domínio RD01, RD02, RD03, RD04, RD05, RD10, RD11, RD13, RD14 e RD15.

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
6. Para testar as funcionalidades, abra `docs/exemplos.http` no VS Code (extensão **REST Client**).

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

> Nesta versão os e-mails são exibidos no terminal. O envio real será ligado no TP3.

## Gerência de configuração
- Branches: `main` (versão entregue), `develop` (integração), `feature/*`, `fix/*`, `docs/*`.
- Todo código entra por **pull request** revisado por outro integrante, com os testes passando na integração contínua (`.github/workflows/ci.yml`).
- Commits no padrão `tipo(módulo): descrição (requisito)`, por exemplo `feat(orientacao): solicitar orientação (UC07, RD04)`.
- Cada entrega é marcada com uma tag: `v0.1.0` (TP1), `v0.2.0` (TP2), `v0.3.0` (TP3), `v0.4.0` (TP4), `v1.0.0` (versão final).
- Detalhes no Plano de Configuração (`docs/entregas/tp2`).
