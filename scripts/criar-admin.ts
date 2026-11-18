import 'dotenv/config';
import readline from 'node:readline/promises';
import { pool, transacao } from '../src/shared/db.js';
import { aplicarAtualizacoes } from '../src/shared/atualizacoes.js';
import { registrarAuditoria } from '../src/shared/auditoria.js';
import { authService } from '../src/modules/auth/auth.service.js';

/**
 * Cria um administrador do sistema (perfil ADMINISTRADOR) e envia o link para ele criar a senha.
 * Usado uma vez, na instalação, para criar o PRIMEIRO administrador: depois disso,
 * o próprio administrador cadastra os outros pela tela de Usuários.
 *
 *   npm run criar-admin                                  (pergunta nome e e-mail)
 *   npm run criar-admin -- "Nome Completo" email@uea.edu.br
 */
const [argNome, argEmail] = process.argv.slice(2);
const pergunta = readline.createInterface({ input: process.stdin, output: process.stdout });
const nome = (argNome ?? await pergunta.question('Nome completo do administrador: ')).trim();
const email = (argEmail ?? await pergunta.question('E-mail: ')).trim().toLowerCase();
pergunta.close();

if (nome.length < 3) { console.error('Informe o nome completo.'); process.exit(1); }
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error('E-mail em formato inválido.'); process.exit(1); }

await aplicarAtualizacoes(pool); // garante que o banco já conhece o perfil ADMINISTRADOR
const { rows: existe } = await pool.query('SELECT id, perfil FROM usuario WHERE lower(email) = $1', [email]);
if (existe[0]) {
  console.error(`Já existe um usuário com este e-mail (perfil ${existe[0].perfil}). Use outro e-mail.`);
  await pool.end(); process.exit(1);
}

await transacao(async (db) => {
  const { rows } = await db.query(
    "INSERT INTO usuario (nome, email, perfil) VALUES ($1, $2, 'ADMINISTRADOR') RETURNING id, nome, email, perfil",
    [nome, email],
  );
  await registrarAuditoria(db, { usuarioId: null, tabela: 'usuario', registroId: Number(rows[0].id), operacao: 'INSERT', novo: rows[0] });
  await authService.criarLinkSenha(db, Number(rows[0].id), email, 'PRIMEIRO_ACESSO');
});
console.log(`\nAdministrador "${nome}" criado. O link para criar a senha está no e-mail acima`
  + ' (enquanto o envio de e-mail for simulado, ele aparece aqui no terminal e na tabela email_enviado).');
await pool.end();
