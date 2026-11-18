import { app } from './app.js';
import { env } from './config/env.js';
import { verificarPrazos } from './modules/acompanhamento/prazos.service.js';
import { pool } from './shared/db.js';
import { aplicarAtualizacoes } from './shared/atualizacoes.js';

// Antes de ligar, aplica as novas colunas e tabelas do banco (não apaga nenhum dado)
try {
  await aplicarAtualizacoes(pool);
} catch (e) {
  const codigo = (e as { code?: string }).code;
  console.error(codigo === 'ECONNREFUSED'
    ? '\n❌ Não consegui conectar ao PostgreSQL. Ele está ligado? (No Windows: abra "Serviços" e inicie o "postgresql").\n'
    : codigo === '28P01'
      ? '\n❌ A senha do PostgreSQL no arquivo .env está errada (linha DATABASE_URL).\n'
      : `\n❌ Erro ao preparar o banco de dados: ${(e as Error).message}\n`);
  process.exit(1);
}

app.listen(env.PORT, () => {
  console.log(`SAG-TCC API rodando em http://localhost:${env.PORT}`);
});

// RF14 – alertas de prazo e TCC atrasado: verifica ao ligar e depois a cada hora
const verificar = () => verificarPrazos()
  .then((r) => { if (r.alertas || r.novosAtrasos) console.log(`[prazos] ${r.alertas} alerta(s) enviado(s), ${r.novosAtrasos} novo(s) atraso(s)`); })
  .catch((e) => console.error('[prazos] falha na verificação:', e));
verificar();
setInterval(verificar, 60 * 60 * 1000);
