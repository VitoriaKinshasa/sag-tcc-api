import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { usuariosService } from './usuarios.service.js';

const novoUsuarioSchema = z.object({
  nome: z.string().trim().min(3, 'Informe o nome completo'),
  email: z.string().email('E-mail em formato inválido'),
  perfil: z.enum(['COORDENACAO', 'ORIENTADOR', 'ALUNO', 'MEMBRO_BANCA', 'ADMINISTRADOR'], { errorMap: () => ({ message: 'Perfil inválido' }) }),
  cursoId: z.number().int().positive().nullish(),
  matricula: z.string().trim().max(20).nullish(),
  externo: z.boolean().optional(),
  instituicao: z.string().trim().nullish(),
  titulacao: z.string().trim().nullish(),
});
const edicaoSchema = novoUsuarioSchema.pick({ nome: true, email: true, cursoId: true, matricula: true, titulacao: true })
  .extend({ perfil: z.enum(['ORIENTADOR', 'COORDENACAO']).optional() });
const areasSchema = z.object({ areaIds: z.array(z.number().int().positive()) });
const importarSchema = z.object({
  linhas: z.array(z.object({ nome: z.string(), email: z.string(), matricula: z.string() }), { required_error: 'Envie a planilha' })
    .min(1, 'A planilha está vazia').max(200, 'Importe no máximo 200 alunos por vez'),
});
const linhaAlunoSchema = z.object({
  nome: z.string().trim().min(3, 'Nome muito curto'),
  email: z.string().trim().email('E-mail inválido'),
  matricula: z.string().trim().min(3, 'Matrícula inválida').max(20, 'Matrícula muito longa'),
});

export const usuariosRoutes = Router();
usuariosRoutes.use(autenticar);

// UC05 – áreas de interesse do próprio professor
usuariosRoutes.put('/me/areas', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  const { areaIds } = areasSchema.parse(req.body);
  res.json(await usuariosService.definirMinhasAreas(usuarioDe(req).id, areaIds));
});

// Importar alunos de uma planilha (CSV lido pela tela). Cada linha é cadastrada separadamente:
// as linhas com erro são informadas e não impedem as outras.
usuariosRoutes.post('/importar', exigirPerfil('COORDENACAO'), async (req, res) => {
  const { linhas } = importarSchema.parse(req.body);
  const resultado = [];
  for (const [i, bruta] of linhas.entries()) {
    try {
      const linha = linhaAlunoSchema.parse(bruta);
      const u = await usuariosService.criar(usuarioDe(req), { ...linha, perfil: 'ALUNO' });
      resultado.push({ linha: i + 1, nome: linha.nome, ok: true, id: u.id });
    } catch (e) {
      const msg = e instanceof z.ZodError ? e.issues[0]?.message
        : (e as { code?: string }).code === '23505' ? 'E-mail ou matrícula já cadastrados' : (e as Error).message;
      resultado.push({ linha: i + 1, nome: bruta.nome, ok: false, erro: msg });
    }
  }
  res.json({ cadastrados: resultado.filter((r) => r.ok).length, comErro: resultado.filter((r) => !r.ok).length, linhas: resultado });
});

// UC03 – gestão de usuários: administrador (coordenações, professores, externos, administradores)
// e coordenação (alunos do curso e membros externos)
usuariosRoutes.get('/', exigirPerfil('COORDENACAO', 'ADMINISTRADOR'), async (req, res) => {
  const perfil = typeof req.query.perfil === 'string' ? req.query.perfil : undefined;
  const cursoId = req.query.cursoId ? Number(req.query.cursoId) : undefined;
  res.json(await usuariosService.listar(usuarioDe(req), { perfil, cursoId }));
});

usuariosRoutes.post('/', exigirPerfil('COORDENACAO', 'ADMINISTRADOR'), async (req, res) => {
  const dados = novoUsuarioSchema.parse(req.body);
  res.status(201).json(await usuariosService.criar(usuarioDe(req), dados));
});

usuariosRoutes.put('/:id', exigirPerfil('COORDENACAO', 'ADMINISTRADOR'), async (req, res) => {
  const dados = edicaoSchema.parse(req.body);
  res.json(await usuariosService.editar(usuarioDe(req), Number(req.params.id), dados));
});

usuariosRoutes.patch('/:id/desativar', exigirPerfil('COORDENACAO', 'ADMINISTRADOR'), async (req, res) => {
  res.json(await usuariosService.desativar(usuarioDe(req), Number(req.params.id)));
});
