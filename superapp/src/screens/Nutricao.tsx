import { useEffect, useState } from 'react';
import { IcCheck } from '../components/Icones';
import { fmt, lerNumero } from '../components/util';
import { repo } from '../data/repo';
import { formatarData, somarDias } from '../domain/datas';
import { protocolo as P } from '../domain/protocolo';
import type { DiaNutricao } from '../domain/types';
import { useDados } from '../state';

export default function Nutricao() {
  const d = useDados();
  const f = d.fase;
  const n = P.nutricao;
  const [data, setData] = useState(d.hoje);
  const dia: DiaNutricao = d.nutricao.find((x) => x.data === data) ?? { data, creatina: false };
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');
  useEffect(() => {
    setKcal(dia.kcal?.toString() ?? '');
    setProt(dia.proteinaG?.toString() ?? '');
  }, [data, dia.kcal, dia.proteinaG]);

  const salvar = (patch: Partial<DiaNutricao>) => repo.putNutricao({ ...dia, ...patch, data });
  const refeicoes = dia.refeicoes ?? n.diaExemplo.map(() => false);
  const ultimos = Array.from({ length: 7 }, (_, i) => somarDias(d.hoje, -i)).map((dt) => ({
    data: dt,
    reg: d.nutricao.find((x) => x.data === dt),
  }));

  return (
    <div className="page">
      <h1>Nutrição</h1>
      <p className="sub">Metas da fase {f.nome} (semana {d.semana})</p>

      <div className="card">
        <div className="metric-grid">
          <div className="metric"><div className="v">{d.kcalMeta.toLocaleString('pt-BR')}</div><div className="l">kcal/dia{d.config?.ajusteKcal ? ` (fase ${f.kcal} ${d.config.ajusteKcal > 0 ? '+' : ''}${d.config.ajusteKcal})` : ''}</div></div>
          <div className="metric"><div className="v">{f.proteinaG} g</div><div className="l">proteína</div></div>
          <div className="metric"><div className="v">{f.carboG} g</div><div className="l">carboidrato</div></div>
          <div className="metric"><div className="v">{f.gorduraG} g</div><div className="l">gordura</div></div>
          <div className="metric"><div className="v">{fmt(n.aguaLitrosDia)} L</div><div className="l">água</div></div>
          <div className="metric"><div className="v">{n.refeicoesComProteina.quantidade}×</div><div className="l">refeições c/ {n.refeicoesComProteina.proteinaPorRefeicaoG.join('–')} g proteína</div></div>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>Gasto estimado: {n.gastoEstimadoKcal.toLocaleString('pt-BR')} kcal{f.ritmoPesoKgSem ? ` · ritmo alvo ${f.ritmoPesoKgSem.map((x) => fmt(x)).join(' a ')} kg/semana` : ''}</p>
      </div>

      <div className="card stack">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Registro do dia</h2>
          <input className="input" type="date" style={{ width: 160 }} value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
        </div>
        <div className="row">
          <label className="campo grow">
            kcal atingidas
            <input className="input num" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} onBlur={() => salvar({ kcal: lerNumero(kcal) })} />
          </label>
          <label className="campo grow">
            Proteína (g)
            <input className="input num" inputMode="numeric" value={prot} onChange={(e) => setProt(e.target.value)} onBlur={() => salvar({ proteinaG: lerNumero(prot) })} />
          </label>
        </div>
        <div>
          {n.diaExemplo.map((r, i) => (
            <div className="check" key={r.refeicao}>
              <button
                className={`tick ${refeicoes[i] ? 'on' : ''}`}
                aria-label={r.refeicao}
                onClick={() => salvar({ refeicoes: refeicoes.map((v, j) => (j === i ? !v : v)) })}
              >
                {refeicoes[i] && <IcCheck />}
              </button>
              <div className="grow">
                <strong>{r.refeicao}</strong> <span className="muted">~{r.proteinaG} g prot.</span>
                <div className="small muted">{r.descricao}</div>
              </div>
            </div>
          ))}
          <div className="check">
            <button className={`tick ${dia.creatina ? 'on' : ''}`} aria-label="Creatina" onClick={() => salvar({ creatina: !dia.creatina })}>
              {dia.creatina && <IcCheck />}
            </button>
            <div className="grow"><strong>Creatina</strong> <span className="muted">{P.suplementos[0].dose}</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Últimos 7 dias</h2>
        <table className="tab">
          <thead>
            <tr><th>Dia</th><th>kcal</th><th>Prot.</th><th>Refeições</th><th>Creat.</th></tr>
          </thead>
          <tbody>
            {ultimos.map(({ data: dt, reg }) => (
              <tr key={dt}>
                <td>{formatarData(dt)}</td>
                <td style={{ color: reg?.kcal && Math.abs(reg.kcal - d.kcalMeta) > 200 ? 'var(--warn)' : undefined }}>{reg?.kcal ?? '—'}</td>
                <td style={{ color: reg?.proteinaG !== undefined && reg.proteinaG < f.proteinaG ? 'var(--warn)' : undefined }}>{reg?.proteinaG ?? '—'}</td>
                <td>{reg?.refeicoes ? `${reg.refeicoes.filter(Boolean).length}/${n.diaExemplo.length}` : '—'}</td>
                <td>{reg?.creatina ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Suplementos</h2>
        <ul className="lista">
          {P.suplementos.map((s) => (
            <li key={s.nome}><strong>{s.nome}</strong><span className="muted small" style={{ textAlign: 'right' }}>{s.dose} · {s.frequencia}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
