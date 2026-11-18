// "Minha defesa" do aluno: dados da defesa em partes separadas (trabalho, data e local, resultado, banca e ata).
import { CalendarPlus, Check, Clock, Download, GraduationCap, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, baixar } from '../../api';
import { Ficha, Secao } from '../../components/blocos';
import { Estado, Pagina, Selo } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { talvez, useCarregar } from '../../hooks';
import type { Ata, Banca, MembroBanca } from '../../types';
import { dia, nota, RESULTADOS } from '../../util';
import { ModalConvites } from '../comum/Bancas';

const FUSO = 'America/Manaus';
/** "Terça-feira, 10/11/2026" */
const diaSemana = (v: string) => {
  const d = new Date(v);
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: FUSO });
  return `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${d.toLocaleDateString('pt-BR', { timeZone: FUSO })}`;
};
const horario = (v: string) => new Date(v).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });
const notaCurta = (n: number | null) => (n == null ? '—' : nota(n).replace(/,?0+$/, '').replace(/,$/, ''));
const diasAte = (data: string) => {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: FUSO });
  return Math.round((Date.parse(data.slice(0, 10)) - Date.parse(hoje)) / 86400000);
};

/** "Presidente (orientadora)", "Titular", "Suplente" */
function papelNaBanca(m: MembroBanca) {
  if (m.papel === 'PRESIDENTE') return `Presidente (${/^profa\.?\s/i.test(m.nome) ? 'orientadora' : /^prof\.?\s/i.test(m.nome) ? 'orientador' : 'orientador(a)'})`;
  return m.papel === 'TITULAR' ? 'Titular' : 'Suplente';
}

export function MinhaDefesa() {
  const c = useCarregar(async () => {
    const [bancas, me] = await Promise.all([api<Banca[]>('GET', '/bancas/minhas'), talvez(api<{ curso: string | null }>('GET', '/me'))]);
    const banca = bancas.find((b) => b.status === 'AGENDADA') ?? bancas.find((b) => b.status === 'REALIZADA');
    const ata = banca?.status === 'REALIZADA' ? await talvez(api<Ata>('GET', `/bancas/${banca.id}/ata`)) : null;
    const cancelada = !banca ? bancas.find((b) => b.status === 'CANCELADA') : undefined;
    return { banca: banca && me?.curso ? { ...banca, curso: me.curso } : banca, ata, cancelada };
  }, []);

  return (
    <Estado c={c}>
      {({ banca, ata, cancelada }) => {
        if (!banca) {
          return (
            <Pagina titulo="Minha defesa">
              <div className="vazio-pagina">
                <GraduationCap className="vazio-icone" aria-hidden="true" strokeWidth={1.5} />
                <h2>Nenhuma defesa marcada</h2>
                <p>O seu orientador cadastra a banca quando o TCC estiver “Apto à defesa”. Quando ela for marcada, a data, o local e a banca aparecem aqui.</p>
                {cancelada && <p className="texto-calmo">A última banca marcada foi cancelada{cancelada.motivo_cancelamento ? `. Motivo: ${cancelada.motivo_cancelamento}` : '.'}</p>}
              </div>
            </Pagina>
          );
        }
        return banca.status === 'AGENDADA' ? <DefesaAgendada b={banca} /> : <DefesaRealizada b={banca} ata={ata} />;
      }}
    </Estado>
  );
}

function Titulo({ selo, cor }: { selo: string; cor: 'verde' | 'azul' | 'amarelo' }) {
  return <span className="titulo-com-selo">Minha defesa <Selo cor={cor}>{selo}</Selo></span>;
}

function PartesComuns({ b }: { b: Banca }) {
  return (
    <>
      <Secao titulo="Trabalho">
        <div className="caixa caixa-ficha">
          <Ficha linhas={[['Título', b.titulo], ['Aluno(a)', b.aluno.replace(/\s*\((aluna|aluno)\)$/i, '')], ['Curso', b.curso]]} />
        </div>
      </Secao>
      <Secao titulo="Data e local">
        <div className="caixa caixa-ficha">
          <Ficha linhas={[['Data', diaSemana(b.data_hora)], ['Horário', horario(b.data_hora)], ['Local', b.local_ou_link]]} />
        </div>
      </Secao>
    </>
  );
}

function ListaBanca({ b }: { b: Banca }) {
  return (
    <Secao titulo="Banca">
      <ul className="caixa lista-caixa">
        {b.membros.map((m) => (
          <li key={String(m.usuarioId)}>
            <span>{m.nome}{m.externo && m.instituicao && !m.nome.includes('(') && ` (${m.instituicao})`}</span>
            <span className="texto-calmo">{papelNaBanca(m)}</span>
          </li>
        ))}
      </ul>
    </Secao>
  );
}

function DefesaAgendada({ b }: { b: Banca }) {
  const { executar } = useFeedback();
  const [convidar, setConvidar] = useState(false);
  const passou = new Date(b.data_hora) <= new Date();
  return (
    <Pagina titulo={(passou ? <Titulo selo="Aguardando resultado" cor="amarelo" /> : <Titulo selo="Agendada" cor="azul" />)}
      descricao={passou
        ? 'A defesa já aconteceu. O resultado aparece aqui assim que a banca registrar as notas.'
        : `Seu TCC será defendido ${diaSemana(b.data_hora).toLowerCase()}, às ${horario(b.data_hora)}.`}>
      <PartesComuns b={b} />
      <ListaBanca b={b} />
      {!passou && (
        <div className="acoes">
          <button className="botao secundario com-icone-botao" onClick={() => executar(() => baixar(`/bancas/${b.id}/agenda.ics`, 'defesa-tcc.ics'))}>
            <CalendarPlus className="ic" aria-hidden="true" />Adicionar à minha agenda</button>
          <button className="botao secundario com-icone-botao" onClick={() => setConvidar(true)}><Mail className="ic" aria-hidden="true" />Convidar pessoas</button>
        </div>
      )}
      {convidar && <ModalConvites banca={b} aoFechar={() => setConvidar(false)} />}
    </Pagina>
  );
}

function DefesaRealizada({ b, ata }: { b: Banca; ata: Ata | null }) {
  const { executar } = useFeedback();
  const dias = b.prazo_correcoes ? diasAte(b.prazo_correcoes) : null;
  const prazo = b.prazo_correcoes && (
    <span>até {dia(b.prazo_correcoes)}{b.correcoes_pendentes && dias != null &&
      <span className={dias < 0 ? 'texto-erro' : 'texto-faltam'}> – {dias < 0 ? 'prazo vencido' : dias === 0 ? 'vence hoje' : `faltam ${dias} dia${dias === 1 ? '' : 's'}`}</span>}
      {!b.correcoes_pendentes && <span className="texto-calmo"> – correções entregues</span>}
    </span>
  );
  return (
    <Pagina titulo={<Titulo selo="Realizada" cor="verde" />}>
      <PartesComuns b={b} />
      <Secao titulo="Resultado">
        <div className="caixa caixa-ficha">
          <Ficha linhas={[
            ['Resultado', b.resultado ? RESULTADOS[b.resultado][0] : '—'],
            ['Nota final', notaCurta(b.nota_final)],
            ...(prazo ? [['Prazo para entregar as correções', prazo] as [string, React.ReactNode]] : []),
            ...(b.observacao ? [[b.resultado === 'REPROVADO' ? 'Justificativa da banca' : 'Observação da banca', b.observacao] as [string, string]] : []),
          ]} />
        </div>
      </Secao>
      <ListaBanca b={b} />
      {ata && (
        <Secao titulo="Ata da defesa" extra={<Link to={`/ata/${b.id}`} className="link-secao">Ver ata completa</Link>}>
          <div className="caixa caixa-ata">
            {ata.codigo_verificacao && (
              <div className="ata-linha"><span className="texto-calmo">Código de verificação</span><code>{ata.codigo_verificacao}</code></div>
            )}
            <div className="ata-assinaturas-lista">
              <span className="texto-calmo">Assinaturas</span>
              <ul>
                {ata.assinaturas.map((s) => (
                  <li key={String(s.usuarioId)}>
                    <span>{s.nome}</span>
                    {s.valida
                      ? <span className="assinou"><Check className="ic" aria-hidden="true" />Assinado em {dia(s.assinadoEm)}</span>
                      : <span className="aguardando"><Clock className="ic" aria-hidden="true" />{s.assinadoEm ? 'Precisa assinar de novo' : 'Aguardando assinatura'}</span>}
                  </li>
                ))}
              </ul>
            </div>
            <div className="ata-rodape">
              {ata.ataDigitalizada
                ? <button className="botao com-icone-botao" onClick={() => executar(() => baixar(`/bancas/${ata.id}/ata/digitalizada`, ata.ataDigitalizada!.nome))}><Download className="ic" aria-hidden="true" />Baixar ata em PDF</button>
                : <Link className="botao com-icone-botao" to={`/ata/${b.id}`}><Download className="ic" aria-hidden="true" />Ver e salvar ata em PDF</Link>}
            </div>
          </div>
        </Secao>
      )}
    </Pagina>
  );
}
