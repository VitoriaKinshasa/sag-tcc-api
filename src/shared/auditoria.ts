import type { Db } from './db.js';

type Operacao = 'INSERT' | 'UPDATE' | 'DELETE';

/** RF25 – registra toda inclusão, alteração e exclusão (quem, quando, o quê, valor anterior e novo). */
export async function registrarAuditoria(
  db: Db,
  dados: { usuarioId: number | null; tabela: string; registroId: number; operacao: Operacao; anterior?: unknown; novo?: unknown },
): Promise<void> {
  await db.query(
    `INSERT INTO auditoria (usuario_id, tabela, registro_id, operacao, valor_anterior, valor_novo)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [dados.usuarioId, dados.tabela, dados.registroId, dados.operacao,
     dados.anterior ? JSON.stringify(dados.anterior) : null,
     dados.novo ? JSON.stringify(dados.novo) : null],
  );
}

/** RF36 – registra um evento na linha do tempo do TCC. */
export async function registrarEvento(db: Db, tccId: number, tipo: string, descricao: string, autorId: number | null) {
  await db.query(
    'INSERT INTO evento_tcc (tcc_id, tipo, descricao, autor_id) VALUES ($1, $2, $3, $4)',
    [tccId, tipo, descricao, autorId],
  );
}
