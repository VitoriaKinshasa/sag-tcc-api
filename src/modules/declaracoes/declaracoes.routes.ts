import { Router } from 'express';
import { z } from 'zod';
import { autenticar } from '../../shared/middlewares.js';
import { usuarioDe } from '../../shared/util.js';
import { declaracoesService } from './declaracoes.service.js';

const emitirSchema = z.object({
  tipo: z.enum(['PARTICIPACAO_BANCA', 'ORIENTACAO', 'FOLHA_APROVACAO'], { errorMap: () => ({ message: 'Tipo de declaração inválido' }) }),
  tccId: z.number({ required_error: 'Informe o TCC' }).int().positive(),
});

/** Verificação pública de documentos pelo código (não precisa de login). */
export const verificarRoutes = Router();
verificarRoutes.get('/:codigo', async (req, res) => {
  res.json(await declaracoesService.verificar(String(req.params.codigo)));
});

/** Declarações de participação em banca, orientação e folha de aprovação. */
export const declaracoesRoutes = Router();
declaracoesRoutes.use(autenticar);
declaracoesRoutes.get('/disponiveis', async (req, res) => {
  res.json(await declaracoesService.disponiveis(usuarioDe(req)));
});
declaracoesRoutes.post('/', async (req, res) => {
  res.status(201).json(await declaracoesService.emitir(usuarioDe(req), emitirSchema.parse(req.body)));
});
declaracoesRoutes.get('/:codigo', async (req, res) => {
  res.json(await declaracoesService.obter(usuarioDe(req), String(req.params.codigo)));
});
