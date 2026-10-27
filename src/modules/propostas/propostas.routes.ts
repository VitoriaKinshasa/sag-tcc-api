import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { propostasService } from './propostas.service.js';

const propostaSchema = z.object({
  titulo: z.string({ required_error: 'Informe o título' }).trim().min(5, 'Informe o título').max(250, 'O título deve ter até 250 caracteres'),
  subtitulo: z.string().trim().max(250).nullish(),
  resumo: z.string({ required_error: 'Informe o resumo' }).trim().min(1, 'Informe o resumo'),
  areaId: z.number({ required_error: 'Selecione a área do conhecimento' }).int().positive(),
});

export const propostasRoutes = Router();
propostasRoutes.use(autenticar);

propostasRoutes.post('/', exigirPerfil('ALUNO'), async (req, res) => {
  const u = usuarioDe(req);
  res.status(201).json(await propostasService.submeter(u.id, u.cursoId, propostaSchema.parse(req.body)));
});
propostasRoutes.get('/meu', exigirPerfil('ALUNO'), async (req, res) => {
  res.json(await propostasService.meuTcc(usuarioDe(req).id));
});
propostasRoutes.put('/:id', exigirPerfil('ALUNO'), async (req, res) => {
  res.json(await propostasService.editar(usuarioDe(req).id, Number(req.params.id), propostaSchema.parse(req.body)));
});
propostasRoutes.get('/:id/historico', async (req, res) => {
  res.json(await propostasService.historico(usuarioDe(req), Number(req.params.id)));
});
