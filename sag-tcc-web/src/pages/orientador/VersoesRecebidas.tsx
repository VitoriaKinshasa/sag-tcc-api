import { Check } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { Modal } from '../../components/Modal';
import { CampoTexto, Dica, Estado, Pagina, Selo, Tabela } from '../../components/ui';
import { useFeedback } from '../../feedback';
import { useCarregar } from '../../hooks';
import type { Versao } from '../../types';
import { dataHora, NOME_ETAPA } from '../../util';
import { baixarVersao, SeloParecer } from '../aluno/Versoes';

export function VersoesRecebidas() {
  const c = useCarregar(() => api<Versao[]>('GET', '/versoes/recebidas'), []);
  const [parecer, setParecer] = useState<Versao | null>(null);
  const [filtro, setFiltro] = useState<'pendentes' | 'todas'>('pendentes');
  const { executar } = useFeedback();

  return (
    <Pagina titulo="Versões para parecer" descricao="Versões enviadas pelos seus orientandos. Baixe o PDF, leia e registre o seu parecer.">
      <div className="abas" role="tablist">
        <button role="tab" aria-selected={filtro === 'pendentes'} onClick={() => setFiltro('pendentes')}>Aguardando parecer</button>
        <button role="tab" aria-selected={filtro === 'todas'} onClick={() => setFiltro('todas')}>Todas</button>
      </div>
      <Estado c={c}>
        {(lista) => (
          <Tabela linhas={filtro === 'pendentes' ? lista.filter((v) => !v.parecer_decisao) : lista} chave={(v) => String(v.id)}
            vazio={filtro === 'pendentes' ? 'Nenhuma versão aguardando o seu parecer.' : 'Nenhuma versão recebida.'}
            colunas={[
              { titulo: 'Aluno(a)', valor: (v) => v.aluno },
              { titulo: 'TCC', valor: (v) => <strong>{v.titulo}</strong> },
              { titulo: 'Versão', valor: (v) => <span className="selos">{v.numero} · {NOME_ETAPA[v.etapa]}{v.fora_do_prazo && <Selo cor="vermelho">Fora do prazo</Selo>}</span> },
              { titulo: 'Enviada em', valor: (v) => dataHora(v.enviado_em) },
              { titulo: 'Parecer', valor: (v) => <div><SeloParecer v={v} />{v.parecer_texto && <p className="parecer">{v.parecer_texto}</p>}</div> },
              { titulo: '', className: 'col-acoes', valor: (v) => (
                <div className="acoes">
                  <button className="botao pequeno secundario" onClick={() => executar(() => baixarVersao(v))}>Baixar PDF</button>
                  {!v.parecer_decisao && <button className="botao pequeno" onClick={() => setParecer(v)}>Dar parecer</button>}
                </div>
              ) },
            ]} />
        )}
      </Estado>
      {parecer && <ModalParecer v={parecer} aoFechar={() => setParecer(null)} aoSalvar={() => { setParecer(null); c.recarregar(); }} />}
    </Pagina>
  );
}

function ModalParecer({ v, aoFechar, aoSalvar }: { v: Versao; aoFechar: () => void; aoSalvar: () => void }) {
  const [decisao, setDecisao] = useState<'APROVADA' | 'AJUSTES'>('APROVADA');
  const [texto, setTexto] = useState('');
  const { executar } = useFeedback();
  const salvar = async () => {
    const r = await executar(() => api('POST', `/versoes/${v.id}/parecer`, { decisao, texto: texto.trim() || null }), 'Parecer registrado. O aluno foi avisado.');
    if (r) aoSalvar();
  };
  return (
    <Modal titulo={`Parecer da versão ${v.numero}`} subtitulo={`${v.titulo} · ${v.aluno} · ${NOME_ETAPA[v.etapa]}`} aoFechar={aoFechar}
      rodape={<><button className="botao secundario" onClick={aoFechar}>Cancelar</button><button className="botao" onClick={salvar}>Registrar parecer</button></>}>
      <fieldset className="opcoes-cartao">
        <legend>Parecer</legend>
        <label className={decisao === 'APROVADA' ? 'marcado' : ''}>
          <input type="radio" name="decisao" checked={decisao === 'APROVADA'} onChange={() => setDecisao('APROVADA')} />
          <span><strong>Aprovada</strong><small>A versão está boa para seguir.</small></span>
        </label>
        <label className={decisao === 'AJUSTES' ? 'marcado' : ''}>
          <input type="radio" name="decisao" checked={decisao === 'AJUSTES'} onChange={() => setDecisao('AJUSTES')} />
          <span><strong>Precisa de ajustes</strong><small>O aluno corrige e envia uma nova versão.</small></span>
        </label>
      </fieldset>
      {v.etapa === 'ENTREGA_DEFINITIVA' && (
        <Dica>Esta é a <strong>entrega definitiva</strong>. Se houver correções pedidas pela banca, confira se foram feitas: ao marcar “Aprovada”, o TCC é <strong>concluído</strong>.</Dica>
      )}
      {v.declaracao_autoria && <p className="ajuda com-icone"><Check className="ic" aria-hidden="true" />O aluno assinou a declaração de autoria ao enviar esta versão.</p>}
      <CampoTexto rotulo="Comentários para o aluno" obrigatorio={decisao === 'AJUSTES'} rows={6} value={texto} onChange={(e) => setTexto(e.target.value)}
        placeholder={decisao === 'AJUSTES' ? 'Explique o que precisa ser ajustado' : 'Opcional'} />
    </Modal>
  );
}
