import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { cursosService } from './cursos.service.js';

const cursoSchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome do curso'),
  sigla: z.string().trim().min(2, 'Informe a sigla').max(10, 'A sigla deve ter até 10 caracteres'),
  limiteOrientandos: z.number().int().positive('O limite deve ser maior que zero').optional(),
});
const edicaoCursoSchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome do curso'),
  limiteOrientandos: z.number().int().positive('O limite deve ser maior que zero'),
  coordenadorId: z.number().int().positive().nullish(),
});
const areaSchema = z.object({ nome: z.string().trim().min(3, 'Informe o nome da área') });

export const cursosRoutes = Router();
cursosRoutes.use(autenticar);

cursosRoutes.get('/cursos', async (_req, res) => { res.json(await cursosService.listarCursos()); });
cursosRoutes.get('/areas', async (_req, res) => { res.json(await cursosService.listarAreas()); });

cursosRoutes.post('/cursos', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.status(201).json(await cursosService.criarCurso(usuarioDe(req).id, cursoSchema.parse(req.body)));
});
cursosRoutes.put('/cursos/:id', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await cursosService.editarCurso(usuarioDe(req).id, Number(req.params.id), edicaoCursoSchema.parse(req.body)));
});
cursosRoutes.patch('/cursos/:id/desativar', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await cursosService.desativarCurso(usuarioDe(req).id, Number(req.params.id)));
});
cursosRoutes.delete('/cursos/:id', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await cursosService.excluirCurso(usuarioDe(req).id, Number(req.params.id)));
});
cursosRoutes.post('/areas', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.status(201).json(await cursosService.criarArea(usuarioDe(req).id, areaSchema.parse(req.body).nome));
});
