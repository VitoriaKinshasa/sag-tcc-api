import { pool, transacao, type Db } from '../../shared/db.js';
import { ErroNegocio, naoEncontrado } from '../../shared/errors.js';
import { registrarAuditoria } from '../../shared/auditoria.js';
import { notificar } from '../../shared/notificacao.js';
import { diaEmManaus, SITUACOES_ATIVAS, type UsuarioLogadoLike } from '../../shared/util.js';

/** As etapas do TCC, na ordem em que acontecem no semestre. */
export const ETAPAS = ['PROPOSTA', 'QUALIFICACAO', 'VERSAO_FINAL', 'DEFESA', 'ENTREGA_DEFINITIVA'] as const;
export type Etapa = (typeof ETAPAS)[number];
export const NOME_ETAPA: Record<Etapa, string> = {
  PROPOSTA: 'Proposta', QUALIFICACAO: 'Qualificação', VERSAO_FINAL: 'Versão final',
  DEFESA: 'Defesa', ENTREGA_DEFINITIVA: 'Entrega definitiva',
};

export interface EtapaInformada { etapa: Etapa; dataInicio: string; dataLimite: string }
interface EtapaGravada { id: number; etapa: Etapa; data_inicio: string; data_limite: string }

/** UC13 – as 5 etapas são obrigatórias, cada uma com início ≤ limite, e em ordem (uma etapa não começa antes da anterior terminar). */
function validarEtapas(etapas: EtapaInformada[]) {
  const porEtapa = new Map(etapas.map((e) => [e.etapa, e]));
  if (porEtapa.size !== etapas.length) throw new ErroNegocio(422, 'Cada etapa deve aparecer uma única vez', 'RF12');
  const faltando = ETAPAS.filter((e) => !porEtapa.has(e));
  if (faltando.length) {
    throw new ErroNegocio(422, `Informe as datas de todas as etapas. Faltando: ${faltando.map((e) => NOME_ETAPA[e]).join(', ')}`, 'RF12');
  }
  let limiteAnterior = '';
  for (const nome of ETAPAS) {
    const e = porEtapa.get(nome)!;
    if (e.dataInicio > e.dataLimite) {
      throw new ErroNegocio(422, `${NOME_ETAPA[nome]}: a data de início deve ser anterior ou igual à data-limite`, 'RF12');
    }
    if (limiteAnterior && e.dataInicio <= limiteAnterior) {
      throw new ErroNegocio(422, `${NOME_ETAPA[nome]} deve começar depois do fim da etapa anterior`, 'RF12');
    }
    limiteAnterior = e.dataLimite;
  }
}

async function buscarEtapas(db: Db, cursoId: number, semestre: string): Promise<EtapaGravada[]> {
  const { rows } = await db.query(
    `SELECT id, etapa, data_inicio, data_limite FROM calendario_etapa
     WHERE curso_id = $1 AND semestre = $2 ORDER BY etapa`,
    [cursoId, semestre],
  );
  return rows;
}

/** Avisa alunos com TCC em andamento no curso e seus orientadores (RF37). */
async function avisarCurso(db: Db, cursoId: number, titulo: string, mensagem: string) {
  const { rows } = await db.query(
    `SELECT DISTINCT unnest(ARRAY[aluno_id, orientador_id]) AS id FROM tcc
     WHERE curso_id = $1 AND situacao = ANY($2)`,
    [cursoId, SITUACOES_ATIVAS],
  );
  for (const { id } of rows) if (id) await notificar(db, Number(id), titulo, mensagem);
}

const resumo = (etapas: EtapaInformada[]) =>
  ETAPAS.map((n) => { const e = etapas.find((x) => x.etapa === n)!; return `${NOME_ETAPA[n]}: até ${e.dataLimite.split('-').reverse().join('/')}`; }).join('; ');

function cursoDaCoordenacao(u: UsuarioLogadoLike) {
  if (!u.cursoId) throw new ErroNegocio(422, 'Coordenação sem curso vinculado');
  return u.cursoId;
}

export const calendarioService = {
  /** Calendários de um curso (todos os semestres, o mais recente primeiro). */
  async listar(cursoId: number) {
    const { rows } = await pool.query(
      `SELECT semestre, json_agg(json_build_object('etapa', etapa, 'dataInicio', data_inicio, 'dataLimite', data_limite) ORDER BY etapa) AS etapas
       FROM calendario_etapa WHERE curso_id = $1 GROUP BY semestre ORDER BY semestre DESC`,
      [cursoId],
    );
    return rows;
  },

  /** UC13 – Cadastrar o calendário de etapas do semestre (RF12). */
  async criar(coordenacao: UsuarioLogadoLike, semestre: string, etapas: EtapaInformada[]) {
    const cursoId = cursoDaCoordenacao(coordenacao);
    validarEtapas(etapas);
    return transacao(async (db) => {
      if ((await buscarEtapas(db, cursoId, semestre)).length) {
        throw new ErroNegocio(409, `O calendário de ${semestre} já existe. Use a opção de alterar`);
      }
      for (const e of etapas) {
        const { rows } = await db.query(
          `INSERT INTO calendario_etapa (curso_id, semestre, etapa, data_inicio, data_limite)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [cursoId, semestre, e.etapa, e.dataInicio, e.dataLimite],
        );
        await registrarAuditoria(db, { usuarioId: coordenacao.id, tabela: 'calendario_etapa', registroId: Number(rows[0].id), operacao: 'INSERT', novo: rows[0] });
      }
      await avisarCurso(db, cursoId, `Calendário de ${semestre} publicado`, resumo(etapas));
      return { semestre, etapas: await buscarEtapas(db, cursoId, semestre) };
    });
  },

  /** UC13 A1 – Alterar o calendário. RN03: etapas que já terminaram não podem ser alteradas. */
  async alterar(coordenacao: UsuarioLogadoLike, semestre: string, etapas: EtapaInformada[]) {
    const cursoId = cursoDaCoordenacao(coordenacao);
    validarEtapas(etapas);
    const hoje = diaEmManaus();
    return transacao(async (db) => {
      const atuais = await buscarEtapas(db, cursoId, semestre);
      if (!atuais.length) throw naoEncontrado(`Calendário de ${semestre}`);
      let mudou = false;
      for (const nova of etapas) {
        const atual = atuais.find((a) => a.etapa === nova.etapa)!;
        if (atual.data_inicio === nova.dataInicio && atual.data_limite === nova.dataLimite) continue;
        if (atual.data_limite < hoje) {
          throw new ErroNegocio(422, `A etapa ${NOME_ETAPA[nova.etapa]} já terminou e não pode ser alterada`, 'RN03');
        }
        if (nova.dataLimite < hoje) {
          throw new ErroNegocio(422, `${NOME_ETAPA[nova.etapa]}: a nova data-limite não pode ficar no passado`, 'RN03');
        }
        const { rows } = await db.query(
          'UPDATE calendario_etapa SET data_inicio = $2, data_limite = $3 WHERE id = $1 RETURNING *',
          [atual.id, nova.dataInicio, nova.dataLimite],
        );
        await registrarAuditoria(db, { usuarioId: coordenacao.id, tabela: 'calendario_etapa', registroId: atual.id, operacao: 'UPDATE', anterior: atual, novo: rows[0] });
        mudou = true;
      }
      if (mudou) await avisarCurso(db, cursoId, `Calendário de ${semestre} alterado`, resumo(etapas));
      return { semestre, etapas: await buscarEtapas(db, cursoId, semestre) };
    });
  },
};
