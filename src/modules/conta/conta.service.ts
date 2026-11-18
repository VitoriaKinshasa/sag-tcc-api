import { pool } from '../../shared/db.js';
import { naoEncontrado } from '../../shared/errors.js';
import { notificar, notificarCoordenacao } from '../../shared/notificacao.js';
import type { UsuarioLogadoLike } from '../../shared/util.js';

/** Tela "Meus dados" e direitos do titular dos dados (LGPD, art. 18). */
export const contaService = {
  /** Dados da própria pessoa (sem senha nem informações internas de login). */
  async meusDados(usuario: UsuarioLogadoLike) {
    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.perfil, u.matricula, u.externo, u.instituicao, u.titulacao, u.criado_em,
              u.termo_aceito_em, u.acesso_anterior_em, u.ultimo_acesso_em,
              c.id AS curso_id, c.nome AS curso, c.sigla AS curso_sigla,
              (SELECT json_agg(a.nome ORDER BY a.nome) FROM professor_area pa JOIN area_conhecimento a ON a.id = pa.area_id
               WHERE pa.professor_id = u.id) AS areas,
              (SELECT count(*) FROM tcc t WHERE t.orientador_id = u.id AND t.situacao IN ('EM_PROPOSTA', 'EM_DESENVOLVIMENTO', 'APTO_DEFESA')) AS orientandos,
              (SELECT count(*) FROM banca_membro m JOIN banca b ON b.id = m.banca_id WHERE m.usuario_id = u.id AND b.status <> 'CANCELADA') AS bancas
       FROM usuario u LEFT JOIN curso c ON c.id = u.curso_id WHERE u.id = $1`,
      [usuario.id],
    );
    if (!rows[0]) throw naoEncontrado('Usuário');
    return rows[0];
  },

  /** "Baixar meus dados": tudo o que o sistema guarda sobre a pessoa, num arquivo (LGPD, direito de acesso). */
  async exportar(usuario: UsuarioLogadoLike) {
    const consulta = async (sql: string) => (await pool.query(sql, [usuario.id])).rows;
    const [tccs, versoes, eventos, solicitacoes, bancas, notificacoes, downloads, declaracoes] = await Promise.all([
      consulta(`SELECT id, titulo, subtitulo, resumo, situacao, criado_em, concluido_em FROM tcc WHERE aluno_id = $1`),
      consulta(`SELECT v.tcc_id, v.numero, v.etapa, v.arquivo_nome, v.arquivo_tamanho, v.enviado_em, v.fora_do_prazo
                FROM versao_tcc v WHERE v.enviado_por = $1 ORDER BY v.enviado_em`),
      consulta(`SELECT e.tcc_id, e.tipo, e.descricao, e.criado_em FROM evento_tcc e
                WHERE e.autor_id = $1 OR e.tcc_id IN (SELECT id FROM tcc WHERE aluno_id = $1) ORDER BY e.criado_em`),
      consulta(`SELECT s.tcc_id, s.status, s.criado_em, s.respondido_em FROM solicitacao_orientacao s
                WHERE s.professor_id = $1 OR s.tcc_id IN (SELECT id FROM tcc WHERE aluno_id = $1)`),
      consulta(`SELECT b.id, b.data_hora, b.status, m.papel FROM banca_membro m JOIN banca b ON b.id = m.banca_id WHERE m.usuario_id = $1`),
      consulta(`SELECT titulo, mensagem, lida, criado_em FROM notificacao WHERE usuario_id = $1 ORDER BY criado_em`),
      consulta(`SELECT d.versao_id, d.baixado_em FROM download_versao d WHERE d.usuario_id = $1 ORDER BY d.baixado_em`),
      consulta(`SELECT codigo, tipo, emitida_em FROM declaracao WHERE usuario_id = $1`),
    ]);
    return {
      geradoEm: new Date().toISOString(),
      aviso: 'Dados guardados pelo SAG-TCC sobre você (Lei 13.709/2018 – LGPD). A senha não aparece porque é guardada de forma irreversível.',
      cadastro: await this.meusDados(usuario),
      tccs, versoesEnviadas: versoes, historico: eventos, solicitacoesDeOrientacao: solicitacoes, bancas, notificacoes,
      downloadsFeitos: downloads, declaracoes,
    };
  },

  /** Pedido de correção de dados: vai para a coordenação do curso (ou de todos os cursos, para membros externos). */
  async pedirCorrecao(usuario: UsuarioLogadoLike, mensagem: string) {
    const dados = await this.meusDados(usuario);
    const texto = `${dados.nome} (${dados.email}) pediu a correção de dados cadastrais: "${mensagem.trim()}"`;
    // alunos: coordenação do curso; professores, coordenações e administradores: administração do sistema;
    // membros externos: coordenações (que também os cadastram)
    if (dados.perfil === 'ALUNO' && dados.curso_id) {
      await notificarCoordenacao(pool, Number(dados.curso_id), 'Pedido de correção de dados', texto);
      return { mensagem: 'Pedido enviado para a coordenação' };
    }
    const destino = dados.externo ? "perfil = 'COORDENACAO'" : "perfil = 'ADMINISTRADOR'";
    let { rows } = await pool.query(`SELECT id FROM usuario WHERE ${destino} AND ativo`);
    if (!rows.length) rows = (await pool.query("SELECT id FROM usuario WHERE perfil = 'COORDENACAO' AND ativo")).rows;
    for (const { id } of rows) await notificar(pool, Number(id), 'Pedido de correção de dados', texto);
    return { mensagem: dados.externo ? 'Pedido enviado para a coordenação' : 'Pedido enviado para a administração do sistema' };
  },
};
