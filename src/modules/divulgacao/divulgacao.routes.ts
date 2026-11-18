import { Router } from 'express';
import { z } from 'zod';
import { autenticar, exigirPerfil } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { acervoService, bannerService, visibilidadeService } from './divulgacao.service.js';

const numero = z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().positive().optional());

/** UC26 – acervo público de TCCs aprovados: sem login. */
export const acervoRoutes = Router();
acervoRoutes.get('/filtros', async (_req, res) => { res.json(await acervoService.filtros()); });
acervoRoutes.get('/', async (req, res) => {
  const f = z.object({ q: z.string().max(150).optional(), areaId: numero, cursoId: numero, ano: numero, pagina: numero }).parse(req.query);
  res.json(await acervoService.pesquisar(f));
});
acervoRoutes.get('/:id', async (req, res) => { res.json(await acervoService.detalhe(Number(req.params.id))); });
acervoRoutes.get('/:id/pdf', async (req, res) => {
  const { arquivo, nome } = await acervoService.pdf(Number(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nome)}"`);
  res.send(arquivo);
});

/** UC27 (visibilidade) e UC25 (banner): ficam em /api/tccs/:id/... */
export const divulgacaoRoutes = Router();

divulgacaoRoutes.put('/tccs/:id/visibilidade', autenticar, exigirPerfil('ALUNO', 'ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  const dados = z.object({
    visibilidade: z.enum(['TEXTO_COMPLETO', 'SOMENTE_METADADOS'], { errorMap: () => ({ message: 'Escolha uma das opções' }) }),
    declaracao: z.boolean().optional(),
  }).parse(req.body);
  res.json(await visibilidadeService.alterar(usuarioDe(req), Number(req.params.id), dados));
});

divulgacaoRoutes.get('/tccs/:id/banner', autenticar, exigirPerfil('ALUNO'), async (req, res) => {
  res.json(await bannerService.situacao(usuarioDe(req), Number(req.params.id)));
});
divulgacaoRoutes.post('/tccs/:id/banner/sugestao', autenticar, exigirPerfil('ALUNO'), async (req, res) => {
  res.json(await bannerService.sugerir(usuarioDe(req), Number(req.params.id)));
});
const texto = z.string().max(600, 'Cada parte do banner pode ter até 600 caracteres').default('');
divulgacaoRoutes.post('/tccs/:id/banner', autenticar, exigirPerfil('ALUNO'), async (req, res) => {
  const dados = z.object({
    conteudo: z.object({ titulo: z.string().trim().min(1, 'Informe o título do banner').max(600), introducao: texto, objetivo: texto, metodologia: texto, resultados: texto, conclusao: texto }),
    png: z.string().min(1, 'Imagem do banner ausente'), jpeg: z.string().min(1, 'Imagem do banner ausente'),
    largura: z.number().int().positive().max(10000), altura: z.number().int().positive().max(10000),
  }).parse(req.body);
  res.status(201).json(await bannerService.gerar(usuarioDe(req), Number(req.params.id), dados));
});
divulgacaoRoutes.get('/tccs/:id/banner/:bannerId/:tipo', autenticar, async (req, res) => {
  const tipo = req.params.tipo === 'png' ? 'png' : 'pdf';
  const arquivo = await bannerService.arquivo(usuarioDe(req), Number(req.params.id), Number(req.params.bannerId), tipo);
  res.setHeader('Content-Type', tipo === 'png' ? 'image/png' : 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="banner-tcc.${tipo}"`);
  res.send(arquivo);
});

/** TCCs aprovados que o professor orientou: para ele também poder definir a visibilidade (UC27). */
divulgacaoRoutes.get('/orientacao/aprovados', autenticar, exigirPerfil('ORIENTADOR', 'COORDENACAO'), async (req, res) => {
  res.json(await visibilidadeService.aprovadosDoOrientador(usuarioDe(req).id));
});
