import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/shared/db.js';
import { emailService } from '../src/shared/notificacao.js';
import { api, criarUsuario, novoUsuarioLogado, SENHA } from './ajudantes.js';

afterAll(() => pool.end());

describe('UC01 – Fazer login (RF01, RNF04)', () => {
  it('entra com e-mail e senha corretos e recebe o token', async () => {
    const u = await criarUsuario('ALUNO');
    const res = await api().post('/api/auth/login').send({ email: u.email, senha: SENHA });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.termoPendente).toBe(true); // RNF15
  });

  it('não revela qual campo está errado', async () => {
    const u = await criarUsuario('ALUNO');
    const senhaErrada = await api().post('/api/auth/login').send({ email: u.email, senha: 'errada' });
    const emailInexistente = await api().post('/api/auth/login').send({ email: 'ninguem@uea.edu.br', senha: SENHA });
    expect(senhaErrada.status).toBe(401);
    expect(emailInexistente.body.erro).toBe(senhaErrada.body.erro);
  });

  it('bloqueia a conta por 15 minutos na 5ª tentativa errada', async () => {
    const u = await criarUsuario('ALUNO');
    for (let i = 0; i < 4; i++) {
      const r = await api().post('/api/auth/login').send({ email: u.email, senha: 'errada' });
      expect(r.status).toBe(401);
    }
    const quinta = await api().post('/api/auth/login').send({ email: u.email, senha: 'errada' });
    expect(quinta.status).toBe(423);
    // mesmo com a senha certa, continua bloqueado
    const comSenhaCerta = await api().post('/api/auth/login').send({ email: u.email, senha: SENHA });
    expect(comSenhaCerta.status).toBe(423);
  });

  it('recusa usuário desativado', async () => {
    const u = await criarUsuario('ALUNO');
    await pool.query('UPDATE usuario SET ativo = FALSE WHERE id = $1', [u.id]);
    const res = await api().post('/api/auth/login').send({ email: u.email, senha: SENHA });
    expect(res.status).toBe(403);
  });
});

describe('UC02 – Recuperar senha (RF04)', () => {
  it('envia o link, permite definir nova senha e o link só vale uma vez', async () => {
    const u = await criarUsuario('ALUNO');
    const res = await api().post('/api/auth/recuperar-senha').send({ email: u.email });
    expect(res.status).toBe(200);
    const token = emailService.enviados.at(-1)!.texto.split('token=')[1];

    const def = await api().post('/api/auth/definir-senha').send({ token, novaSenha: 'NovaSenha#2026' });
    expect(def.status).toBe(200);
    const login = await api().post('/api/auth/login').send({ email: u.email, senha: 'NovaSenha#2026' });
    expect(login.status).toBe(200);

    const reuso = await api().post('/api/auth/definir-senha').send({ token, novaSenha: 'OutraSenha#2026' });
    expect(reuso.status).toBe(410);
  });

  it('responde igual para e-mail não cadastrado', async () => {
    const res = await api().post('/api/auth/recuperar-senha').send({ email: 'naoexiste@uea.edu.br' });
    expect(res.status).toBe(200);
  });
});

describe('UC03 – Manter usuários (CRUD) (RF03, RNF05)', () => {
  it('coordenação cadastra aluno e o sistema envia o link de primeiro acesso', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const res = await api().post('/api/usuarios').set(coord.auth)
      .send({ nome: 'Maria da Silva', email: `maria${Date.now()}@uea.edu.br`, perfil: 'ALUNO', cursoId: 1, matricula: `2026${Date.now()}` });
    expect(res.status).toBe(201);
    expect(emailService.enviados.at(-1)!.assunto).toContain('Bem-vindo');
    const { rows } = await pool.query("SELECT 1 FROM auditoria WHERE tabela = 'usuario' AND registro_id = $1", [res.body.id]);
    expect(rows).toHaveLength(1); // RF25
  });

  it('exige matrícula para aluno', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const res = await api().post('/api/usuarios').set(coord.auth)
      .send({ nome: 'Sem Matrícula', email: `sem${Date.now()}@uea.edu.br`, perfil: 'ALUNO', cursoId: 1 });
    expect(res.status).toBe(422);
  });

  it('recusa e-mail duplicado', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const existente = await criarUsuario('ORIENTADOR');
    const res = await api().post('/api/usuarios').set(coord.auth)
      .send({ nome: 'Duplicado', email: existente.email.toUpperCase(), perfil: 'ORIENTADOR', cursoId: 1 });
    expect(res.status).toBe(409);
  });

  it('aluno não pode cadastrar usuários', async () => {
    const aluno = await novoUsuarioLogado('ALUNO');
    const res = await api().get('/api/usuarios').set(aluno.auth);
    expect(res.status).toBe(403);
  });

  it('usuário desativado perde o acesso', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const prof = await criarUsuario('ORIENTADOR');
    expect((await api().patch(`/api/usuarios/${prof.id}/desativar`).set(coord.auth)).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: prof.email, senha: SENHA })).status).toBe(403);
  });
});

describe('UC04 – Manter cursos e áreas (CRUD) (RF32)', () => {
  it('recusa sigla duplicada', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const res = await api().post('/api/cursos').set(coord.auth).send({ nome: 'Outro Sistemas', sigla: 'si' });
    expect(res.status).toBe(409);
  });

  it('não exclui curso com registros vinculados, apenas desativa', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const res = await api().delete('/api/cursos/1').set(coord.auth);
    expect(res.status).toBe(409);
  });

  it('exclui curso sem registros', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO');
    const criado = await api().post('/api/cursos').set(coord.auth).send({ nome: 'Curso Temporário', sigla: `T${Date.now() % 100000}` });
    const res = await api().delete(`/api/cursos/${criado.body.id}`).set(coord.auth);
    expect(res.status).toBe(200);
  });
});

describe('UC05 – Manter áreas de interesse (RF05)', () => {
  it('exige ao menos uma área e salva as escolhidas', async () => {
    const prof = await novoUsuarioLogado('ORIENTADOR');
    expect((await api().put('/api/usuarios/me/areas').set(prof.auth).send({ areaIds: [] })).status).toBe(422);
    const ok = await api().put('/api/usuarios/me/areas').set(prof.auth).send({ areaIds: [1, 2] });
    expect(ok.status).toBe(200);
    const lista = await api().get('/api/orientacao/orientadores?areaId=2').set(prof.auth);
    expect(lista.body.some((p: { id: number }) => p.id === prof.id)).toBe(true);
  });
});
