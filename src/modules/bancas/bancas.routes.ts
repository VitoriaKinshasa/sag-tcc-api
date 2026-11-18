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
  prazoCorrecoes: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data do prazo inválida').nullish().or(z.literal('')),
});
const assinarSchema = z.object({ senha: z.string({ required_error: 'Digite a sua senha' }).min(1, 'Digite a sua senha') });
const pdfSchema = z.object({
  arquivoNome: z.string({ required_error: 'Escolha o arquivo PDF' }).trim().min(1, 'Escolha o arquivo PDF').max(200),
  arquivoBase64: z.string({ required_error: 'Escolha o arquivo PDF' }).min(1, 'Escolha o arquivo PDF'),
});
const correcaoNotaSchema = z.object({
  nota: z.number({ required_error: 'Informe a nota', invalid_type_error: 'Informe a nota' }).min(0, 'A nota vai de 0 a 10').max(10, 'A nota vai de 0 a 10'),
  justificativa: z.string({ required_error: 'Informe a justificativa da correção' }).trim().min(5, 'Informe a justificativa da correção').max(1000),
});
const substituirSchema = z.object({ titularId: id, suplenteId: id });
const cancelarSchema = z.object({ motivo: z.string({ required_error: 'Informe o motivo' }).trim().min(5, 'Informe o motivo do cancelamento').max(1000) });
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
bancasRoutes.post('/', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.status(201).json(await bancasService.cadastrar(usuarioDe(req).id, bancaSchema.parse(req.body)));
});
bancasRoutes.patch('/:id/remarcar', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await bancasService.remarcar(usuarioDe(req).id, Number(req.params.id), remarcarSchema.parse(req.body)));
});

// UC20 – Notas, resultado e ata
bancasRoutes.post('/:id/notas', exigirPerfil('ORIENTADOR', 'MEMBRO_BANCA', 'COORDENACAO'), async (req, res) => {
  res.status(201).json(await bancasService.registrarNota(usuarioDe(req).id, Number(req.params.id), notaSchema.parse(req.body)));
});
bancasRoutes.post('/:id/resultado', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.status(201).json(await bancasService.registrarResultado(usuarioDe(req).id, Number(req.params.id), resultadoSchema.parse(req.body)));
});
bancasRoutes.get('/:id/ata', async (req, res) => {
  res.json(await bancasService.ata(usuarioDe(req), Number(req.params.id)));
});
bancasRoutes.post('/:id/ata/assinar', exigirPerfil('ORIENTADOR', 'MEMBRO_BANCA', 'COORDENACAO'), async (req, res) => {
  res.json(await bancasService.assinarAta(usuarioDe(req).id, Number(req.params.id), assinarSchema.parse(req.body).senha));
});
bancasRoutes.post('/:id/ata/digitalizada', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.status(201).json(await bancasService.enviarAtaDigitalizada(usuarioDe(req), Number(req.params.id), pdfSchema.parse(req.body)));
});
bancasRoutes.get('/:id/ata/digitalizada', async (req, res) => {
  const a = await bancasService.ataDigitalizada(usuarioDe(req), Number(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(a.arquivo_nome)}"`);
  res.send(a.arquivo);
});
// Correção de nota já lançada: só a coordenação, com justificativa
bancasRoutes.patch('/:id/notas/:membroId', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await bancasService.corrigirNota(usuarioDe(req), Number(req.params.id), Number(req.params.membroId), correcaoNotaSchema.parse(req.body)));
});

// Suplente assume, cancelamento e arquivo de agenda
bancasRoutes.patch('/:id/substituir', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await bancasService.substituir(usuarioDe(req).id, Number(req.params.id), substituirSchema.parse(req.body)));
});
bancasRoutes.patch('/:id/cancelar', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await bancasService.cancelar(usuarioDe(req), Number(req.params.id), cancelarSchema.parse(req.body).motivo));
});
bancasRoutes.get('/:id/agenda.ics', async (req, res) => {
  const ics = await bancasService.arquivoAgenda(usuarioDe(req), Number(req.params.id));
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="defesa-tcc.ics"');
  res.send(ics);
});

// UC21 A1 – Convidar a audiência
bancasRoutes.post('/:id/convites', exigirPerfil('ALUNO', 'ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await bancasService.convidar(usuarioDe(req), Number(req.params.id), convitesSchema.parse(req.body).emails));
});
