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
6. Abra **http://localhost:3000**: aparece o **sistema (frontend em React)**, explicado abaixo.
7. A **tela de testes da API** continua em **http://localhost:3000/teste**.
8. Também dá para testar pelo VS Code, com o arquivo `docs/exemplos.http` (extensão **REST Client**).

## Sistema (frontend)
O frontend fica na pasta **`sag-tcc-web`**, ao lado desta pasta, feito em **React + TypeScript** (Vite).
A versão pronta dele é gerada dentro de `web/` (desta pasta), e a API mostra essa versão em http://localhost:3000.
Para mudar as telas, veja o `README.md` da pasta `sag-tcc-web`.

## Tela de testes
A própria API entrega uma tela simples (`public/index.html`) para testar as funcionalidades do TP2 e do TP3 sem ferramentas extras.
Com `npm run dev` rodando, abra **http://localhost:3000/teste** e entre com um dos usuários de exemplo (senha `Senha@123`).

| Perfil | O que dá para testar |
|---|---|
| Aluno(a) | Enviar e editar proposta (UC06), escolher orientador (UC07), pedir troca (UC10) e desistência (UC12), ver histórico e notificações; ver a própria defesa e convidar a audiência (UC21); ver prazos, enviar versões em PDF, ver pareceres, pedir conclusão por publicação e fazer a entrega definitiva |
| Orientador(a) | Responder solicitações (UC08), agendar reunião e registrar encontro (UC09), confirmar desistência (UC12), áreas de interesse (UC05); alterar situação do TCC (UC17), cadastrar e remarcar banca (UC19), lançar nota, registrar resultado e ver a ata (UC20); baixar versões e dar parecer |
| Membro de banca | Ver as bancas em que participa e lançar nota (UC20) |
| Coordenação | Cadastrar e desativar usuários (UC03), cursos e áreas (UC04), aprovar trocas (UC11), confirmar desistências (UC12); calendário de etapas (UC13), TCCs do curso e alterar situação (UC17); aprovar conclusão por publicação; verificar prazos na hora |
| Sem login | Agenda pública de defesas (UC21), pelo botão na tela de entrada |

Há dois jeitos de preparar o banco:
- `npm run db:reset` – banco **limpo**: só os usuários de exemplo. Você cadastra calendário, propostas, bancas etc. pela tela.
- `npm run db:salvar` – guarda uma **cópia** de todos os dados na pasta `copias` (fica fora do Git).
- `npm run db:restaurar` – volta o banco para a **cópia mais recente** (use depois de testar com o `db:exemplos`).
- `npm run db:exemplos` – o mesmo **mais cenários prontos** (arquivo `database/cenarios-exemplo.sql`):
- **Carla** (SI): defesa **já realizada** (aprovada com correções), com a ata esperando as assinaturas de Elloa, Fábio e Rafael.
  Código da ata para testar a verificação: `SAG-DEMO-ATA1`. Folha de aprovação e declaração de participação já disponíveis;
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
| POST | /api/bancas/:id/ata/assinar | Presidente e titulares | Assinatura eletrônica da ata |
| GET/POST | /api/bancas/:id/ata/digitalizada | envolvidos / Presidente, Coordenação | Ata assinada à mão (PDF) |
| PATCH | /api/bancas/:id/notas/:membroId | Coordenação | Correção de nota com justificativa |
| PATCH | /api/bancas/:id/substituir | Orientador (presidente) | Suplente assume |
| PATCH | /api/bancas/:id/cancelar | Presidente, Coordenação | Cancelar banca |
| GET | /api/bancas/:id/agenda.ics | envolvidos | Arquivo de agenda |
| GET | /api/verificar/:codigo | público (sem login) | Verificar ata ou declaração |
| GET/POST | /api/declaracoes/disponiveis, /api/declaracoes | todos | Declarações |
| GET | /api/tccs/:id/downloads | envolvidos | Quem baixou os arquivos |
| GET | /api/me, /api/me/exportar | todos | Meus dados (LGPD) |
| POST | /api/me/correcao, /api/auth/alterar-senha | todos | Pedir correção, alterar senha |
| GET | /api/relatorios, /api/emails | Coordenação | Relatórios, e-mails simulados |
| POST | /api/usuarios/importar | Coordenação | Importar alunos (planilha) |
| PUT | /api/cursos/:id/regras | Coordenação do curso | Regras do curso |

> Os e-mails ainda são simulados: aparecem no terminal e na tela **Cadastros → E-mails enviados (simulação)** da coordenação
> (nenhum e-mail de verdade é enviado). Antes de ligar um serviço de envio real, troque os e-mails dos dados de exemplo,
> porque alguns são de professores reais.

## Complementos do TP3 (documentos, privacidade e segurança)
- **Ata da defesa:** cada avaliador assina **eletronicamente com a própria senha** (assinatura simples, Lei 14.063/2020). O sistema guarda
  a "impressão digital" (hash SHA-256) da ata: se uma nota for corrigida depois, a assinatura deixa de valer e precisa ser refeita.
  Também dá para **imprimir, assinar à mão e enviar o PDF escaneado**. Toda ata ganha um **código de verificação** (ex.: SAG-7F3K-92QA),
  conferido por qualquer pessoa em `/verificar`.
- **Declarações** (participação em banca, orientação e folha de aprovação) com código de verificação.
- **Aprovado com correções:** a banca dá um prazo (ou vale o padrão do curso); o aluno envia a entrega definitiva; quando o orientador
  aprova, o TCC fica **concluído**. Prazo vencido marca o TCC como atrasado.
- **Privacidade das notas:** o aluno vê a nota final e os pareceres, mas não a nota de cada membro (o curso pode liberar). Nota lançada
  só é corrigida pela coordenação, com justificativa registrada na auditoria. Relatórios mostram só médias.
- **Segurança do TCC em andamento:** a banca baixa só a versão final; **todo download fica registrado** e o aluno vê quem baixou.
  Na versão final e na entrega definitiva o aluno marca a **declaração de autoria**.
- **Bancas:** suplente assume no lugar de um titular, cancelamento com motivo, **lembrete automático 24 h antes** e arquivo `.ics`.
- **Meus dados (LGPD):** dados da conta, acesso anterior, alterar senha, baixar todos os dados e pedir correção à coordenação.
- **Coordenação:** só vê e gerencia pessoas do próprio curso; **regras por curso** (nota mínima, titulares e suplentes da banca,
  prazo das correções, orientandos por professor, aluno ver notas individuais); **relatórios** com planilha; **importar alunos** de planilha CSV.
- **Professores do NUCOMP:** os professores não pertencem a um curso; orientam e participam de bancas de qualquer curso.
  Só alunos e coordenação ficam ligados a um curso. O limite de orientandos (RD05) é o **total** do professor, somando todos
  os cursos, e é uma regra do NUCOMP (tela Cursos, áreas e regras). A **coordenação também é professora**: orienta,
  dá parecer e participa de bancas (menu "Minha orientação").
- **Banco de dados:** as tabelas e colunas novas ficam em `database/atualizacoes.sql` e são aplicadas **sozinhas quando o servidor liga**,
  sem apagar dados (não precisa rodar o `db:reset`).

## Gerência de configuração
- Branches: `main` (versão entregue), `develop` (integração), `feature/*`, `fix/*`, `docs/*`.
- Todo código entra por **pull request** revisado por outro integrante, com os testes passando na integração contínua (`.github/workflows/ci.yml`).
- Commits no padrão `tipo(módulo): descrição (requisito)`, por exemplo `feat(orientacao): solicitar orientação (UC07, RD04)`.
- Cada entrega é marcada com uma tag: `v0.1.0` (TP1), `v0.2.0` (TP2), `v0.3.0` (TP3), `v0.4.0` (TP4), `v1.0.0` (versão final).
- Detalhes no Plano de Configuração (`docs/entregas/tp2`).
