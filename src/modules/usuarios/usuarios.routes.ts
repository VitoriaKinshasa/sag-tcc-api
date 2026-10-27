import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { usuariosService } from './usuarios.service.js';

const novoUsuarioSchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome completo'),
  email: z.string().email('E-mail em formato inválido'),
  perfil: z.enum(['COORDENACAO', 'ORIENTADOR', 'ALUNO', 'MEMBRO_BANCA'], { errorMap: () => ({ message: 'Perfil inválido' }) }),
  cursoId: z.number().int().positive().nullish(),
  matricula: z.string().trim().max(20).nullish(),
  externo: z.boolean().optional(),
  instituicao: z.string().trim().nullish(),
  titulacao: z.string().trim().nullish(),
});
const edicaoSchema = novoUsuarioSchema.pick({ nome: true, email: true, cursoId: true, matricula: true, titulacao: true });
const areasSchema = z.object({ areaIds: z.array(z.number().int().positive()) });

export const usuariosRoutes = Router();
usuariosRoutes.use(autenticar);

// UC05 – áreas de interesse do próprio professor
usuariosRoutes.put('/me/areas', exigirPerfil('ORIENTADOR'), async (req, res) => {
  const { areaIds } = areasSchema.parse(req.body);
  res.json(await usuariosService.definirMinhasAreas(usuarioDe(req).id, areaIds));
});

// UC03 – gestão de usuários (somente coordenação)
usuariosRoutes.get('/', exigirPerfil('COORDENACAO'), async (req, res) => {
  const perfil = typeof req.query.perfil === 'string' ? req.query.perfil : undefined;
  const cursoId = req.query.cursoId ? Number(req.query.cursoId) : undefined;
  res.json(await usuariosService.listar({ perfil, cursoId }));
});

usuariosRoutes.post('/', exigirPerfil('COORDENACAO'), async (req, res) => {
  const dados = novoUsuarioSchema.parse(req.body);
  res.status(201).json(await usuariosService.criar(usuarioDe(req).id, dados));
});

usuariosRoutes.put('/:id', exigirPerfil('COORDENACAO'), async (req, res) => {
  const dados = edicaoSchema.parse(req.body);
  res.json(await usuariosService.editar(usuarioDe(req).id, Number(req.params.id), dados));
});

usuariosRoutes.patch('/:id/desativar', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await usuariosService.desativar(usuarioDe(req).id, Number(req.params.id)));
});
