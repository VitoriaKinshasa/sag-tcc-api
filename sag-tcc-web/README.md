# SAG-TCC – Frontend

Telas do SAG-TCC feitas em **React + TypeScript**, com o **Vite** para rodar e gerar a versão final.
O visual segue a identidade da UEA (verde institucional) e o menu foi inspirado no Aluno Online.

## Como usar

**Só para usar o sistema**, não precisa desta pasta: ligue a API (`npm run dev` ou `npm start` na pasta `sag-tcc-api`) e abra http://localhost:3000.

**Para mudar as telas** e ver a mudança na hora:

1. Deixe a API ligada (pasta `sag-tcc-api`, `npm run dev`).
2. Em **outro terminal**, entre nesta pasta e rode na primeira vez:
   ```
   cd sag-tcc-web
   npm install
   ```
3. Depois, sempre que for mexer:
   ```
   npm run dev
   ```
4. Abra **http://localhost:5173**. Cada vez que você salvar um arquivo, a tela atualiza sozinha.
5. Quando terminar, gere a versão final (ela vai para `sag-tcc-api/web` e passa a aparecer em http://localhost:3000):
   ```
   npm run build
   ```

## Onde fica cada coisa

| Arquivo / pasta | O que tem |
|---|---|
| `src/styles.css` | Cores, fontes e todo o visual. As cores ficam no começo (`--verde`, `--azul`...). |
| `src/menu.ts` | Menu de cada perfil (aluno, orientador, membro de banca, coordenação). |
| `src/config.ts` | Liga/desliga a lista de contas de demonstração na tela de login. |
| `src/App.tsx` | Endereços das telas (rotas) e quem pode abrir cada uma. |
| `src/api.ts` | Como o frontend conversa com a API. |
| `src/util.ts` | Nomes que aparecem na tela (situações, etapas, papéis) e formatação de datas e notas. |
| `src/components/` | Peças reaproveitadas: cabeçalho e menu (`Layout.tsx`), janelas (`Modal.tsx`), campos, tabelas e selos (`ui.tsx`). |
| `src/pages/Acesso.tsx` | Login, esqueci a senha e criar senha. |
| `src/pages/Inicio.tsx` | Tela inicial de cada perfil. |
| `src/pages/aluno/` | Meu TCC, Versões, Prazos e Pedidos. |
| `src/pages/orientador/` | Solicitações, Orientandos, Cadastrar banca, Versões para parecer e Minhas áreas. |
| `src/pages/coordenacao/` | TCCs do curso, Calendário, Usuários, Cursos e áreas, Trocas e Publicações. |
| `src/pages/comum/` | Telas de mais de um perfil: Bancas e ata, Agenda, Notificações, Desistências, histórico e alterar situação. |

## Cuidados que já estão no frontend

- **Celular:** o menu vira um botão "Menu" e as tabelas viram cartões.
- **Acessibilidade:** todo campo tem rótulo, dá para usar só pelo teclado, tem o link "Pular para o conteúdo" e as animações são desligadas para quem prefere.
- **Mensagens:** os erros da API aparecem em português simples, sem códigos de regra (RD08, UC19...).
- **Sessão:** quando o login vence (30 minutos), a pessoa volta para a tela de entrada com um aviso.
- **Privacidade:** a nota de cada membro da banca só aparece na ata, depois do resultado.
- **Antes de usar de verdade:** em `src/config.ts`, troque `MOSTRAR_CONTAS_DEMO` para `false`.
