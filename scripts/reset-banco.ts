import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';

/**
 * Apaga e recria o banco de DESENVOLVIMENTO (DATABASE_URL) com as tabelas e os usuários de exemplo.
 * Uso: npm run db:reset
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Defina DATABASE_URL no arquivo .env');

const ler = (arquivo: string) => fs.readFileSync(new URL(`../database/${arquivo}`, import.meta.url), 'utf8');
const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
await cliente.query(ler('schema.sql'));
await cliente.query(ler('dados-exemplo.sql'));
await cliente.end();
console.log('Banco recriado com as tabelas e os usuários de exemplo (senha de todos: Senha@123).');
