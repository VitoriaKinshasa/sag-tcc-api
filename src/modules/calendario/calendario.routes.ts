import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { ErroNegocio } from '../../shared/errors.js';
import { usuarioDe } from '../../shared/util.js';
import { calendarioService, ETAPAS } from './calendario.service.js';

const data = (campo: string) => z.string({ required_error: `Informe a ${campo}` }).regex(/^\d{4}-\d{2}-\d{2}$/, `${campo} inválida`);
const semestre = z.string().regex(/^\d{4}\.[12]$/, 'Semestre inválido. Use o formato 2026.2');
const etapasSchema = z.array(z.object({
  etapa: z.enum(ETAPAS, { errorMap: () => ({ message: 'Etapa inválida' }) }),
  dataInicio: data('data de início'),
  dataLimite: data('data-limite'),
}), { required_error: 'Informe as etapas' });

export const calendarioRoutes = Router();
calendarioRoutes.use(autenticar);

/** Calendário do curso do usuário (ou de outro curso, com ?cursoId=). */
calendarioRoutes.get('/', async (req, res) => {
  const cursoId = req.query.cursoId ? Number(req.query.cursoId) : usuarioDe(req).cursoId;
  if (!cursoId) throw new ErroNegocio(422, 'Informe o curso (cursoId)');
  res.json(await calendarioService.listar(cursoId));
});

// UC13 – Manter calendário de etapas (somente coordenação)
calendarioRoutes.post('/', exigirPerfil('COORDENACAO'), async (req, res) => {
  const dados = z.object({ semestre, etapas: etapasSchema }).parse(req.body);
  res.status(201).json(await calendarioService.criar(usuarioDe(req), dados.semestre, dados.etapas));
});
calendarioRoutes.put('/:semestre', exigirPerfil('COORDENACAO'), async (req, res) => {
  const dados = z.object({ etapas: etapasSchema }).parse(req.body);
  res.json(await calendarioService.alterar(usuarioDe(req), semestre.parse(req.params.semestre), dados.etapas));
});
