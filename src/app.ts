import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tratarErros, autenticar } from './shared/middlewares.js';
import { pool } from './shared/db.js';
import { usuarioDe } from './shared/util.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usuariosRoutes } from './modules/usuarios/usuarios.routes.js';
import { cursosRoutes } from './modules/cursos/cursos.routes.js';
import { propostasRoutes } from './modules/propostas/propostas.routes.js';
import { orientacaoRoutes } from './modules/orientacao/orientacao.routes.js';
import { calendarioRoutes } from './modules/calendario/calendario.routes.js';
import { agendaRoutes, bancasRoutes } from './modules/bancas/bancas.routes.js';
import { acompanhamentoRoutes } from './modules/acompanhamento/acompanhamento.routes.js';

export const app = express();
app.use(express.json({ limit: '15mb' })); // versões do TCC chegam em PDF (até 10 MB)

app.get('/api/saude', (_req, res) => { res.json({ status: 'ok', sistema: 'SAG-TCC' }); });

app.use('/api/auth', authRoutes);
app.use('/api/agenda', agendaRoutes);          // agenda de defesas: pública, sem login (UC21)
app.use('/api/usuarios', usuariosRoutes);
app.use('/api', cursosRoutes);                 // /api/cursos e /api/areas
app.use('/api/tccs', propostasRoutes);
app.use('/api/orientacao', orientacaoRoutes);
app.use('/api/calendarios', calendarioRoutes);
app.use('/api/bancas', bancasRoutes);
app.use('/api', acompanhamentoRoutes);         // versões, pareceres, prazos e publicação

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

// Tela de testes da API (public/index.html) – agora fica em http://localhost:3000/teste
const pastaTestes = fileURLToPath(new URL('../public', import.meta.url));
app.use('/teste', express.static(pastaTestes));

// Frontend final (React). É gerado pelo "npm run build" da pasta sag-tcc-web e fica em ./web
const pastaWeb = fileURLToPath(new URL('../web', import.meta.url));
if (existsSync(pastaWeb)) {
  app.use(express.static(pastaWeb));
  // Qualquer endereço que não seja da API abre o frontend (ex.: /meu-tcc, /definir-senha?token=...)
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile('index.html', { root: pastaWeb });
  });
} else {
  app.use(express.static(pastaTestes)); // sem o frontend gerado, a tela de testes continua na página inicial
}

app.use((_req, res) => { res.status(404).json({ erro: 'Rota não encontrada' }); });
app.use(tratarErros);