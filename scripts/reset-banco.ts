import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';

/**
 * npm run db:reset     -> banco limpo: só as tabelas e os usuários (para você cadastrar tudo do zero)
 * npm run db:exemplos  -> o mesmo + cenários prontos (calendário, TCCs, bancas, versões e TCC atrasado)
 */
const comCenarios = process.argv.includes('--exemplos');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Defina DATABASE_URL no arquivo .env');

const ler = (arquivo: string) => fs.readFileSync(new URL(`../database/${arquivo}`, import.meta.url), 'utf8');
const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
await cliente.query(ler('schema.sql'));
await cliente.query(ler('dados-exemplo.sql'));
if (comCenarios) await cliente.query(ler('cenarios-exemplo.sql'));
await cliente.end();
console.log(comCenarios
  ? 'Banco recriado com usuários e cenários prontos (senha de todos: Senha@123).'
  : 'Banco recriado LIMPO: só os usuários (senha de todos: Senha@123). Nenhum TCC, calendário ou banca.');
