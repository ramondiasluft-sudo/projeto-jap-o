import { useEffect, useMemo, useState } from 'react';
import { fmt, lerNumero, salvarMedida, salvarMedidaDiaria } from '../components/util';
import { novoId, repo } from '../data/repo';
import { formatarData } from '../domain/datas';
import { protocolo as P } from '../domain/protocolo';
import type { Angulo, Foto, TipoMedida } from '../domain/types';
import { useDados } from '../state';

type Aba = 'peso' | 'cintura' | 'passos' | 'sono' | 'bio';
const ABAS: { id: Aba; nome: string }[] = [
  { id: 'peso', nome: 'Peso' },
  { id: 'cintura', nome: 'Cintura' },
  { id: 'bio', nome: 'Bioimp.' },
  { id: 'passos', nome: 'Passos' },
  { id: 'sono', nome: 'Sono' },
];
const UN: Record<TipoMedida, string> = { peso: 'kg', cintura: 'cm', passos: 'passos', sono: 'h', gorduraPct: '%', massaMagraKg: 'kg' };
const NOME: Record<TipoMedida, string> = { peso: 'Peso', cintura: 'Cintura', passos: 'Passos', sono: 'Sono', gorduraPct: '% gordura', massaMagraKg: 'Massa magra' };

/** Reduz a foto para no máx. 1600 px (JPEG) antes de guardar. */
async function reduzir(file: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob((b) => ok(b ?? file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

function Fotos({ hoje }: { hoje: string }) {
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [angulo, setAngulo] = useState<Angulo>('frente');
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    const carregar = () => repo.listFotos().then(setFotos);
    carregar();
    return repo.subscribe(carregar);
  }, []);

  const urls = useMemo(() => new Map(fotos.map((f) => [f.id, URL.createObjectURL(f.blob)])), [fotos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const adicionar = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      await repo.putFoto({ id: novoId(), data: hoje, angulo, blob: await reduzir(f) });
    }
  };
  const info = P.monitoramento.find((m) => m.id === 'fotos');

  return (
    <div className="card">
      <h2>Fotos</h2>
      <p className="muted" style={{ marginTop: 0 }}>{info?.frequencia} · {info?.como}</p>
      <div className="row">
        <div className="seg grow">
          {(['frente', 'lado', 'costas'] as Angulo[]).map((a) => (
            <button key={a} className={angulo === a ? 'on' : ''} onClick={() => setAngulo(a)}>{a}</button>
          ))}
        </div>
        <label className="btn primary">
          + Foto
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { adicionar(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      {fotos.length > 0 && (
        <div className="fotos" style={{ marginTop: 10 }}>
          {fotos.map((f) => (
            <figure key={f.id}>
              <img src={urls.get(f.id)} alt={`${f.angulo} ${f.data}`} onClick={() => setAberta(f.id)} />
              <figcaption className="row between">
                <span>{formatarData(f.data)} · {f.angulo}</span>
                <button className="btn ghost sm danger" style={{ minHeight: 24, padding: '0 4px' }} aria-label="Apagar foto" onClick={() => confirm('Apagar esta foto?') && repo.deleteFoto(f.id)}>✕</button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {aberta && (
        <div className="modal-bg" onClick={() => setAberta(null)}>
          <img src={urls.get(aberta)} alt="" />
        </div>
      )}
    </div>
  );
}

export default function Medidas() {
  const d = useDados();
  const [aba, setAba] = useState<Aba>('peso');
  const [data, setData] = useState(d.hoje);
  const [v1, setV1] = useState('');
  const [v2, setV2] = useState('');
  const [ok, setOk] = useState(false);

  const tipos: TipoMedida[] = aba === 'bio' ? ['gorduraPct', 'massaMagraKg'] : [aba];
  const info = P.monitoramento.find((m) => m.id === (aba === 'bio' ? 'bioimpedancia' : aba));
  const recentes = d.medidas.filter((m) => tipos.includes(m.tipo)).slice(-12).reverse();

  const salvar = async () => {
    const a = lerNumero(v1);
    const b = lerNumero(v2);
    if (aba === 'passos' || aba === 'sono') {
      if (a === undefined) return;
      await salvarMedidaDiaria(aba, data, a);
    } else if (aba === 'bio') {
      if (a === undefined && b === undefined) return;
      if (a !== undefined) await salvarMedida('gorduraPct', data, a);
      if (b !== undefined) await salvarMedida('massaMagraKg', data, b);
    } else {
      if (a === undefined) return;
      await salvarMedida(aba, data, a);
    }
    setV1('');
    setV2('');
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  };

  return (
    <div className="page">
      <h1>Medidas</h1>
      <div className="seg">
        {ABAS.map((a) => (
          <button key={a.id} className={aba === a.id ? 'on' : ''} onClick={() => { setAba(a.id); setV1(''); setV2(''); }}>{a.nome}</button>
        ))}
      </div>

      <div className="card stack">
        <p className="muted" style={{ margin: 0 }}>
          {info?.frequencia ?? (info?.semanas ? `Semanas ${info.semanas.join(', ')}` : '')}
          {info?.como ? ` · ${info.como}` : ''}
        </p>
        <div className="row">
          <label className="campo grow">
            Data
            <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </label>
        </div>
        <div className="row">
          <label className="campo grow">
            {NOME[tipos[0]]} ({UN[tipos[0]]})
            <input className="input num" inputMode="decimal" value={v1} onChange={(e) => setV1(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && salvar()} />
          </label>
          {aba === 'bio' && (
            <label className="campo grow">
              Massa magra (kg)
              <input className="input num" inputMode="decimal" value={v2} onChange={(e) => setV2(e.target.value)} />
            </label>
          )}
        </div>
        <button className="btn primary block" onClick={salvar}>{ok ? 'Salvo ✓' : 'Salvar'}</button>
      </div>

      {recentes.length > 0 && (
        <div className="card">
          <h2>Registros recentes</h2>
          <ul className="lista">
            {recentes.map((m) => (
              <li key={m.id}>
                <span>{formatarData(m.data)} <span className="muted">{tipos.length > 1 ? NOME[m.tipo] : ''}</span></span>
                <span className="row">
                  <strong className="num">{m.tipo === 'passos' ? m.valor.toLocaleString('pt-BR') : fmt(m.valor)} {UN[m.tipo]}</strong>
                  <button className="btn ghost sm danger" aria-label="Apagar" onClick={() => repo.deleteMedida(m.id)}>✕</button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Fotos hoje={d.hoje} />
    </div>
  );
}
