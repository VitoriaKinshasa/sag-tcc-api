import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { pool, transacao, type Db } from '../../shared/db.js';
import { ErroNegocio } from '../../shared/errors.js';
import { emailService } from '../../shared/notificacao.js';
import { usuariosRepository } from '../usuarios/usuarios.repository.js';

export const MAX_TENTATIVAS = 5;          // RNF04
export const MINUTOS_BLOQUEIO = 15;       // RNF04
export const DURACAO_SESSAO = '30m';      // RNF04
const HORAS_LINK_REDEFINICAO = 1;         // RF04
const HORAS_LINK_PRIMEIRO_ACESSO = 72;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const authService = {
  /** UC01 – Fazer login (RF01, RNF03, RNF04). */
  async login(email: string, senha: string) {
    const usuario = await usuariosRepository.buscarPorEmail(pool, email);
    // Mensagem genérica: não revela se o e-mail existe nem qual campo está errado
    const credenciaisInvalidas = new ErroNegocio(401, 'E-mail ou senha inválidos');
    if (!usuario) throw credenciaisInvalidas;

    if (!usuario.ativo) throw new ErroNegocio(403, 'Usuário desativado. Procure a coordenação');
    if (usuario.bloqueado_ate && usuario.bloqueado_ate > new Date()) {
      throw new ErroNegocio(423, 'Conta bloqueada temporariamente por excesso de tentativas. Tente novamente mais tarde', 'RNF04');
    }
    if (!usuario.senha_hash) throw new ErroNegocio(403, 'Defina sua senha pelo link de primeiro acesso enviado por e-mail');

    const senhaCorreta = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaCorreta) {
      const tentativas = usuario.tentativas_login + 1;
      if (tentativas >= MAX_TENTATIVAS) {
        const bloqueadoAte = new Date(Date.now() + MINUTOS_BLOQUEIO * 60_000);
        await usuariosRepository.registrarFalhaLogin(pool, usuario.id, 0, bloqueadoAte);
        throw new ErroNegocio(423, `Conta bloqueada por ${MINUTOS_BLOQUEIO} minutos após ${MAX_TENTATIVAS} tentativas erradas`, 'RNF04');
      }
      await usuariosRepository.registrarFalhaLogin(pool, usuario.id, tentativas, null);
      throw credenciaisInvalidas;
    }

    await usuariosRepository.zerarTentativas(pool, usuario.id);
    const token = jwt.sign(
      { perfil: usuario.perfil, cursoId: usuario.curso_id },
      env.JWT_SECRET,
      { subject: String(usuario.id), expiresIn: DURACAO_SESSAO },
    );
    return {
      token,
      usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil },
      termoPendente: !usuario.termo_aceito_em, // RNF15: aceitar o termo no primeiro acesso
    };
  },

  /** Cria um link de uso único (primeiro acesso ou redefinição de senha) e envia por e-mail. */
  async criarLinkSenha(db: Db, usuarioId: number, email: string, tipo: 'PRIMEIRO_ACESSO' | 'REDEFINICAO_SENHA') {
    const token = crypto.randomBytes(32).toString('hex');
    const horas = tipo === 'PRIMEIRO_ACESSO' ? HORAS_LINK_PRIMEIRO_ACESSO : HORAS_LINK_REDEFINICAO;
    await db.query(
      'INSERT INTO token_acesso (usuario_id, token_hash, tipo, expira_em) VALUES ($1, $2, $3, $4)',
      [usuarioId, hashToken(token), tipo, new Date(Date.now() + horas * 3_600_000)],
    );
    const assunto = tipo === 'PRIMEIRO_ACESSO' ? 'Bem-vindo(a) ao SAG-TCC' : 'Redefinição de senha';
    await emailService.enviar(email, `[SAG-TCC] ${assunto}`,
      `Use o link abaixo para definir sua senha (válido por ${horas} hora(s)):\n${env.APP_URL}/definir-senha?token=${token}`);
    return token;
  },

  /** UC02 – Recuperar senha (RF04). A resposta é sempre a mesma, exista o e-mail ou não. */
  async solicitarRedefinicao(email: string) {
    const usuario = await usuariosRepository.buscarPorEmail(pool, email);
    if (usuario?.ativo) await this.criarLinkSenha(pool, usuario.id, usuario.email, 'REDEFINICAO_SENHA');
    return { mensagem: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha' };
  },

  /** Define a senha a partir do link (primeiro acesso ou redefinição). O link só pode ser usado uma vez. */
  async definirSenha(token: string, novaSenha: string) {
    return transacao(async (db) => {
      const { rows } = await db.query(
        `SELECT id, usuario_id FROM token_acesso
         WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now() FOR UPDATE`,
        [hashToken(token)],
      );
      if (!rows[0]) throw new ErroNegocio(410, 'Link inválido ou expirado. Solicite um novo');
      await usuariosRepository.definirSenha(db, Number(rows[0].usuario_id), await bcrypt.hash(novaSenha, 10)); // RNF03
      await db.query('UPDATE token_acesso SET usado_em = now() WHERE id = $1', [rows[0].id]);
      return { mensagem: 'Senha definida com sucesso' };
    });
  },

  /** RNF15 – aceite do termo de uso de dados no primeiro acesso. */
  async aceitarTermo(usuarioId: number) {
    await usuariosRepository.aceitarTermo(pool, usuarioId);
    return { mensagem: 'Termo de uso de dados aceito' };
  },
};
