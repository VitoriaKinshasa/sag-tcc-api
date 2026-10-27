import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { orientacaoService } from './orientacao.service.js';

const id = z.number({ required_error: 'Campo obrigatório' }).int().positive();
const solicitarSchema = z.object({ professorId: id });
const responderSchema = z.object({ aceitar: z.boolean(), justificativa: z.string().nullish(), coorientadorId: id.nullish() });
const reuniaoSchema = z.object({
  dataHora: z.coerce.date({ errorMap: () => ({ message: 'Data e hora inválidas' }) }),
  localOuLink: z.string().trim().min(3, 'Informe o local ou o link da reunião'),
  confirmarConflito: z.boolean().optional(),
});
const encontroSchema = z.object({
  data: z.coerce.date({ errorMap: () => ({ message: 'Data inválida' }) }),
  resumo: z.string().trim().min(3, 'Informe o resumo dos encaminhamentos'),
});
const trocaSchema = z.object({ novoOrientadorId: id, motivo: z.string().trim().min(3, 'Informe o motivo da troca') });
const decisaoTrocaSchema = z.object({ aprovar: z.boolean(), justificativa: z.string().nullish() });
const desistenciaSchema = z.object({ motivo: z.string().trim().min(3, 'Informe o motivo da desistência') });
const confirmacaoSchema = z.object({ confirmar: z.boolean() });

export const orientacaoRoutes = Router();
orientacaoRoutes.use(autenticar);

// UC07 – aluno busca orientadores e solicita orientação
orientacaoRoutes.get('/orientadores', async (req, res) => {
  res.json(await orientacaoService.listarOrientadores(req.query.areaId ? Number(req.query.areaId) : undefined));
});
orientacaoRoutes.post('/solicitacoes', exigirPerfil('ALUNO'), async (req, res) => {
  res.status(201).json(await orientacaoService.solicitar(usuarioDe(req).id, solicitarSchema.parse(req.body).professorId));
});

// UC08 – professor vê e responde as solicitações
orientacaoRoutes.get('/solicitacoes/recebidas', exigirPerfil('ORIENTADOR'), async (req, res) => {
  res.json(await orientacaoService.solicitacoesRecebidas(usuarioDe(req).id));
});
orientacaoRoutes.patch('/solicitacoes/:id', exigirPerfil('ORIENTADOR'), async (req, res) => {
  res.json(await orientacaoService.responder(usuarioDe(req).id, Number(req.params.id), responderSchema.parse(req.body)));
});

// UC09 – reunião de alinhamento e encontros
orientacaoRoutes.post('/tccs/:tccId/reunioes', exigirPerfil('ORIENTADOR'), async (req, res) => {
  res.status(201).json(await orientacaoService.agendarReuniao(usuarioDe(req).id, Number(req.params.tccId), reuniaoSchema.parse(req.body)));
});
orientacaoRoutes.post('/tccs/:tccId/encontros', exigirPerfil('ORIENTADOR'), async (req, res) => {
  res.status(201).json(await orientacaoService.registrarEncontro(usuarioDe(req).id, Number(req.params.tccId), encontroSchema.parse(req.body)));
});

// UC10 e UC11 – troca de orientador
orientacaoRoutes.post('/trocas', exigirPerfil('ALUNO'), async (req, res) => {
  res.status(201).json(await orientacaoService.solicitarTroca(usuarioDe(req).id, trocaSchema.parse(req.body)));
});
orientacaoRoutes.patch('/trocas/:id', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await orientacaoService.decidirTroca(usuarioDe(req), Number(req.params.id), decisaoTrocaSchema.parse(req.body)));
});

// UC12 – desistência
orientacaoRoutes.post('/desistencias', exigirPerfil('ALUNO'), async (req, res) => {
  res.status(201).json(await orientacaoService.pedirDesistencia(usuarioDe(req).id, desistenciaSchema.parse(req.body).motivo));
});
orientacaoRoutes.patch('/desistencias/:id', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await orientacaoService.decidirDesistencia(usuarioDe(req), Number(req.params.id), confirmacaoSchema.parse(req.body).confirmar));
});
