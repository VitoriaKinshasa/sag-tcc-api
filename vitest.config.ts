import 'dotenv/config';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './tests/preparar-banco.ts',
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      JWT_SECRET: process.env.JWT_SECRET ?? 'segredo-de-teste',
    },
  },
});
