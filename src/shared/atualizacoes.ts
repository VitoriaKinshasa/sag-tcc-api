import fs from 'node:fs';
import type { Db } from './db.js';

/**
 * Aplica database/atualizacoes.sql (novas colunas e tabelas) sem apagar nada.
 * É chamado quando o servidor liga, então quem já tinha o banco criado não precisa rodar o db:reset.
 */
export async function aplicarAtualizacoes(db: Db) {
  const sql = fs.readFileSync(new URL('../../database/atualizacoes.sql', import.meta.url), 'utf8');
  await db.query(sql);
}
