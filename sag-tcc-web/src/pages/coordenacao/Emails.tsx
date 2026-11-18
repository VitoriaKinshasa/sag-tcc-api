import { Mail } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api';
import { Campo, Cartao, Dica, Estado, Pagina, Vazio } from '../../components/ui';
import { useCarregar } from '../../hooks';
import type { Id } from '../../types';
import { dataHora } from '../../util';

interface Email { id: Id; para: string; nome: string; assunto: string; texto: string; enviado_em: string }

/** Transforma os endereços (http...) do texto em links clicáveis. */
function ComLinks({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/\S+)/g);
  return <>{partes.map((p, i) => /^https?:\/\//.test(p) ? <a key={i} href={p} target="_blank" rel="noopener noreferrer">{p}</a> : p)}</>;
}

/** E-mails da SIMULAÇÃO: o sistema ainda não envia e-mail de verdade; aqui a coordenação vê o que seria enviado. */
export function Emails() {
  const c = useCarregar(() => api<Email[]>('GET', '/emails'), []);
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<Id | null>(null);

  return (
    <Pagina titulo="E-mails enviados (simulação)" descricao="O sistema ainda não envia e-mails de verdade. Aqui aparece tudo o que seria enviado para as pessoas do seu curso, como o link de primeiro acesso.">
      <Dica tipo="alerta">Use só para testes. Quando o sistema enviar e-mails de verdade, esta tela deixa de existir, porque os links de senha são pessoais.</Dica>
      <Cartao>
        <Campo rotulo="Buscar" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, e-mail ou assunto" />
        <button className="botao pequeno secundario" onClick={c.recarregar}>Atualizar lista</button>
      </Cartao>
      <Estado c={c}>
        {(lista) => {
          const t = busca.trim().toLowerCase();
          const filtrada = lista.filter((e) => !t || e.nome.toLowerCase().includes(t) || e.para.toLowerCase().includes(t) || e.assunto.toLowerCase().includes(t));
          if (!filtrada.length) return <Vazio icone={Mail}>Nenhum e-mail encontrado.</Vazio>;
          return (
            <ul className="emails">
              {filtrada.map((e) => (
                <li key={String(e.id)} className={aberto === e.id ? 'aberto' : ''}>
                  <button className="email-topo" aria-expanded={aberto === e.id} onClick={() => setAberto(aberto === e.id ? null : e.id)}>
                    <span><strong>{e.assunto.replace('[SAG-TCC] ', '')}</strong><small className="bloco">Para: {e.nome} &lt;{e.para}&gt;</small></span>
                    <small>{dataHora(e.enviado_em)}</small>
                  </button>
                  {aberto === e.id && <p className="email-texto"><ComLinks texto={e.texto} /></p>}
                </li>
              ))}
            </ul>
          );
        }}
      </Estado>
    </Pagina>
  );
}
