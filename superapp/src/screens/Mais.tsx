import { useState } from 'react';
import { CORES_FASE } from '../components/cores';
import { repo } from '../data/repo';
import { formatarData } from '../domain/datas';
import { alongamentosDoTreino } from '../domain/medidas';
import { protocolo as P } from '../domain/protocolo';
import { buscarExercicio, intervaloDaSemana, montarTreino } from '../domain/regras';
import type { TreinoId } from '../domain/types';
import { useDados } from '../state';

function Protocolo() {
  const d = useDados();
  const [treino, setTreino] = useState<TreinoId>('A');
  const [faseVer, setFaseVer] = useState(d.fase.id);
  const fase = P.fases.find((f) => f.id === faseVer)!;
  const prescricoes = montarTreino(P, treino, { semana: fase.semanas[0], fase });
  const semanas = Array.from({ length: P.meta.duracaoSemanas }, (_, i) => i + 1);
  const unicas = P.fases.filter((f, i, a) => a.findIndex((x) => x.nome === f.nome) === i);

  return (
    <>
      {P.avaliacaoInicial && (
        <details className="card bloco">
          <summary>Avaliação inicial · {formatarData(P.avaliacaoInicial.data)}</summary>
          <div className="small stack" style={{ marginTop: 6 }}>
            {P.avaliacaoInicial.pontosFortes && <div><strong>Pontos fortes:</strong> {P.avaliacaoInicial.pontosFortes.join(', ')}</div>}
            {P.avaliacaoInicial.pontosFracos && <div><strong>Pontos fracos:</strong> {P.avaliacaoInicial.pontosFracos.join(', ')}</div>}
            {P.avaliacaoInicial.postura && <div><strong>Postura:</strong> {P.avaliacaoInicial.postura.join('; ')}</div>}
            {P.meta.atleta.observacoes && <div><strong>Observações:</strong> {P.meta.atleta.observacoes.join('; ')}</div>}
          </div>
        </details>
      )}

      <div className="card">
        <h2>Linha do tempo · 26 semanas</h2>
        <div className="timeline" role="img" aria-label={`Semana atual ${d.semana}, fase ${d.fase.nome}`}>
          {semanas.map((s) => {
            const f = P.fases.find((x) => s >= x.semanas[0] && s <= x.semanas[1])!;
            return <div key={s} title={`Semana ${s} · ${f.nome}`} className={s === d.semana ? 'atual' : ''} style={{ background: CORES_FASE[f.id] }} />;
          })}
        </div>
        <div className="legend">
          {unicas.map((f) => <span key={f.id}><i style={{ background: CORES_FASE[f.id] }} />{f.nome}</span>)}
        </div>
      </div>

      {P.fases.map((f) => {
        const [ini] = d.config ? intervaloDaSemana(d.config.inicio, f.semanas[0]) : [''];
        const fim = d.config ? intervaloDaSemana(d.config.inicio, f.semanas[1])[1] : '';
        return (
          <details key={f.id} className="card bloco" open={f.id === d.fase.id}>
            <summary>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: CORES_FASE[f.id], marginRight: 6 }} />
              {f.nome} <span className="muted">· sem. {f.semanas[0] === f.semanas[1] ? f.semanas[0] : f.semanas.join('–')}</span>
              {f.id === d.fase.id && <span className="chip accent" style={{ marginLeft: 6 }}>atual</span>}
            </summary>
            <p className="small" style={{ margin: '6px 0' }}>{f.foco}</p>
            <div className="small muted">
              {ini && <>{formatarData(ini)} a {formatarData(fim)} · </>}
              RIR {f.rir ?? '—'} · {f.kcal} kcal · P {f.proteinaG} / C {f.carboG} / G {f.gorduraG} g · {f.passosMeta.toLocaleString('pt-BR')} passos
              {f.cardio && <> · cardio {f.cardio.sessoes}× {f.cardio.minutos} min</>}
              {f.esquemaForca && <> · compostos {f.esquemaForca.series}×{f.esquemaForca.reps.join('–')}, descanso {f.esquemaForca.descansoSeg} s</>}
              {f.seriesExtras && <> · +1 série em {f.seriesExtras.length} exercícios</>}
            </div>
          </details>
        );
      })}

      <div className="card">
        <h2>Treinos</h2>
        <div className="seg">
          {(Object.keys(P.treinos) as TreinoId[]).map((t) => (
            <button key={t} className={treino === t ? 'on' : ''} onClick={() => setTreino(t)}>{t}</button>
          ))}
        </div>
        <label className="campo" style={{ marginTop: 8 }}>
          Ver séries na fase
          <select className="input" value={faseVer} onChange={(e) => setFaseVer(e.target.value)}>
            {P.fases.map((f) => <option key={f.id} value={f.id}>{f.nome} (sem. {f.semanas.join('–')})</option>)}
          </select>
        </label>
        <p style={{ margin: '10px 0 4px' }}><strong>{P.treinos[treino].nome}</strong></p>
        <table className="tab">
          <tbody>
            {prescricoes.map((p) => (
              <tr key={p.exercicio.id}>
                <td>
                  {p.exercicio.nome}
                  {p.exercicio.substituicao && <div className="muted small">Sem. {p.exercicio.substituicao.aPartirDaSemana}+: {p.exercicio.substituicao.nome} ({p.exercicio.substituicao.condicao})</div>}
                  {p.exercicio.alternativaSeDor && <div className="muted small">Com dor: {buscarExercicio(P, p.exercicio.alternativaSeDor)?.nome}</div>}
                </td>
                <td className="num" style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {p.series} × {p.faixa[0] === p.faixa[1] ? p.faixa[0] : p.faixa.join('–')}{p.unidade === 'segundos' ? ' s' : p.unidade === 'metros' ? ' m' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {P.aquecimentoOmbro.aplicaEm.includes(treino) && <p className="muted" style={{ marginBottom: 0 }}>+ aquecimento de ombro ({P.aquecimentoOmbro.duracaoMin.join('–')} min)</p>}
        {(P.treinos[treino].aquecimento ?? []).map((a) => (
          <p key={a.id} className="muted" style={{ marginBottom: 0 }}>+ antes: {a.nome} ({a.series} × {a.reps?.join('–')})</p>
        ))}
        {alongamentosDoTreino(P, treino).map((a) => (
          <p key={a.id} className="muted" style={{ marginBottom: 0 }}>+ no fim: {a.nome} ({a.series} × {a.segundos} s{a.obs ? ` ${a.obs}` : ''})</p>
        ))}
      </div>
    </>
  );
}

function Configuracoes() {
  const d = useDados();
  const cfg = d.config!;
  const [msg, setMsg] = useState('');

  const exportar = async () => {
    const b = await repo.exportar();
    const blob = new Blob([JSON.stringify(b)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `superapp-backup-${d.hoje}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setMsg(`Backup exportado (${b.sessoes.length} treinos, ${b.medidas.length} medidas, ${b.fotos.length} fotos).`);
  };

  const importar = async (f: File) => {
    if (!confirm('Restaurar substitui TODOS os dados atuais por os do arquivo. Continuar?')) return;
    try {
      await repo.importar(JSON.parse(await f.text()));
      setMsg('Backup restaurado.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Falha ao importar.');
    }
  };

  return (
    <>
      <div className="card stack">
        <h2>Configurações</h2>
        <label className="campo">
          Data de início (semana 1)
          <input className="input" type="date" value={cfg.inicio} onChange={(e) => e.target.value && repo.setConfig({ ...cfg, inicio: e.target.value })} />
        </label>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Dias de treino por semana</div>
          <div className="seg">
            {([5, 4] as const).map((n) => (
              <button key={n} className={cfg.diasPorSemana === n ? 'on' : ''} onClick={() => repo.setConfig({ ...cfg, diasPorSemana: n })}>{n} dias</button>
            ))}
          </div>
          {cfg.diasPorSemana === 4 && <p className="muted">{P.agendaSemanal.obs4dias}</p>}
        </div>
        <div className="row between">
          <span className="small">
            Ajustes aceitos: <strong className="num">{cfg.ajusteKcal > 0 ? '+' : ''}{cfg.ajusteKcal} kcal</strong> · <strong className="num">+{cfg.ajustePassos.toLocaleString('pt-BR')} passos</strong>
          </span>
          {(cfg.ajusteKcal !== 0 || cfg.ajustePassos !== 0) && (
            <button className="btn sm" onClick={() => confirm('Zerar ajustes de kcal e passos?') && repo.setConfig({ ...cfg, ajusteKcal: 0, ajustePassos: 0 })}>Zerar</button>
          )}
        </div>
      </div>

      <div className="card stack">
        <h2>Backup</h2>
        <p className="muted" style={{ margin: 0 }}>Os dados ficam só neste aparelho. Exporte com frequência.</p>
        <button className="btn primary block" onClick={exportar}>Exportar backup (.json)</button>
        <label className="btn block" style={{ display: 'grid', placeItems: 'center' }}>
          Restaurar backup
          <input type="file" accept="application/json,.json" hidden onChange={(e) => { if (e.target.files?.[0]) importar(e.target.files[0]); e.target.value = ''; }} />
        </label>
        {msg && <p className="small" style={{ margin: 0 }}>{msg}</p>}
      </div>
      <p className="muted" style={{ textAlign: 'center' }}>{P.meta.nome} · v{P.meta.versao}</p>
    </>
  );
}

export default function Mais() {
  const [aba, setAba] = useState<'protocolo' | 'config'>('protocolo');
  return (
    <div className="page">
      <h1>{aba === 'protocolo' ? 'Protocolo' : 'Configurações'}</h1>
      <div className="seg">
        <button className={aba === 'protocolo' ? 'on' : ''} onClick={() => setAba('protocolo')}>Protocolo</button>
        <button className={aba === 'config' ? 'on' : ''} onClick={() => setAba('config')}>Configurações</button>
      </div>
      {aba === 'protocolo' ? <Protocolo /> : <Configuracoes />}
    </div>
  );
}
