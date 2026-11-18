import { FileText, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { tamanho } from '../util';

const LIMITE = 10 * 1024 * 1024;

/** Caixa para escolher (ou arrastar) um PDF de até 10 MB. */
export function EscolherPdf({ arquivo, aoEscolher, rotulo = 'Arquivo PDF' }: { arquivo: File | null; aoEscolher: (f: File | null) => void; rotulo?: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const escolher = (f: File | undefined) => {
    setErro(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.pdf')) { setErro('O arquivo precisa ser PDF.'); aoEscolher(null); return; }
    if (f.size > LIMITE) { setErro('O arquivo passa de 10 MB. Diminua o tamanho (por exemplo, escaneando em preto e branco) e tente de novo.'); aoEscolher(null); return; }
    aoEscolher(f);
  };

  return (
    <div className="campo">
      <span className="rotulo">{rotulo} <span className="obrigatorio">*</span></span>
      <label className={`soltar-arquivo ${arrastando ? 'arrastando' : ''} ${arquivo ? 'com-arquivo' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files[0]); }}>
        <input ref={input} type="file" accept="application/pdf,.pdf" className="visualmente-oculto" onChange={(e) => escolher(e.target.files?.[0])} />
        {arquivo
          ? <><FileText className="ic-grande" aria-hidden="true" /><strong>{arquivo.name}</strong><small>{tamanho(arquivo.size)} · clique para trocar</small></>
          : <><Upload className="ic-grande" aria-hidden="true" /><strong>Clique para escolher o PDF</strong><small>ou arraste o arquivo para cá (até 10 MB)</small></>}
      </label>
      {erro && <span className="erro-campo">{erro}</span>}
    </div>
  );
}
