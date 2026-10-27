import { Router } from 'express';
import { z } from 'zod';
import { autenticar } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { authService } from './auth.service.js';

const loginSchema = z.object({
  email: z.string({ required_error: 'Informe o e-mail' }).email('E-mail em formato inválido'),
  senha: z.string({ required_error: 'Informe a senha' }).min(1, 'Informe a senha'),
});
const emailSchema = z.object({ email: z.string().email('E-mail em formato inválido') });
const senhaSchema = z.object({
  token: z.string().min(1, 'Link inválido'),
  novaSenha: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
});

export const authRoutes = Router();

authRoutes.post('/login', async (req, res) => {
  const { email, senha } = loginSchema.parse(req.body);
  res.json(await authService.login(email, senha));
});

authRoutes.post('/recuperar-senha', async (req, res) => {
  const { email } = emailSchema.parse(req.body);
  res.json(await authService.solicitarRedefinicao(email));
});

authRoutes.post('/definir-senha', async (req, res) => {
  const { token, novaSenha } = senhaSchema.parse(req.body);
  res.json(await authService.definirSenha(token, novaSenha));
});

authRoutes.post('/aceitar-termo', autenticar, async (req, res) => {
  res.json(await authService.aceitarTermo(usuarioDe(req).id));
});
