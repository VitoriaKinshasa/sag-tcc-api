import express from 'express';
import { tratarErros, autenticar } from './shared/middlewares.js';
import { pool } from './shared/db.js';
import { usuarioDe } from './shared/util.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usuariosRoutes } from './modules/usuarios/usuarios.routes.js';
import { cursosRoutes } from './modules/cursos/cursos.routes.js';
import { propostasRoutes } from './modules/propostas/propostas.routes.js';
import { orientacaoRoutes } from './modules/orientacao/orientacao.routes.js';

export const app = express();
app.use(express.json());

app.get('/api/saude', (_req, res) => { res.json({ status: 'ok', sistema: 'SAG-TCC' }); });

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api', cursosRoutes);                 // /api/cursos e /api/areas
app.use('/api/tccs', propostasRoutes);
app.use('/api/orientacao', orientacaoRoutes);

// RF37 – notificações internas do usuário logado
app.get('/api/notificacoes', autenticar, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, titulo, mensagem, lida, criado_em FROM notificacao WHERE usuario_id = $1 ORDER BY criado_em DESC',
    [usuarioDe(req).id],
  );
  res.json(rows);
});
app.patch('/api/notificacoes/:id/lida', autenticar, async (req, res) => {
  await pool.query('UPDATE notificacao SET lida = TRUE WHERE id = $1 AND usuario_id = $2', [req.params.id, usuarioDe(req).id]);
  res.json({ mensagem: 'Notificação marcada como lida' });
});

app.use((_req, res) => { res.status(404).json({ erro: 'Rota não encontrada' }); });
app.use(tratarErros);