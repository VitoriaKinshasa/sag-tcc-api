import pg from 'pg';
import { env } from '../config/env.js';

// Os ids são BIGINT; por padrão o driver devolve BIGINT como texto. Aqui convertemos para número.
pg.types.setTypeParser(pg.types.builtins.INT8, (valor) => Number.parseInt(valor, 10));

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

/** Conexão usada pelos repositórios (pode ser o pool ou um cliente dentro de transação). */
export type Db = pg.Pool | pg.PoolClient;

/** Executa várias operações como uma unidade: ou tudo é gravado, ou nada é. */
export async function transacao<T>(fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  } finally {
    cliente.release();
  }
}
