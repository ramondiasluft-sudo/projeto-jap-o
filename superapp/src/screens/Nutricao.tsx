import { useEffect, useState } from 'react';
import { IcCheck } from '../components/Icones';
import { fmt, lerNumero } from '../components/util';
import { repo } from '../data/repo';
import { formatarData, somarDias } from '../domain/datas';
import { protocolo as P } from '../domain/protocolo';
import { opcaoDaRefeicao, proteinaDasRefeicoes } from '../domain/nutricao';
import type { DiaNutricao, OpcaoRefeicao } from '../domain/types';
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
  const opcoes = dia.opcoes ?? n.diaExemplo.map(() => null);
  const [aberta, setAberta] = useState<number | null>(null);
  const protEstimada = proteinaDasRefeicoes(n.diaExemplo, dia);
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
        {protEstimada > 0 && (
          <div className="row between small">
            <span className="muted">Pelas refeições marcadas: <strong className="num">~{protEstimada} g</strong> de {f.proteinaG} g</span>
            {dia.proteinaG !== protEstimada && (
              <button className="btn sm" onClick={() => salvar({ proteinaG: protEstimada })}>Usar</button>
            )}
          </div>
        )}
        <div>
          {n.diaExemplo.map((r, i) => {
            const escolhida = opcaoDaRefeicao(r, opcoes[i]);
            const total = 1 + (r.alternativas?.length ?? 0);
            return (
              <div key={r.refeicao} style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="check" style={{ borderBottom: 0 }}>
                  <button
                    className={`tick ${refeicoes[i] ? 'on' : ''}`}
                    aria-label={r.refeicao}
                    onClick={() => salvar({ refeicoes: refeicoes.map((v, j) => (j === i ? !v : v)) })}
                  >
                    {refeicoes[i] && <IcCheck />}
                  </button>
                  <div className="grow">
                    <strong>{r.refeicao}</strong> <span className="muted">~{escolhida.proteinaG} g prot.</span>
                    <div className="small muted">{escolhida.descricao}</div>
                  </div>
                  {total > 1 && (
                    <button className="btn sm" aria-expanded={aberta === i} onClick={() => setAberta(aberta === i ? null : i)}>
                      Trocar ({total})
                    </button>
                  )}
                </div>
                {aberta === i && (
                  <div className="stack" style={{ paddingBottom: 10 }}>
                    {[r as OpcaoRefeicao, ...(r.alternativas ?? [])].map((o, k) => {
                      const idx = k - 1; // -1 = dia exemplo
                      const on = (opcoes[i] ?? -1) === idx;
                      return (
                        <button
                          key={k}
                          className={`btn block ${on ? 'primary' : ''}`}
                          style={{ textAlign: 'left', fontWeight: 400, display: 'flex', gap: 8, justifyContent: 'space-between' }}
                          onClick={() => {
                            const ops = n.diaExemplo.map((_, j) => (j === i ? idx : opcoes[j] ?? null));
                            salvar({ opcoes: ops, refeicoes: refeicoes.map((v, j) => (j === i ? true : v)) });
                            setAberta(null);
                          }}
                        >
                          <span className="small">{idx === -1 ? <strong>Plano: </strong> : null}{o.descricao}</span>
                          <span className="small num" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{o.proteinaG} g</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
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

      {n.trocasCarboidrato && (
        <div className="card">
          <h2>Trocas de carboidrato</h2>
          <p className="muted" style={{ marginTop: 0 }}>Cada item equivale a {n.trocasCarboidrato.referencia}:</p>
          <div className="row wrap">
            {n.trocasCarboidrato.equivalentes.map((e) => <span key={e} className="chip">{e}</span>)}
          </div>
        </div>
      )}

      {n.dicas && n.dicas.length > 0 && (
        <div className="card">
          <h2>Dicas</h2>
          <ul className="small" style={{ paddingLeft: 18, margin: 0, color: 'var(--text-2)' }}>
            {n.dicas.map((d) => <li key={d} style={{ marginBottom: 6 }}>{d}</li>)}
          </ul>
        </div>
      )}

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
