import { useEffect, useMemo, useState } from 'react';
import { fmt, lerNumero, salvarMedida, salvarMedidaDiaria } from '../components/util';
import { novoId, repo } from '../data/repo';
import { formatarData } from '../domain/datas';
import { circunferencias, NOME_MEDIDA, PREFIXO_BASE, proporcoes, resumoMedida, UNIDADE_MEDIDA } from '../domain/medidas';
import { protocolo as P } from '../domain/protocolo';
import type { Angulo, Foto, TipoMedida } from '../domain/types';
import { useDados } from '../state';

type Aba = 'peso' | 'cintura' | 'circ' | 'bio' | 'passos' | 'sono';
const ABAS: { id: Aba; nome: string }[] = [
  { id: 'peso', nome: 'Peso' },
  { id: 'cintura', nome: 'Cintura' },
  { id: 'circ', nome: 'Circunf.' },
  { id: 'bio', nome: 'Bioimp.' },
  { id: 'passos', nome: 'Passos' },
  { id: 'sono', nome: 'Sono' },
];

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

const ROTULO_ANGULO: Record<Angulo, string> = { frente: 'frente', lado: 'lado', costas: 'costas' };

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
            <button key={a} className={angulo === a ? 'on' : ''} onClick={() => setAngulo(a)}>{ROTULO_ANGULO[a]}</button>
          ))}
        </div>
        <label className="btn primary">
          + Foto
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { adicionar(e.target.files); e.target.value = ''; }} />
        </label>
      </div>
      {angulo === 'lado' && <p className="muted" style={{ margin: '6px 0 0' }}>De lado, com os braços soltos ao longo do corpo.</p>}
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

const sinal = (n: number, casas = 1) => `${n > 0 ? '+' : ''}${fmt(n, casas)}`;
const faixa = (m: [number, number], casas = 1) => (m[0] === m[1] ? fmt(m[0], casas) : `${fmt(m[0], casas)}–${fmt(m[1], casas)}`);

/** Tabela: valor atual, variação desde a linha de base e meta de 6 meses. */
function ResumoCorpo() {
  const d = useDados();
  const tipos: TipoMedida[] = ['peso', 'gorduraPct', 'massaMagraKg', 'cintura', ...circunferencias(P).filter((t) => t !== 'cintura')];
  const linhas = tipos.map((t) => resumoMedida(P, d.medidas, t)).filter((r) => r.atual !== undefined || r.meta);
  const base = P.avaliacaoInicial;

  return (
    <div className="card">
      <h2>Corpo</h2>
      {base && <p className="muted" style={{ marginTop: 0 }}>Linha de base: avaliação de {formatarData(base.data)}.</p>}
      <table className="tab">
        <thead>
          <tr><th>Medida</th><th>Atual</th><th>Δ base</th><th>Meta</th></tr>
        </thead>
        <tbody>
          {linhas.map((r) => {
            const un = UNIDADE_MEDIDA[r.tipo];
            return (
              <tr key={r.tipo}>
                <td>{NOME_MEDIDA[r.tipo]}</td>
                <td>{r.atual !== undefined ? <>{fmt(r.atual)} <span className="muted">{un}</span></> : '—'}</td>
                <td>{r.variacao !== undefined && !r.atualEhBase ? sinal(r.variacao) : '—'}</td>
                <td>
                  {r.meta ? (
                    r.faltaParaMeta === 0 ? <span className="chip good">✓ {faixa(r.meta)}</span> : <span className="muted">{faixa(r.meta)}</span>
                  ) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Proporcoes() {
  const d = useDados();
  const r = proporcoes(P, d.medidas);
  const ini = P.avaliacaoInicial?.proporcoes;
  const item = (nome: string, atual?: number, meta?: number, inicio?: number, maiorMelhor = true) => {
    const ok = atual !== undefined && meta !== undefined && (maiorMelhor ? atual >= meta : atual <= meta);
    return (
      <div className="metric">
        <div className="v">{atual !== undefined ? fmt(atual, 2) : '—'}</div>
        <div className="l">
          {nome} · meta {meta !== undefined ? fmt(meta, 2) : '—'}
          {inicio !== undefined && <> · início {fmt(inicio, 2)}</>}
        </div>
        {ok && <span className="chip good" style={{ marginTop: 4 }}>meta atingida</span>}
      </div>
    );
  };
  return (
    <div className="card">
      <h2>Proporções</h2>
      <div className="metric-grid">
        {item('ombro ÷ cintura', r.ombroCintura, r.metaOmbroCintura, ini?.ombroCintura, true)}
        {item('cintura ÷ altura', r.cinturaAltura, r.metaCinturaAltura, ini?.cinturaAltura, false)}
      </div>
    </div>
  );
}

export default function Medidas() {
  const d = useDados();
  const [aba, setAba] = useState<Aba>('peso');
  const [data, setData] = useState(d.hoje);
  const [valores, setValores] = useState<Partial<Record<TipoMedida, string>>>({});
  const [ok, setOk] = useState(false);

  const tipos: TipoMedida[] =
    aba === 'bio' ? ['gorduraPct', 'massaMagraKg'] : aba === 'circ' ? circunferencias(P) : [aba];
  const infoId = aba === 'bio' ? 'bioimpedancia' : aba === 'circ' ? 'circunferencias' : aba;
  const info = P.monitoramento.find((m) => m.id === infoId);
  const recentes = d.medidas.filter((m) => tipos.includes(m.tipo)).slice(-(aba === 'circ' ? 20 : 12)).reverse();

  const salvar = async () => {
    let algum = false;
    for (const t of tipos) {
      const v = lerNumero(valores[t] ?? '');
      if (v === undefined) continue;
      algum = true;
      if (t === 'passos' || t === 'sono') await salvarMedidaDiaria(t, data, v);
      else await salvarMedida(t, data, v);
    }
    if (!algum) return;
    setValores({});
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  };

  return (
    <div className="page">
      <h1>Medidas</h1>

      <ResumoCorpo />
      <Proporcoes />

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Lançar</h2>
        <div className="seg">
          {ABAS.map((a) => (
            <button key={a.id} className={aba === a.id ? 'on' : ''} onClick={() => { setAba(a.id); setValores({}); }}>{a.nome}</button>
          ))}
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {info?.frequencia ?? (info?.semanas ? `Semanas ${info.semanas.join(', ')}` : '')}
          {info?.como ? ` · ${info.como}` : ''}
        </p>
        <label className="campo">
          Data
          <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <div className={tipos.length > 1 ? 'metric-grid' : ''} style={tipos.length > 1 ? { gap: 8 } : undefined}>
          {tipos.map((t) => (
            <label key={t} className="campo">
              {NOME_MEDIDA[t]} ({UNIDADE_MEDIDA[t]})
              <input
                className="input num"
                inputMode="decimal"
                value={valores[t] ?? ''}
                onChange={(e) => setValores((v) => ({ ...v, [t]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && tipos.length === 1 && salvar()}
              />
            </label>
          ))}
        </div>
        <button className="btn primary block" onClick={salvar}>{ok ? 'Salvo ✓' : 'Salvar'}</button>
      </div>

      {recentes.length > 0 && (
        <div className="card">
          <h2>Registros recentes</h2>
          <ul className="lista">
            {recentes.map((m) => (
              <li key={m.id}>
                <span>
                  {formatarData(m.data)} <span className="muted">{tipos.length > 1 ? NOME_MEDIDA[m.tipo] : ''}</span>
                  {m.id.startsWith(PREFIXO_BASE) && <span className="chip" style={{ marginLeft: 6 }}>base</span>}
                </span>
                <span className="row">
                  <strong className="num">{m.tipo === 'passos' ? m.valor.toLocaleString('pt-BR') : fmt(m.valor)} {UNIDADE_MEDIDA[m.tipo]}</strong>
                  <button className="btn ghost sm danger" aria-label="Apagar" onClick={() => confirm('Apagar este registro?') && repo.deleteMedida(m.id)}>✕</button>
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
