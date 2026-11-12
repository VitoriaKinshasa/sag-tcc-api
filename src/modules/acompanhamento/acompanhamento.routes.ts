import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { acompanhamentoService } from './acompanhamento.service.js';
import { verificarPrazos } from './prazos.service.js';

const versaoSchema = z.object({
  etapa: z.enum(['QUALIFICACAO', 'VERSAO_FINAL', 'ENTREGA_DEFINITIVA'], { errorMap: () => ({ message: 'Escolha a etapa da entrega' }) }),
  comentario: z.string().max(2000).nullish(),
  arquivoNome: z.string({ required_error: 'Escolha o arquivo PDF' }).trim().min(1, 'Escolha o arquivo PDF').max(200),
  arquivoBase64: z.string({ required_error: 'Escolha o arquivo PDF' }).min(1, 'Escolha o arquivo PDF'),
  visibilidade: z.enum(['TEXTO_COMPLETO', 'SOMENTE_METADADOS']).optional(),
});
const parecerSchema = z.object({
  decisao: z.enum(['APROVADA', 'AJUSTES'], { errorMap: () => ({ message: 'Escolha o parecer' }) }),
  texto: z.string().max(4000).nullish(),
});
const publicacaoSchema = z.object({
  tituloArtigo: z.string({ required_error: 'Informe o título do artigo' }).trim().min(5, 'Informe o título do artigo').max(250),
  veiculo: z.string({ required_error: 'Informe a revista ou o evento' }).trim().min(3, 'Informe a revista ou o evento').max(250),
  ano: z.number({ required_error: 'Informe o ano', invalid_type_error: 'Informe o ano' }).int().min(2000, 'Ano inválido').max(2100, 'Ano inválido'),
  link: z.string({ required_error: 'Informe o link ou DOI do artigo' }).trim().url('Informe o link (https://...) ou DOI do artigo'),
});
const decisaoSchema = z.object({ aprovar: z.boolean(), justificativa: z.string().nullish() });

/** Acompanhamento e prazos (RF14 a RF22): versões, pareceres, prazos, alertas e conclusão por publicação. */
export const acompanhamentoRoutes = Router();

acompanhamentoRoutes.post('/tccs/:id/versoes', autenticar, exigirPerfil('ALUNO'), async (req, res) => {
  res.status(201).json(await acompanhamentoService.enviarVersao(usuarioDe(req).id, Number(req.params.id), versaoSchema.parse(req.body)));
});
acompanhamentoRoutes.get('/tccs/:id/versoes', autenticar, async (req, res) => {
  res.json(await acompanhamentoService.listarVersoes(usuarioDe(req), Number(req.params.id)));
});
acompanhamentoRoutes.get('/tccs/:id/prazos', autenticar, async (req, res) => {
  res.json(await acompanhamentoService.prazos(usuarioDe(req), Number(req.params.id)));
});
acompanhamentoRoutes.post('/tccs/:id/publicacao', autenticar, exigirPerfil('ALUNO'), async (req, res) => {
  res.status(201).json(await acompanhamentoService.pedirPublicacao(usuarioDe(req).id, Number(req.params.id), publicacaoSchema.parse(req.body)));
});

acompanhamentoRoutes.get('/versoes/recebidas', autenticar, exigirPerfil('ORIENTADOR'), async (req, res) => {
  res.json(await acompanhamentoService.versoesRecebidas(usuarioDe(req).id));
});
acompanhamentoRoutes.get('/versoes/:id/arquivo', autenticar, async (req, res) => {
  const a = await acompanhamentoService.arquivo(usuarioDe(req), Number(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(a.arquivo_nome)}"`);
  res.send(a.arquivo);
});
acompanhamentoRoutes.post('/versoes/:id/parecer', autenticar, exigirPerfil('ORIENTADOR'), async (req, res) => {
  res.status(201).json(await acompanhamentoService.darParecer(usuarioDe(req).id, Number(req.params.id), parecerSchema.parse(req.body)));
});

acompanhamentoRoutes.get('/publicacoes/pendentes', autenticar, exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await acompanhamentoService.publicacoesPendentes(usuarioDe(req)));
});
acompanhamentoRoutes.patch('/publicacoes/:id', autenticar, exigirPerfil('COORDENACAO'), async (req, res) => {
  res.json(await acompanhamentoService.decidirPublicacao(usuarioDe(req), Number(req.params.id), decisaoSchema.parse(req.body)));
});

/** Roda a verificação de prazos na hora (ela também roda sozinha a cada hora). */
acompanhamentoRoutes.post('/prazos/verificar', autenticar, exigirPerfil('COORDENACAO'), async (_req, res) => {
  res.json(await verificarPrazos());
});
