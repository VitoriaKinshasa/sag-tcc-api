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
const regrasNucleoSchema = z.object({
  limiteOrientandos: z.number({ invalid_type_error: 'Informe o limite' }).int().min(1, 'O limite deve ser pelo menos 1').max(30, 'Limite muito alto'),
});
const regrasSchema = z.object({
  notaMinima: z.number().min(0, 'A nota vai de 0 a 10').max(10, 'A nota vai de 0 a 10'),
  minTitulares: z.number().int().min(2, 'A banca precisa de pelo menos 2 titulares (contando o presidente)').max(7, 'No máximo 7 titulares'),
  minSuplentes: z.number().int().min(0).max(3, 'No máximo 3 suplentes'),
  diasCorrecoes: z.number().int().min(1, 'Mínimo de 1 dia').max(180, 'Máximo de 180 dias'),
  notasIndividuaisAluno: z.boolean(),
});
const areaSchema = z.object({ nome: z.string().trim().min(3, 'Informe o nome da área') });

export const cursosRoutes = Router();
cursosRoutes.use(autenticar);

cursosRoutes.get('/cursos', async (_req, res) => { res.json(await cursosService.listarCursos()); });
cursosRoutes.get('/areas', async (_req, res) => { res.json(await cursosService.listarAreas()); });

cursosRoutes.post('/cursos', exigirPerfil('ADMINISTRADOR'), async (req, res) => {
  res.status(201).json(await cursosService.criarCurso(usuarioDe(req).id, cursoSchema.parse(req.body)));
});
cursosRoutes.put('/cursos/:id', exigirPerfil('ADMINISTRADOR'), async (req, res) => {
  res.json(await cursosService.editarCurso(usuarioDe(req).id, Number(req.params.id), edicaoCursoSchema.parse(req.body)));
});
// Cursos, áreas e regra do NUCOMP (limite total de orientandos): o administrador cadastra e altera.
// As regras de cada curso (nota mínima, banca, correções) continuam com a coordenação do curso.
cursosRoutes.get('/nucleo/regras', async (_req, res) => { res.json(await cursosService.regrasNucleo()); });
cursosRoutes.put('/nucleo/regras', exigirPerfil('ADMINISTRADOR'), async (req, res) => {
  res.json(await cursosService.editarRegrasNucleo(usuarioDe(req), regrasNucleoSchema.parse(req.body)));
});
cursosRoutes.put('/cursos/:id/regras', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await cursosService.editarRegras(usuarioDe(req), Number(req.params.id), regrasSchema.parse(req.body)));
});
cursosRoutes.patch('/cursos/:id/desativar', exigirPerfil('ADMINISTRADOR'), async (req, res) => {
  res.json(await cursosService.desativarCurso(usuarioDe(req).id, Number(req.params.id)));
});
cursosRoutes.delete('/cursos/:id', exigirPerfil('ADMINISTRADOR'), async (req, res) => {
  res.json(await cursosService.excluirCurso(usuarioDe(req).id, Number(req.params.id)));
});
cursosRoutes.post('/areas', exigirPerfil('ADMINISTRADOR'), async (req, res) => {
  res.status(201).json(await cursosService.criarArea(usuarioDe(req).id, areaSchema.parse(req.body).nome));
});
