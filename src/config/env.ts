import 'dotenv/config';

function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente ${nome} não definida (veja o arquivo .env.example)`);
  return valor;
}

export const env = {
  DATABASE_URL: obrigatoria('DATABASE_URL'),
  JWT_SECRET: obrigatoria('JWT_SECRET'),
  PORT: Number(process.env.PORT ?? 3000),
  APP_URL: process.env.APP_URL ?? 'http://localhost:5173',
};
