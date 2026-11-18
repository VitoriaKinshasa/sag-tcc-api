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
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const existente = await criarUsuario('ORIENTADOR');
    const res = await api().post('/api/usuarios').set(admin.auth)
      .send({ nome: 'Duplicado', email: existente.email.toUpperCase(), perfil: 'ORIENTADOR' });
    expect(res.status).toBe(409);
  });

  it('aluno não pode cadastrar usuários', async () => {
    const aluno = await novoUsuarioLogado('ALUNO');
    const res = await api().get('/api/usuarios').set(aluno.auth);
    expect(res.status).toBe(403);
  });

  it('coordenação vê os alunos do próprio curso, todos os professores do NUCOMP e os membros externos', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 2 });
    const doCurso = await criarUsuario('ALUNO', { cursoId: 2 });
    const deOutroCurso = await criarUsuario('ALUNO', { cursoId: 1 });
    const coordOutroCurso = await criarUsuario('COORDENACAO', { cursoId: 1 });
    const professor = await criarUsuario('ORIENTADOR');
    const externo = await criarUsuario('MEMBRO_BANCA', { externo: true });
    const res = await api().get('/api/usuarios').set(coord.auth);
    expect(res.status).toBe(200);
    const ids = res.body.map((u: { id: number }) => Number(u.id));
    expect(ids).toContain(doCurso.id);
    expect(ids).toContain(professor.id);
    expect(ids).toContain(externo.id);
    expect(ids).not.toContain(deOutroCurso.id);
    expect(ids).not.toContain(coordOutroCurso.id);
  });

  it('o administrador edita professores do NUCOMP; a coordenação só consulta', async () => {
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 2 });
    const professor = await criarUsuario('ORIENTADOR');
    const negado = await api().put(`/api/usuarios/${professor.id}`).set(coord.auth).send({ nome: 'Prof. Outro Nome', email: professor.email });
    expect(negado.status).toBe(403);
    expect(negado.body.erro).toBe('Este cadastro é feito pela administração do sistema');
    const res = await api().put(`/api/usuarios/${professor.id}`).set(admin.auth).send({ nome: 'Prof. Nome Corrigido', email: professor.email, cursoId: 2 });
    expect(res.status).toBe(200);
    expect(res.body.curso_id).toBeNull(); // professor continua sem curso
  });

  it('coordenação não edita, não desativa e não cadastra alunos de outro curso', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 2 });
    const deOutroCurso = await criarUsuario('ALUNO', { cursoId: 1 });
    expect((await api().put(`/api/usuarios/${deOutroCurso.id}`).set(coord.auth).send({ nome: 'Trocado', email: deOutroCurso.email })).status).toBe(404);
    expect((await api().patch(`/api/usuarios/${deOutroCurso.id}/desativar`).set(coord.auth)).status).toBe(404);
    const novo = await api().post('/api/usuarios').set(coord.auth)
      .send({ nome: 'Aluno de Outro Curso', email: `outro${Date.now()}@uea.edu.br`, perfil: 'ALUNO', cursoId: 1, matricula: `X${Date.now()}` });
    expect(novo.status).toBe(403);
  });

  it('aluno novo entra no curso da coordenação; professor novo (cadastrado pelo administrador) fica sem curso', async () => {
    const coord = await novoUsuarioLogado('COORDENACAO', { cursoId: 3 });
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const aluno = await api().post('/api/usuarios').set(coord.auth)
      .send({ nome: 'Aluno Novo', email: `aluno${Date.now()}@uea.edu.br`, perfil: 'ALUNO', matricula: `LC${Date.now()}` });
    expect(aluno.status).toBe(201);
    expect(Number(aluno.body.curso_id)).toBe(3);
    expect((await api().post('/api/usuarios').set(coord.auth)
      .send({ nome: 'Professor Novo', email: `p${Date.now()}@uea.edu.br`, perfil: 'ORIENTADOR' })).status).toBe(403);
    const prof = await api().post('/api/usuarios').set(admin.auth)
      .send({ nome: 'Professor Novo', email: `prof${Date.now()}@uea.edu.br`, perfil: 'ORIENTADOR', cursoId: 3 });
    expect(prof.status).toBe(201);
    expect(prof.body.curso_id).toBeNull();
  });

  it('usuário desativado perde o acesso', async () => {
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const prof = await criarUsuario('ORIENTADOR');
    expect((await api().patch(`/api/usuarios/${prof.id}/desativar`).set(admin.auth)).status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: prof.email, senha: SENHA })).status).toBe(403);
  });
});

describe('UC04 – Manter cursos e áreas (CRUD) (RF32)', () => {
  it('recusa sigla duplicada', async () => {
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const res = await api().post('/api/cursos').set(admin.auth).send({ nome: 'Outro Sistemas', sigla: 'si' });
    expect(res.status).toBe(409);
  });

  it('não exclui curso com registros vinculados, apenas desativa', async () => {
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const res = await api().delete('/api/cursos/1').set(admin.auth);
    expect(res.status).toBe(409);
  });

  it('exclui curso sem registros; só o administrador cadastra cursos e áreas', async () => {
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const coord = await novoUsuarioLogado('COORDENACAO');
    expect((await api().post('/api/cursos').set(coord.auth).send({ nome: 'Curso da Coordenação', sigla: 'CC1' })).status).toBe(403);
    expect((await api().post('/api/areas').set(coord.auth).send({ nome: 'Área da Coordenação' })).status).toBe(403);
    const criado = await api().post('/api/cursos').set(admin.auth).send({ nome: 'Curso Temporário', sigla: `T${Date.now() % 100000}` });
    const res = await api().delete(`/api/cursos/${criado.body.id}`).set(admin.auth);
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

describe('Administrador do sistema (FSM-SAG-005)', () => {
  it('cadastra a coordenação de um curso, que passa a ser a coordenação registrada no curso', async () => {
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const res = await api().post('/api/usuarios').set(admin.auth)
      .send({ nome: 'Profa. Nova Coordenação', email: `coord${Date.now()}@uea.edu.br`, perfil: 'COORDENACAO', cursoId: 2 });
    expect(res.status).toBe(201);
    expect(Number(res.body.curso_id)).toBe(2);
    const { rows } = await pool.query('SELECT coordenador_id FROM curso WHERE id = 2');
    expect(Number(rows[0].coordenador_id)).toBe(Number(res.body.id));
    expect(emailService.enviados.at(-1)!.assunto).toContain('Bem-vindo');
  });

  it('coordenação sem curso é recusada; a coordenação não cadastra outra coordenação', async () => {
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const coord = await novoUsuarioLogado('COORDENACAO');
    expect((await api().post('/api/usuarios').set(admin.auth)
      .send({ nome: 'Sem Curso', email: `sc${Date.now()}@uea.edu.br`, perfil: 'COORDENACAO' })).status).toBe(422);
    const negado = await api().post('/api/usuarios').set(coord.auth)
      .send({ nome: 'Outra Coordenação', email: `oc${Date.now()}@uea.edu.br`, perfil: 'COORDENACAO', cursoId: 1 });
    expect(negado.status).toBe(403);
  });

  it('professor vira coordenação e volta a ser professor, sem perder o cadastro', async () => {
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const prof = await criarUsuario('ORIENTADOR');
    const vira = await api().put(`/api/usuarios/${prof.id}`).set(admin.auth).send({ nome: 'Prof. Promovido', email: prof.email, perfil: 'COORDENACAO', cursoId: 3 });
    expect(vira.status).toBe(200);
    expect(vira.body.perfil).toBe('COORDENACAO');
    expect(Number(vira.body.curso_id)).toBe(3);
    const volta = await api().put(`/api/usuarios/${prof.id}`).set(admin.auth).send({ nome: 'Prof. Promovido', email: prof.email, perfil: 'ORIENTADOR' });
    expect(volta.body.perfil).toBe('ORIENTADOR');
    expect(volta.body.curso_id).toBeNull();
    const { rows } = await pool.query('SELECT 1 FROM curso WHERE coordenador_id = $1', [prof.id]);
    expect(rows).toHaveLength(0);
  });

  it('não cadastra nem vê alunos; vê a auditoria; a coordenação não vê administradores', async () => {
    const admin = await novoUsuarioLogado('ADMINISTRADOR');
    const coord = await novoUsuarioLogado('COORDENACAO');
    const negado = await api().post('/api/usuarios').set(admin.auth)
      .send({ nome: 'Aluno do Admin', email: `aa${Date.now()}@uea.edu.br`, perfil: 'ALUNO', cursoId: 1, matricula: `AD${Date.now()}` });
    expect(negado.status).toBe(403);
    expect(negado.body.erro).toBe('Alunos são cadastrados pela coordenação do curso');
    const lista = await api().get('/api/usuarios').set(admin.auth);
    expect(lista.body.some((u: { perfil: string }) => u.perfil === 'ALUNO')).toBe(false);
    expect((await api().get('/api/auditoria').set(admin.auth)).status).toBe(200);
    expect((await api().get('/api/painel').set(admin.auth)).status).toBe(403); // o painel é do curso
    const daCoord = await api().get('/api/usuarios').set(coord.auth);
    expect(daCoord.body.some((u: { id: number }) => Number(u.id) === admin.id)).toBe(false);
  });
});
