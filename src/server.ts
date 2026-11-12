import { app } from './app.js';
import { env } from './config/env.js';
import { verificarPrazos } from './modules/acompanhamento/prazos.service.js';

app.listen(env.PORT, () => {
  console.log(`SAG-TCC API rodando em http://localhost:${env.PORT}`);
});

// RF14 – alertas de prazo e TCC atrasado: verifica ao ligar e depois a cada hora
const verificar = () => verificarPrazos()
  .then((r) => { if (r.alertas || r.novosAtrasos) console.log(`[prazos] ${r.alertas} alerta(s) enviado(s), ${r.novosAtrasos} novo(s) atraso(s)`); })
  .catch((e) => console.error('[prazos] falha na verificação:', e));
verificar();
setInterval(verificar, 60 * 60 * 1000);
