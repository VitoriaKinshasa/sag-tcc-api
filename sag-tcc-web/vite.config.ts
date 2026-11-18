import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// npm run dev   -> abre o frontend em http://localhost:5173 (a API precisa estar ligada na porta 3000)
// npm run build -> gera a versão final dentro de ../web (a API passa a mostrar em http://localhost:3000)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: '../web',
    emptyOutDir: true,
  },
});
