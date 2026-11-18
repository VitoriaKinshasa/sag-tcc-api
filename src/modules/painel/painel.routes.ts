import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { auditoriaService, painelService, SITUACOES } from './painel.service.js';

const texto = z.string().trim().max(150).optional();
const numero = z.coerce.number().int().positive().optional();
const semestre = z.string().regex(/^(\d{4}\.[12]|todos)$/, 'Semestre inválido').optional().or(z.literal('').transform(() => undefined));
const situacao = z.enum(['ATRASADO', ...SITUACOES] as unknown as [string, ...string[]], { errorMap: () => ({ message: 'Situação inválida' }) })
  .optional().or(z.literal('').transform(() => undefined));
const vazioParaNada = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === '' ? undefined : v), s);

const buscaSchema = z.object({
  aluno: texto, orientador: texto, semestre, situacao,
  areaId: vazioParaNada(numero), pagina: vazioParaNada(numero),
});

const auditoriaSchema = z.object({
  de: vazioParaNada(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inicial inválida').optional()),
  ate: vazioParaNada(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data final inválida').optional()),
  usuarioId: vazioParaNada(numero),
  tabela: vazioParaNada(z.string().max(60).optional()),
  operacao: vazioParaNada(z.enum(['INSERT', 'UPDATE', 'DELETE']).optional()),
  registroId: vazioParaNada(numero),
  pagina: vazioParaNada(numero),
});

/** Painel (UC22), busca e exportação (UC23) e auditoria (UC24): só a coordenação (RNF05). */
export const painelRoutes = Router();
// (cada rota tem o próprio controle: este roteador fica em /api junto com outros)
const so = [autenticar, exigirPerfil('COORDENACAO')];
// a auditoria também é consultada pelo administrador (vê o sistema inteiro)
const auditores = [autenticar, exigirPerfil('COORDENACAO', 'ADMINISTRADOR')];

painelRoutes.get('/painel', ...so, async (req, res) => {
  const f = buscaSchema.pick({ semestre: true, situacao: true, areaId: true }).parse(req.query);
  res.json(await painelService.painel(usuarioDe(req), f));
});

painelRoutes.get('/busca/tccs', ...so, async (req, res) => {
  res.json(await painelService.buscar(usuarioDe(req), buscaSchema.parse(req.query)));
});

painelRoutes.get('/busca/tccs/exportar', ...so, async (req, res) => {
  const formato = req.query.formato === 'pdf' ? 'pdf' : 'xlsx';
  const r = await painelService.exportar(usuarioDe(req), buscaSchema.parse(req.query), formato);
  res.setHeader('Content-Type', r.tipo);
  res.setHeader('Content-Disposition', `attachment; filename="${r.nome}"`);
  res.send(r.arquivo);
});

painelRoutes.get('/auditoria', ...auditores, async (req, res) => {
  res.json(await auditoriaService.consultar(auditoriaSchema.parse(req.query)));
});
painelRoutes.get('/auditoria/opcoes', ...auditores, async (_req, res) => {
  res.json(await auditoriaService.opcoes());
});
painelRoutes.get('/auditoria/:id', ...auditores, async (req, res) => {
  res.json(await auditoriaService.detalhe(Number(req.params.id)));
});
