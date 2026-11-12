import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { pool } from '../../shared/db.js';
import { bancasService } from './bancas.service.js';

const id = z.number({ required_error: 'Campo obrigatório' }).int().positive();
const dataHora = z.coerce.date({ errorMap: () => ({ message: 'Data e hora inválidas' }) });
const localOuLink = z.string({ required_error: 'Informe o local ou o link' }).trim().min(3, 'Informe o local ou o link').max(250);
const bancaSchema = z.object({
  tccId: id,
  dataHora,
  localOuLink,
  membros: z.array(z.object({ usuarioId: id, papel: z.enum(['TITULAR', 'SUPLENTE'], { errorMap: () => ({ message: 'Papel inválido' }) }) }),
    { required_error: 'Informe os membros da banca' }),
});
const remarcarSchema = z.object({ dataHora, localOuLink });
const notaSchema = z.object({
  nota: z.number({ required_error: 'Informe a nota', invalid_type_error: 'Informe a nota' }).min(0, 'A nota vai de 0 a 10').max(10, 'A nota vai de 0 a 10'),
  parecer: z.string().trim().max(2000).nullish(),
});
const resultadoSchema = z.object({
  resultado: z.enum(['APROVADO', 'APROVADO_COM_CORRECOES', 'REPROVADO'], { errorMap: () => ({ message: 'Resultado inválido' }) }),
  observacao: z.string().nullish(),
  ataUrl: z.string().trim().url('Link da ata inválido').nullish().or(z.literal('')),
});
const convitesSchema = z.object({
  emails: z.array(z.string().trim().email('E-mail inválido'), { required_error: 'Informe os e-mails' })
    .min(1, 'Informe pelo menos um e-mail').max(20, 'Envie no máximo 20 convites por vez'),
});

/** UC21 – agenda pública de defesas (não precisa de login). */
export const agendaRoutes = Router();
agendaRoutes.get('/cursos', async (_req, res) => {   // filtros da agenda pública
  const { rows } = await pool.query('SELECT id, nome, sigla FROM curso WHERE ativo ORDER BY nome');
  res.json(rows);
});
agendaRoutes.get('/', async (req, res) => {
  const filtros = z.object({
    cursoId: z.coerce.number().int().positive().optional(),
    mes: z.string().regex(/^\d{4}-\d{2}$/, 'Mês inválido. Use AAAA-MM').optional(),
  }).parse(req.query);
  res.json(await bancasService.agendaPublica(filtros));
});

export const bancasRoutes = Router();
bancasRoutes.use(autenticar);

bancasRoutes.get('/membros-disponiveis', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (_req, res) => {
  res.json(await bancasService.membrosDisponiveis());
});
bancasRoutes.get('/minhas', async (req, res) => {
  res.json(await bancasService.minhas(usuarioDe(req)));
});
bancasRoutes.get('/:id', async (req, res) => {
  res.json(await bancasService.detalhe(usuarioDe(req), Number(req.params.id)));
});

// UC19 – Cadastrar e remarcar banca (orientador = presidente)
bancasRoutes.post('/', exigirPerfil('ORIENTADOR'), async (req, res) => {
  res.status(201).json(await bancasService.cadastrar(usuarioDe(req).id, bancaSchema.parse(req.body)));
});
bancasRoutes.patch('/:id/remarcar', exigirPerfil('ORIENTADOR'), async (req, res) => {
  res.json(await bancasService.remarcar(usuarioDe(req).id, Number(req.params.id), remarcarSchema.parse(req.body)));
});

// UC20 – Notas, resultado e ata
bancasRoutes.post('/:id/notas', exigirPerfil('ORIENTADOR', 'MEMBRO_BANCA'), async (req, res) => {
  res.status(201).json(await bancasService.registrarNota(usuarioDe(req).id, Number(req.params.id), notaSchema.parse(req.body)));
});
bancasRoutes.post('/:id/resultado', exigirPerfil('ORIENTADOR'), async (req, res) => {
  res.status(201).json(await bancasService.registrarResultado(usuarioDe(req).id, Number(req.params.id), resultadoSchema.parse(req.body)));
});
bancasRoutes.get('/:id/ata', async (req, res) => {
  res.json(await bancasService.ata(usuarioDe(req), Number(req.params.id)));
});

// UC21 A1 – Convidar a audiência
bancasRoutes.post('/:id/convites', exigirPerfil('ALUNO', 'ORIENTADOR'), async (req, res) => {
  res.json(await bancasService.convidar(usuarioDe(req), Number(req.params.id), convitesSchema.parse(req.body).emails));
});
