# SAG-TCC – Sistema Automatizado de Governança de TCC

Sistema web para acompanhar o TCC do começo ao fim: proposta, orientação, prazos, versões, banca, ata, declarações e divulgação do trabalho aprovado.

Desenvolvido na disciplina de Engenharia de Software (ESTCMP025 – UEA/EST, NUCOMP) pela equipe **ByteQueens**:
Vitória Almeida, Wellyson Dias, Lenara Martins, Isadora Galvão e Laura Silveira.

Este repositório tem duas partes:

| Pasta | O que é |
|---|---|
| raiz (`src/`, `database/`, `tests/`...) | **API** em Node.js + TypeScript + PostgreSQL |
| `sag-tcc-web/` | **Frontend** em React + TypeScript (código-fonte) |
| `web/` | Versão pronta (compilada) do frontend, que a API mostra em http://localhost:3000 |
| `public/` | Tela simples de testes da API, em http://localhost:3000/teste |

---

## O que o sistema faz

| Módulo | Casos de uso | Resumo |
|---|---|---|
| Acesso e perfis | UC01 a UC05 | Login, recuperação de senha, primeiro acesso, usuários, cursos, áreas e áreas de interesse do orientador |
| Propostas e orientação | UC06 a UC12 | Proposta de TCC, pedido e aceite de orientação, reuniões, troca de orientador e desistência |
| Acompanhamento e prazos | UC13 a UC18 | Calendário de etapas, envio de versões em PDF, parecer do orientador, entrega definitiva, alertas de prazo, TCC atrasado, conclusão por publicação e mudança de situação (UC17) |
| Bancas | UC19 a UC21 | Cadastro e remarcação da banca, notas, resultado, ata e agenda pública de defesas com convites |
| Painel de governança | UC22 a UC24 | Painel da coordenação, busca e exportação de TCCs e consulta à auditoria |
| Divulgação | UC25 a UC27 | Banner do TCC (com sugestão de textos por IA), acervo público de TCCs aprovados e escolha da visibilidade |

Regras de domínio implementadas: RD01, RD02, RD03, RD04, RD05, RD07, RD08, RD09, RD10, RD11, RD13, RD14, RD15 e RN03.
Quando a API recusa uma ação, a mensagem mostra a regra (por exemplo, **Regra RD04**).

### Perfis

| Perfil | O que pode fazer |
|---|---|
| Aluno(a) | Enviar e editar proposta (UC06), escolher orientador (UC07), pedir troca (UC10) e desistência (UC12); ver prazos, enviar versões em PDF, ver pareceres, fazer a entrega definitiva e pedir conclusão por publicação; ver a própria defesa e convidar a audiência (UC21); gerar o banner (UC25) e escolher a visibilidade no acervo (UC27) |
| Orientador(a) | Responder solicitações (UC08), agendar reunião e registrar encontro (UC09), confirmar desistência (UC12), áreas de interesse (UC05); alterar situação do TCC (UC17); baixar versões e dar parecer; cadastrar e remarcar banca (UC19), lançar nota, registrar resultado e assinar a ata (UC20) |
| Membro de banca | Ver as bancas em que participa, lançar nota e assinar a ata (UC20) |
| Coordenação | Cadastrar usuários (UC03), cursos, áreas e regras do curso (UC04); aprovar trocas (UC11) e desistências (UC12); calendário de etapas (UC13); TCCs do curso e mudança de situação (UC17); aprovar conclusão por publicação; painel (UC22), busca e exportação (UC23), auditoria (UC24), relatórios e importação de alunos por planilha. A coordenação também é professora: orienta e participa de bancas (menu "Minha orientação") |
| Administrador(a) | Cadastrar coordenações e outros administradores; consultar a auditoria do sistema inteiro |
| Sem login | Agenda pública de defesas (UC21), acervo público de TCCs aprovados (UC26) e verificação de atas e declarações pelo código |

---

## Tecnologias

**API:** Node.js 20+, TypeScript, Express 5, PostgreSQL 16, Zod (validação), bcrypt (senhas), JWT (sessão de 30 min), Vitest + Supertest (testes automáticos).

**Frontend:** React 19, TypeScript, Vite, React Router e ícones Lucide.

**IA (opcional):** API da Anthropic (Claude) para sugerir os textos do banner (UC25).

---

## Como rodar

1. Instale o **Node.js 20 ou mais novo** e o **PostgreSQL 16**.
2. No pgAdmin, crie o banco `sagtcc`.
3. Copie o arquivo `.env.example` para `.env` e troque `SUA_SENHA` pela senha do seu PostgreSQL.
4. No terminal, dentro da pasta do projeto:
   ```bash
   npm install
   npm run db:reset
   npm run dev
   ```
5. Abra **http://localhost:3000**: aparece o sistema.
   Entre com um dos usuários de exemplo (senha de todos: `Senha@123`).

Outras formas de acessar:
- http://localhost:3000/api/saude – deve aparecer `{"status":"ok"}`.
- http://localhost:3000/teste – tela simples de testes da API.
- `docs/exemplos.http` – testes pelo VS Code, com a extensão **REST Client**.
- `abrir-sag-tcc.bat` – no Windows, dois cliques abrem o navegador e ligam o sistema.

> As tabelas e colunas novas ficam em `database/atualizacoes.sql` e são aplicadas **sozinhas quando o servidor liga**,
> sem apagar dados. Não precisa rodar o `db:reset` de novo depois de atualizar o código.

### Arquivo `.env`

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Endereço do banco `sagtcc` |
| `DATABASE_URL_TEST` | Endereço do banco `sagtcc_teste`, usado pelos testes |
| `JWT_SECRET` | Texto secreto usado para assinar as sessões |
| `PORT` | Porta da API (padrão 3000) |
| `APP_URL` | Endereço do sistema; com `http://localhost:3000`, os links de primeiro acesso e de recuperação de senha abrem na tela |
| `IA_CHAVE` | Opcional. Chave da API da Anthropic para o banner com IA. Sem ela, o banner funciona com preenchimento manual |
| `IA_MODELO` | Opcional. Modelo de IA usado no banner |
| `CRON_SECRET` | Só na Vercel. Senha da verificação automática de prazos (`/api/cron/prazos`) |

A chave da IA fica só no servidor, nunca vai para o navegador.

### Comandos do banco

| Comando | O que faz |
|---|---|
| `npm run db:reset` | Banco **limpo**: só os usuários de exemplo. Calendário, propostas, bancas etc. são cadastrados pela tela |
| `npm run db:exemplos` | O mesmo, **mais cenários prontos** (arquivo `database/cenarios-exemplo.sql`, explicado abaixo) |
| `npm run db:salvar` | Guarda uma **cópia** de todos os dados na pasta `copias` (fica fora do Git) |
| `npm run db:restaurar` | Volta o banco para a **cópia mais recente** (útil depois de testar com o `db:exemplos`) |
| `npm run criar-admin` | Cria o **primeiro administrador** e envia o link para ele criar a senha. Depois, o próprio administrador cadastra os outros pela tela |

### Cenários prontos (`npm run db:exemplos`)

- Calendário do semestre atual nos 3 cursos, com a etapa **Defesa** aberta por 30 dias a partir do dia em que o banco foi recriado.
- **Carla** (SI): defesa **já realizada** (aprovada com correções), com a ata esperando as assinaturas de Elloa, Fábio e Rafael.
  Código da ata para testar a verificação: `SAG-DEMO-ATA1`. Folha de aprovação e declaração de participação já disponíveis.
- **Helena** (EC): apta à defesa, orientada pelo **Prof. Tiago**, sem banca. Entre como Tiago e cadastre a banca em *Meus orientandos*.
- **Gabriel** (EC): banca de ontem (presidente: **Profa. Polianny**; titulares: Prof. Tiago e Dr. Rafael Costa, membro externo).
  Cada um lança a nota em *Bancas* e a Polianny registra o resultado.
- **Karen** (LC): defesa marcada para daqui a 7 dias, que aparece na agenda pública.
- **Lucas** (LC): orientado pelo **Prof. Almir**, entregou a Qualificação mas não a Versão final. Ao ligar a API ele aparece como
  **atrasado** e os dois recebem aviso.

A verificação de prazos roda sozinha quando a API liga e depois a cada hora.

---

## Frontend (`sag-tcc-web`)

O código das telas fica em `sag-tcc-web/src`. Para mudar as telas:

```bash
cd sag-tcc-web
npm install
npm run dev      # abre o frontend em modo de desenvolvimento
npm run build    # gera a versão pronta
```

A versão pronta vai para a pasta `web/` da API, e a API mostra essa versão em http://localhost:3000.
Se a pasta `web/` não existir, a página inicial mostra a tela de testes.

Organização das telas:
```
sag-tcc-web/src/
  components/      peças reaproveitadas (layout, modal, escolher PDF...)
  pages/
    aluno/         meu TCC, prazos, versões, minha defesa, pedidos
    orientador/    solicitações, orientandos, nova banca, versões recebidas, áreas
    coordenacao/   usuários, cursos, calendário, TCCs do curso, pedidos, relatórios, e-mails
    comum/         agenda, bancas, declarações, desistências, meus dados, notificações, verificar
```

---

## Como rodar os testes

1. No pgAdmin, crie um banco vazio chamado `sagtcc_teste` (os testes recriam as tabelas sozinhos).
2. Confira a variável `DATABASE_URL_TEST` no `.env`.
3. Rode `npm test`.

Os testes também rodam sozinhos no GitHub a cada envio (integração contínua, `.github/workflows/ci.yml`).

---

## Organização do código da API

```
src/
  config/          variáveis de ambiente
  shared/          banco, erros, auditoria, notificações, autenticação e permissões,
                   geração de PDF, planilhas, documentos, IA e atualizações do banco
  modules/
    auth/          login, recuperação de senha, primeiro acesso (UC01, UC02)
    usuarios/      gestão de usuários e áreas de interesse (UC03, UC05)
    cursos/        cursos, áreas do conhecimento e regras do curso (UC04)
    propostas/     proposta de TCC, histórico e situação (UC06, UC17)
    orientacao/    solicitação, aceite, reunião, troca e desistência (UC07 a UC12)
    calendario/    calendário de etapas (UC13)
    acompanhamento/ versões, pareceres, prazos, alertas e publicação
    bancas/        banca, notas, resultado, ata e agenda pública (UC19 a UC21)
    declaracoes/   declarações e verificação pública pelo código
    conta/         meus dados (LGPD), relatórios e e-mails simulados
    painel/        painel, busca, exportação e auditoria (UC22 a UC24)
    divulgacao/    banner, acervo público e visibilidade (UC25 a UC27)
database/          modelo físico, atualizações e dados de exemplo
scripts/           comandos do banco e criação do administrador
tests/             testes automáticos das regras
docs/              diagramas (PlantUML), exemplos de requisições e entregas
```

Cada módulo tem: `*.routes.ts` (rotas e validação de entrada), `*.service.ts` (regras de negócio)
e, quando precisa, `*.repository.ts` (acesso ao banco).

---

## Principais rotas

### Acesso e perfis
| Método | Rota | Perfil | Caso de uso |
|---|---|---|---|
| POST | /api/auth/login | todos | UC01 |
| POST | /api/auth/recuperar-senha | todos | UC02 |
| POST | /api/auth/definir-senha | todos | UC02, UC03 |
| POST | /api/auth/alterar-senha | todos | Alterar senha |
| GET/POST | /api/usuarios | Coordenação | UC03 |
| PUT | /api/usuarios/:id | Coordenação | UC03 |
| PATCH | /api/usuarios/:id/desativar | Coordenação | UC03 |
| POST | /api/usuarios/importar | Coordenação | Importar alunos (planilha) |
| GET/POST | /api/cursos, /api/areas | Coordenação | UC04 |
| PUT | /api/cursos/:id/regras | Coordenação do curso | Regras do curso |
| PUT | /api/usuarios/me/areas | Orientador | UC05 |

### Propostas e orientação
| Método | Rota | Perfil | Caso de uso |
|---|---|---|---|
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

### Acompanhamento e prazos
| Método | Rota | Perfil | Caso de uso |
|---|---|---|---|
| GET/POST | /api/calendarios | todos (consulta) / Coordenação | UC13 |
| PUT | /api/calendarios/:semestre | Coordenação | UC13 |
| GET | /api/tccs | Coordenação | UC17 |
| PATCH | /api/tccs/:id/situacao | Orientador, Coordenação | UC17 |
| GET/POST | /api/tccs/:id/versoes | envolvidos / Aluno | RF14, RF22 |
| GET | /api/tccs/:id/prazos | envolvidos | RF14 |
| GET | /api/versoes/recebidas | Orientador | RF15 |
| GET | /api/versoes/:id/arquivo | envolvidos | RF14 |
| POST | /api/versoes/:id/parecer | Orientador | RF15 |
| POST | /api/tccs/:id/publicacao | Aluno | RF21 |
| GET | /api/publicacoes/pendentes | Coordenação | RF21 |
| PATCH | /api/publicacoes/:id | Coordenação | RF21 |
| POST | /api/prazos/verificar | Coordenação | RF14 |
| GET | /api/tccs/:id/downloads | envolvidos | Quem baixou os arquivos |

### Bancas
| Método | Rota | Perfil | Caso de uso |
|---|---|---|---|
| GET | /api/bancas/membros-disponiveis | Orientador, Coordenação | UC19 |
| POST | /api/bancas | Orientador | UC19 |
| PATCH | /api/bancas/:id/remarcar | Orientador (presidente) | UC19 |
| PATCH | /api/bancas/:id/substituir | Orientador (presidente) | Suplente assume |
| PATCH | /api/bancas/:id/cancelar | Presidente, Coordenação | Cancelar banca |
| GET | /api/bancas/minhas, /api/bancas/:id | envolvidos | UC19, UC20 |
| POST | /api/bancas/:id/notas | Presidente e titulares | UC20 |
| PATCH | /api/bancas/:id/notas/:membroId | Coordenação | Correção de nota com justificativa |
| POST | /api/bancas/:id/resultado | Orientador (presidente) | UC20 |
| GET | /api/bancas/:id/ata | envolvidos | UC20 |
| POST | /api/bancas/:id/ata/assinar | Presidente e titulares | Assinatura eletrônica da ata |
| GET/POST | /api/bancas/:id/ata/digitalizada | envolvidos / Presidente, Coordenação | Ata assinada à mão (PDF) |
| GET | /api/bancas/:id/agenda.ics | envolvidos | Arquivo de agenda |
| POST | /api/bancas/:id/convites | Aluno, Orientador (presidente) | UC21 |
| GET | /api/agenda | público (sem login) | UC21 |

### Painel de governança
| Método | Rota | Perfil | Caso de uso |
|---|---|---|---|
| GET | /api/painel | Coordenação | UC22 |
| GET | /api/busca/tccs | Coordenação | UC23 |
| GET | /api/busca/tccs/exportar | Coordenação | UC23 |
| GET | /api/auditoria, /api/auditoria/:id | Coordenação, Administrador | UC24 |
| GET | /api/relatorios | Coordenação | Relatórios |
| GET | /api/emails | Coordenação, Administrador | E-mails simulados |

### Divulgação
| Método | Rota | Perfil | Caso de uso |
|---|---|---|---|
| GET | /api/tccs/:id/banner | Aluno | UC25 |
| POST | /api/tccs/:id/banner/sugestao | Aluno | UC25 (sugestão por IA) |
| POST | /api/tccs/:id/banner | Aluno | UC25 (gerar PDF e PNG) |
| GET | /api/tccs/:id/banner/:bannerId/:tipo | Aluno, Orientador do TCC | UC25 (baixar) |
| GET | /api/acervo, /api/acervo/:id | público (sem login) | UC26 |
| GET | /api/acervo/:id/pdf | público (sem login) | UC26 |
| PUT | /api/tccs/:id/visibilidade | Aluno, Orientador, Coordenação | UC27 |
| GET | /api/orientacao/aprovados | Orientador, Coordenação | UC27 |

### Documentos e conta
| Método | Rota | Perfil | Caso de uso |
|---|---|---|---|
| GET/POST | /api/declaracoes/disponiveis, /api/declaracoes | todos | Declarações |
| GET | /api/verificar/:codigo | público (sem login) | Verificar ata ou declaração |
| GET | /api/me, /api/me/exportar | todos | Meus dados (LGPD) |
| POST | /api/me/correcao | todos | Pedir correção dos dados |
| GET | /api/notificacoes | todos | RF37 |

> Os e-mails ainda são **simulados**: aparecem no terminal e na tela **Cadastros → E-mails enviados (simulação)** da coordenação
> (nenhum e-mail de verdade é enviado). Antes de ligar um serviço de envio real, troque os e-mails dos dados de exemplo,
> porque alguns são de professores reais.

---

## Detalhes importantes das regras

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
  os cursos, e é uma regra do NUCOMP (tela Cursos, áreas e regras).
- **Banner com IA (UC25):** só para TCC aprovado. Segue as normas de pôster: **90 × 120 cm**, título em fonte 60, nomes em 40,
  instituição e área temática em 48, títulos das seções em 54 e corpo em 35 (tudo em caixa alta e negrito onde a norma pede) e
  referências em 30. Tem as seções Introdução, Objetivos, Metodologia da pesquisa, Resultados e/ou discussão, Conclusões,
  Agradecimentos (opcional) e Referências, com a logo da UEA no topo e as cores verdes da universidade.
  O aluno coloca **figuras** (até 2 por seção, 6 no total) com legenda e fonte; a norma exige pelo menos uma.
  A IA sugere só os textos das seções e recebe **apenas dados públicos** do trabalho (título, resumo, área, curso, autor,
  orientador e ano), nunca matrícula, e-mail, notas ou arquivos. **Referências, agradecimentos e coautores são sempre preenchidos
  pelo aluno**, para a IA não inventar referências. Sem a chave `IA_CHAVE`, ou se a IA não responder em 30 segundos, o aluno
  preenche tudo à mão. O banner sai em **PDF** (para a gráfica) e em **imagem JPG** (para divulgar).
- **Acervo público (UC26/UC27):** o aluno (ou o orientador) escolhe se o TCC aprovado aparece no acervo e se mostra só os dados ou o texto completo.

---

## Publicar na Vercel

O sistema inteiro (API + telas) roda na Vercel, com o banco PostgreSQL na **Neon**.
Os arquivos que preparam isso são o `vercel.json` e o `scripts/preparar-vercel.mjs`, que roda só na Vercel e copia as telas
para a pasta `public/` (a Vercel não usa o `express.static`). No computador, nada muda.

1. Em https://vercel.com, entre com o GitHub e clique em **Add New → Project**. Escolha o repositório `sag-tcc-api`.
   O tipo de projeto deve aparecer como **Express**. Ainda não clique em Deploy.
2. Em **Environment Variables**, cadastre `JWT_SECRET`, `CRON_SECRET` (um texto longo qualquer) e, se quiser, `IA_CHAVE`.
   Clique em **Deploy**.
3. No projeto criado, vá em **Storage → Create Database → Neon** e ligue o banco ao projeto.
   A Vercel cria a variável `DATABASE_URL` sozinha.
4. Copie o endereço do banco (aba do banco → `DATABASE_URL`) e, no computador, crie as tabelas no banco da Neon:
   ```
   set "DATABASE_URL=endereço-copiado"
   npm run db:exemplos
   ```
   (`db:exemplos` traz os cenários prontos; use `db:reset` para começar limpo.)
   Depois **feche esse terminal**, para o `npm run dev` não usar o banco da Neon sem querer.
5. Em **Settings → Environment Variables**, cadastre `APP_URL` com o endereço do site (ex.: `https://sag-tcc-api.vercel.app`).
   Depois, em **Deployments**, clique nos três pontinhos do último e em **Redeploy**.

Cada `git push` na `main` publica uma versão nova sozinho.

Diferenças em relação ao computador:
- A verificação de prazos roda **uma vez por dia** (Cron Job da Vercel, plano gratuito), e não a cada hora.
  A coordenação pode verificar na hora pelo botão da tela.
- A Vercel aceita no máximo **4,5 MB** por envio e por resposta. PDFs maiores que cerca de 3 MB não sobem (o arquivo vai em base64,
  que aumenta o tamanho), e downloads maiores que 4,5 MB não abrem.
- As atualizações do banco (`database/atualizacoes.sql`) não são aplicadas sozinhas: quando o arquivo mudar, copie o conteúdo dele
  e rode no **SQL Editor** da Neon (ele não apaga dados).

---

## Gerência de configuração

- Branches: `main` (versão entregue), `develop` (integração), `feature/*`, `fix/*`, `docs/*`.
- Todo código entra por **pull request** revisado por outro integrante, com os testes passando na integração contínua (`.github/workflows/ci.yml`).
- Commits no padrão `tipo(módulo): descrição (requisito)`, por exemplo `feat(orientacao): solicitar orientação (UC07, RD04)`.
- Cada entrega é marcada com uma tag: `v0.1.0` (TP1), `v0.2.0` (TP2), `v0.3.0` (TP3), `v0.4.0` (TP4), `v1.0.0` (versão final).
- Detalhes no Plano de Configuração (`docs/entregas/tp2`).
