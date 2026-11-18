// Roda só na Vercel, antes de publicar (vercel.json -> buildCommand).
// A Vercel só entrega arquivos de tela que estão na pasta public/ (ela ignora o express.static).
// Então aqui:
//   1. a tela de testes (public/index.html) vai para public/teste/index.html  -> endereço /teste
//   2. o frontend pronto (pasta web/) é copiado para public/                   -> endereço /
// No computador nada disso muda: o "npm run dev" continua igual.
import fs from 'node:fs';

fs.mkdirSync('public/teste', { recursive: true });
fs.copyFileSync('public/index.html', 'public/teste/index.html');
fs.cpSync('web', 'public', { recursive: true, force: true });
console.log('Telas preparadas: frontend em /, tela de testes em /teste');
