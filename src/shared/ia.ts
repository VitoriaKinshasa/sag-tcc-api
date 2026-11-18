/**
 * Serviço de IA usado para sugerir os textos do banner (UC25).
 * Fica isolado aqui para poder ser trocado sem mudar o caso de uso (O01 do UC25).
 * Usa a API da Anthropic (Claude) quando a chave IA_CHAVE está no arquivo .env.
 * A chave fica só no servidor, nunca vai para o navegador.
 */

export interface DadosPublicosTcc {
  titulo: string; subtitulo: string | null; resumo: string; area: string; curso: string;
  aluno: string; orientador: string | null; ano: number;
}

export interface TextosBanner {
  titulo: string; introducao: string; objetivo: string; metodologia: string; resultados: string; conclusao: string;
}

export const SECOES_BANNER: (keyof TextosBanner)[] = ['titulo', 'introducao', 'objetivo', 'metodologia', 'resultados', 'conclusao'];
export const LIMITE_SECAO = 600;

export class IaIndisponivel extends Error {}

export const iaConfigurada = () => !!process.env.IA_CHAVE?.trim();

/** Pede ao serviço de IA a sugestão dos textos. Espera no máximo 30 segundos (E03 do UC25). */
export async function sugerirTextosBanner(dados: DadosPublicosTcc): Promise<TextosBanner> {
  const chave = process.env.IA_CHAVE?.trim();
  if (!chave) throw new IaIndisponivel('Serviço de IA não configurado');

  // RN02: só dados públicos do trabalho (nada de matrícula, e-mail, notas ou arquivos)
  const pedido = `Você ajuda alunos de graduação a montar o banner acadêmico do TCC para uma mostra.
Com base APENAS nos dados abaixo, escreva os textos do banner em português do Brasil, em linguagem simples e direta.
Não invente números, resultados ou dados que não estejam no resumo; se o resumo não disser o resultado, descreva o que o trabalho entrega.
Cada seção deve ter no máximo 450 caracteres, em 2 a 4 tópicos curtos, cada tópico começando com "• " e separados por quebra de linha.
O campo "titulo" é o título do trabalho (pode encurtar, sem mudar o sentido).
Responda somente com um JSON com as chaves: titulo, introducao, objetivo, metodologia, resultados, conclusao.

Título: ${dados.titulo}${dados.subtitulo ? `\nSubtítulo: ${dados.subtitulo}` : ''}
Resumo: ${dados.resumo}
Área: ${dados.area}
Curso: ${dados.curso}
Autor(a): ${dados.aluno}
Orientador(a): ${dados.orientador ?? '—'}
Ano: ${dados.ano}`;

  const controle = new AbortController();
  const tempo = setTimeout(() => controle.abort(), 30_000);
  try {
    const resposta = await fetch(process.env.IA_URL || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controle.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.IA_MODELO || 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: pedido }],
      }),
    });
    if (!resposta.ok) throw new IaIndisponivel(`O serviço de IA respondeu ${resposta.status}`);
    const corpo = await resposta.json() as { content?: { type: string; text?: string }[] };
    const texto = corpo.content?.find((c) => c.type === 'text')?.text ?? '';
    const json = texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1);
    const lido = JSON.parse(json) as Partial<Record<keyof TextosBanner, unknown>>;
    const textos = Object.fromEntries(SECOES_BANNER.map((s) => [s, String(lido[s] ?? '').trim().slice(0, LIMITE_SECAO)])) as unknown as TextosBanner;
    if (!textos.introducao && !textos.objetivo) throw new IaIndisponivel('Resposta da IA sem os textos');
    if (!textos.titulo) textos.titulo = dados.titulo;
    return textos;
  } catch (erro) {
    if (erro instanceof IaIndisponivel) throw erro;
    throw new IaIndisponivel(erro instanceof Error ? erro.message : 'Falha no serviço de IA');
  } finally {
    clearTimeout(tempo);
  }
}
