import 'dotenv/config';
import fs from 'node:fs';
import pg from 'pg';

/**
 * npm run db:salvar     -> guarda uma cópia de TODOS os dados do banco na pasta "copias"
 * npm run db:restaurar  -> apaga o banco atual e volta para a cópia mais recente
 *                          (ou para uma cópia escolhida: npm run db:restaurar -- copias/NOME.json)
 *
 * Não precisa do pg_dump: usa a mesma conexão do sistema (arquivo .env).
 * A pasta "copias" fica fora do Git, porque tem dados pessoais.
 */
const modo = process.argv[2];
const url = process.env.DATABASE_URL;
if (!url) throw new Error('Defina DATABASE_URL no arquivo .env');

const pasta = new URL('../copias/', import.meta.url);
const ler = (arquivo: string) => fs.readFileSync(new URL(`../database/${arquivo}`, import.meta.url), 'utf8');

// Lê os tipos do jeito "cru" (texto), para a cópia voltar exatamente igual
pg.types.setTypeParser(1082, (v) => v); // date
pg.types.setTypeParser(1700, (v) => v); // numeric
pg.types.setTypeParser(20, (v) => v);   // bigint

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();

interface Coluna { nome: string; tipo: string; identidade: boolean }
async function colunasDe(tabela: string): Promise<Coluna[]> {
  const { rows } = await cliente.query(
    `SELECT column_name AS nome, data_type AS tipo, is_identity = 'YES' AS identidade
     FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
    [tabela],
  );
  return rows;
}

if (modo === 'salvar') {
  const { rows: tabelas } = await cliente.query(
    "SELECT table_name AS nome FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const dados: Record<string, unknown[]> = {};
  let total = 0;
  for (const { nome } of tabelas) {
    const colunas = await colunasDe(nome);
    const { rows } = await cliente.query(`SELECT * FROM "${nome}"`);
    dados[nome] = rows.map((linha) => {
      const copia: Record<string, unknown> = {};
      for (const c of colunas) {
        const v = linha[c.nome];
        copia[c.nome] = Buffer.isBuffer(v) ? { base64: v.toString('base64') } : v; // PDFs viram texto
      }
      return copia;
    });
    total += rows.length;
  }
  fs.mkdirSync(pasta, { recursive: true });
  const agora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Manaus' }).replace(' ', '_').replace(/:/g, '-').slice(0, 16);
  const arquivo = new URL(`copia-${agora}.json`, pasta);
  fs.writeFileSync(arquivo, JSON.stringify({ criadaEm: new Date().toISOString(), dados }));
  console.log(`Cópia guardada: copias/copia-${agora}.json (${total} registros).`);
  console.log('Para voltar para ela depois, rode: npm run db:restaurar');
} else if (modo === 'restaurar') {
  let escolhido = process.argv[3];
  if (!escolhido) {
    const copias = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((f) => f.endsWith('.json')).sort() : [];
    if (!copias.length) {
      console.error('Nenhuma cópia encontrada. Primeiro guarde uma com: npm run db:salvar');
      process.exit(1);
    }
    escolhido = `copias/${copias[copias.length - 1]}`;
  }
  const { dados } = JSON.parse(fs.readFileSync(new URL(`../${escolhido.replace(/\\/g, '/')}`, import.meta.url), 'utf8')) as { dados: Record<string, Record<string, unknown>[]> };

  await cliente.query('BEGIN');
  await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await cliente.query(ler('schema.sql'));
  await cliente.query(ler('atualizacoes.sql'));
  // A estrutura nova já vem com algumas linhas padrão: elas são trocadas pelas da cópia
  for (const tabela of Object.keys(dados)) await cliente.query(`DELETE FROM "${tabela}"`);
  // Desliga as conferências de chave estrangeira só durante a cópia (a ordem das tabelas não importa)
  await cliente.query("SET session_replication_role = 'replica'");
  let total = 0;
  for (const [tabela, linhas] of Object.entries(dados)) {
    const colunas = (await colunasDe(tabela)).filter((c) => c.nome in (linhas[0] ?? {}));
    for (const linha of linhas) {
      const valores = colunas.map((c) => {
        const v = linha[c.nome];
        if (v && typeof v === 'object' && 'base64' in (v as object)) return Buffer.from((v as { base64: string }).base64, 'base64');
        if (v !== null && typeof v === 'object' && (c.tipo === 'jsonb' || c.tipo === 'json')) return JSON.stringify(v);
        return v;
      });
      const sobrescrever = colunas.some((c) => c.identidade) ? 'OVERRIDING SYSTEM VALUE' : '';
      await cliente.query(
        `INSERT INTO "${tabela}" (${colunas.map((c) => `"${c.nome}"`).join(', ')}) ${sobrescrever}
         VALUES (${colunas.map((_, i) => `$${i + 1}`).join(', ')})`,
        valores,
      );
      total += 1;
    }
    // Os próximos ids continuam depois do maior id da cópia
    for (const c of colunas.filter((x) => x.identidade)) {
      await cliente.query(
        `SELECT setval(pg_get_serial_sequence('"${tabela}"', '${c.nome}'), COALESCE((SELECT max("${c.nome}") FROM "${tabela}"), 0) + 1, false)`,
      );
    }
  }
  await cliente.query("SET session_replication_role = 'origin'");
  await cliente.query(ler('atualizacoes.sql')); // garante a estrutura mais nova, caso a cópia seja antiga
  await cliente.query('COMMIT');
  console.log(`Banco restaurado a partir de ${escolhido} (${total} registros).`);
} else {
  console.log('Use: npm run db:salvar   ou   npm run db:restaurar');
}
await cliente.end();
