import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { contaService } from './conta.service.js';
import { relatoriosService } from './relatorios.service.js';

const correcaoSchema = z.object({
  mensagem: z.string({ required_error: 'Diga o que precisa ser corrigido' }).trim().min(5, 'Diga o que precisa ser corrigido').max(1000),
});

/** Tela "Meus dados" (/api/me) e telas da coordenação (relatórios e e-mails simulados). */
export const contaRoutes = Router();
contaRoutes.use(autenticar);

contaRoutes.get('/me', async (req, res) => { res.json(await contaService.meusDados(usuarioDe(req))); });
contaRoutes.get('/me/exportar', async (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="meus-dados-sag-tcc.json"');
  res.json(await contaService.exportar(usuarioDe(req)));
});
contaRoutes.post('/me/correcao', async (req, res) => {
  res.json(await contaService.pedirCorrecao(usuarioDe(req), correcaoSchema.parse(req.body).mensagem));
});

contaRoutes.get('/relatorios', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await relatoriosService.doCurso(usuarioDe(req)));
});
contaRoutes.get('/emails', exigirPerfil('COORDENACAO', 'ADMINISTRADOR'), async (req, res) => {
  res.json(await relatoriosService.emails(usuarioDe(req)));
});
