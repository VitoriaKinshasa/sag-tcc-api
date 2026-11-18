import { pool, type Db } from './db.js';

/**
 * Envio de e-mail – SIMULAÇÃO. O sistema ainda não envia e-mail de verdade:
 * cada mensagem aparece no terminal e fica guardada na tabela email_enviado,
 * para a coordenação ver na tela "E-mails enviados" (ex.: o link de primeiro acesso).
 * Para enviar de verdade, troque o corpo de enviar() por um serviço de e-mail (ex.: Resend).
 */
export const emailService = {
  enviados: [] as { para: string; assunto: string; texto: string }[],
  async enviar(para: string, assunto: string, texto: string) {
    this.enviados.push({ para, assunto, texto });
    if (process.env.NODE_ENV !== 'test') console.log(`[e-mail] para ${para}: ${assunto}\n${texto}\n`);
    try {
      await pool.query('INSERT INTO email_enviado (para, assunto, texto) VALUES ($1, $2, $3)', [para, assunto.slice(0, 200), texto]);
    } catch {
      // guardar a cópia é só para consulta; uma falha aqui não pode impedir a ação principal
    }
  },
};

/** RF37 – cria a notificação interna e envia o mesmo aviso por e-mail. */
export async function notificar(db: Db, usuarioId: number, titulo: string, mensagem: string) {
  await db.query(
    'INSERT INTO notificacao (usuario_id, titulo, mensagem) VALUES ($1, $2, $3)',
    [usuarioId, titulo, mensagem],
  );
  const { rows } = await db.query('SELECT email FROM usuario WHERE id = $1', [usuarioId]);
  if (rows[0]) await emailService.enviar(rows[0].email, `[SAG-TCC] ${titulo}`, mensagem);
}

/** Notifica todos os usuários da coordenação de um curso. */
export async function notificarCoordenacao(db: Db, cursoId: number, titulo: string, mensagem: string) {
  const { rows } = await db.query(
    "SELECT id FROM usuario WHERE perfil = 'COORDENACAO' AND curso_id = $1 AND ativo",
    [cursoId],
  );
  for (const { id } of rows) await notificar(db, Number(id), titulo, mensagem);
}
