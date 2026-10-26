import { useState } from 'react';
import { repo } from '../data/repo';
import { hojeISO } from '../domain/datas';
import { protocolo as P } from '../domain/protocolo';

export default function Onboarding() {
  const [inicio, setInicio] = useState(hojeISO());
  const [dias, setDias] = useState<4 | 5>(5);
  const [erro, setErro] = useState('');

  const importar = async (f: File) => {
    try {
      await repo.importar(JSON.parse(await f.text()));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao importar');
    }
  };

  return (
    <div className="page">
      <h1>{P.meta.nome}</h1>
      <p className="sub">{P.meta.duracaoSemanas} semanas · {P.fases.length} fases · treinos de ~{P.meta.duracaoTreinoMin} min</p>
      <div className="card stack">
        <label className="campo">
          Data de início (semana 1)
          <input className="input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Dias de treino por semana</div>
          <div className="seg">
            {([5, 4] as const).map((n) => (
              <button key={n} className={dias === n ? 'on' : ''} onClick={() => setDias(n)}>{n} dias</button>
            ))}
          </div>
          {dias === 4 && <p className="muted">{P.agendaSemanal.obs4dias}</p>}
        </div>
        <button
          className="btn primary block"
          disabled={!inicio}
          onClick={() => repo.setConfig({ inicio, diasPorSemana: dias, ajusteKcal: 0, ajustePassos: 0 })}
        >
          Começar
        </button>
      </div>
      <div className="card">
        <h2>Já usa o app em outro aparelho?</h2>
        <label className="btn block" style={{ display: 'grid', placeItems: 'center' }}>
          Restaurar backup (.json)
          <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
        </label>
        {erro && <p className="small" style={{ color: 'var(--bad)' }}>{erro}</p>}
      </div>
    </div>
  );
}
