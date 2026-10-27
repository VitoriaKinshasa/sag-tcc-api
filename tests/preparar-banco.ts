import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';

/** Recria o banco de TESTE do zero antes dos testes, usando o mesmo script do modelo físico. */
export default async function () {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('Defina DATABASE_URL_TEST no arquivo .env');
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await cliente.query(fs.readFileSync(new URL('../database/schema.sql', import.meta.url), 'utf8'));
  await cliente.end();
}
