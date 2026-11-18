import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { pool } from '../../shared/db.js';
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

// Aluno: todos os pedidos que ele já fez (orientação, troca, publicação e desistência), do mais novo para o mais antigo
orientacaoRoutes.get('/meus-pedidos', exigirPerfil('ALUNO'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT 'ORIENTACAO' AS tipo, s.id, s.status::text AS status, s.criado_em, s.respondido_em AS decidido_em, s.justificativa, u.nome AS detalhe
         FROM solicitacao_orientacao s JOIN tcc t ON t.id = s.tcc_id JOIN usuario u ON u.id = s.professor_id WHERE t.aluno_id = $1
       UNION ALL
       SELECT 'TROCA', x.id, x.status::text, x.criado_em, x.decidido_em, x.justificativa_decisao, u.nome
         FROM solicitacao_troca x JOIN tcc t ON t.id = x.tcc_id JOIN usuario u ON u.id = x.novo_orientador_id WHERE t.aluno_id = $1
       UNION ALL
       SELECT 'PUBLICACAO', p.id, p.status::text, p.criado_em, p.decidido_em, p.justificativa, p.titulo_artigo
         FROM pedido_publicacao p JOIN tcc t ON t.id = p.tcc_id WHERE t.aluno_id = $1
       UNION ALL
       SELECT 'DESISTENCIA', d.id, d.status::text, d.criado_em, d.decidido_em, NULL, NULL
         FROM pedido_desistencia d JOIN tcc t ON t.id = d.tcc_id WHERE t.aluno_id = $1
     ) p ORDER BY criado_em DESC`,
    [usuarioDe(req).id],
  );
  res.json(rows);
});

// UC08 – professor vê e responde as solicitações
orientacaoRoutes.get('/solicitacoes/recebidas', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await orientacaoService.solicitacoesRecebidas(usuarioDe(req).id));
});
orientacaoRoutes.patch('/solicitacoes/:id', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await orientacaoService.responder(usuarioDe(req).id, Number(req.params.id), responderSchema.parse(req.body)));
});

// Orientandos do professor (TCCs em andamento que ele orienta ou coorienta)
orientacaoRoutes.get('/orientandos', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await orientacaoService.meusOrientandos(usuarioDe(req).id));
});

// UC09 – reunião de alinhamento e encontros
orientacaoRoutes.post('/tccs/:tccId/reunioes', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.status(201).json(await orientacaoService.agendarReuniao(usuarioDe(req).id, Number(req.params.tccId), reuniaoSchema.parse(req.body)));
});
orientacaoRoutes.post('/tccs/:tccId/encontros', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.status(201).json(await orientacaoService.registrarEncontro(usuarioDe(req).id, Number(req.params.tccId), encontroSchema.parse(req.body)));
});

// UC10 e UC11 – troca de orientador
orientacaoRoutes.post('/trocas', exigirPerfil('ALUNO'), async (req, res) => {
  res.status(201).json(await orientacaoService.solicitarTroca(usuarioDe(req).id, trocaSchema.parse(req.body)));
});
orientacaoRoutes.get('/trocas/pendentes', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await orientacaoService.trocasPendentes(usuarioDe(req)));
});
orientacaoRoutes.patch('/trocas/:id', exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await orientacaoService.decidirTroca(usuarioDe(req), Number(req.params.id), decisaoTrocaSchema.parse(req.body)));
});

// UC12 – desistência
orientacaoRoutes.post('/desistencias', exigirPerfil('ALUNO'), async (req, res) => {
  res.status(201).json(await orientacaoService.pedirDesistencia(usuarioDe(req).id, desistenciaSchema.parse(req.body).motivo));
});
orientacaoRoutes.get('/desistencias/pendentes', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await orientacaoService.desistenciasPendentes(usuarioDe(req)));
});
orientacaoRoutes.patch('/desistencias/:id', exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await orientacaoService.decidirDesistencia(usuarioDe(req), Number(req.params.id), confirmacaoSchema.parse(req.body).confirmar));
});
