import { useState } from 'react';
import { novoId, repo } from '../data/repo';
import { completarCardio } from '../domain/cardio';
import { formatarData } from '../domain/datas';
import { protocolo as P } from '../domain/protocolo';
import type { Cardio } from '../domain/types';
import { useDados } from '../state';
import { fmt, lerNumero } from './util';

export const nomeCardio = (id: string) => P.cardio?.opcoes.find((o) => o.id === id)?.nome ?? id;

export function resumoCardio(c: Cardio): string {
  const partes = [`${c.minutos} min`];
  if (c.km !== undefined) partes.push(`${fmt(c.km, 2)} km`);
  if (c.velocidadeKmh !== undefined) partes.push(`${fmt(c.velocidadeKmh)} km/h`);
  return partes.join(' · ');
}

/** Registro de cardio. Com `sessaoId`, fica ligado ao treino; sem, é avulso (dia escolhido). */
export default function CardioCard({ sessaoId, data: dataFixa, titulo = 'Cardio' }: { sessaoId?: string; data?: string; titulo?: string }) {
  const d = useDados();
  const opcoes = P.cardio?.opcoes ?? [];
  const [tipo, setTipo] = useState(opcoes[0]?.id ?? 'esteira_caminhada');
  const [data, setData] = useState(dataFixa ?? d.hoje);
  const [min, setMin] = useState('');
  const [km, setKm] = useState('');
  const [vel, setVel] = useState('');
  const [erro, setErro] = useState(false);

  const lista = d.cardios.filter((c) => (sessaoId ? c.sessaoId === sessaoId : !c.sessaoId && c.data === data));
  const opcao = opcoes.find((o) => o.id === tipo);
  const cs = d.cardioSemana;

  const adicionar = async () => {
    const minutos = lerNumero(min);
    if (!minutos) return setErro(true);
    const c = completarCardio({
      id: novoId(),
      data: dataFixa ?? data,
      tipo,
      minutos,
      km: lerNumero(km),
      velocidadeKmh: lerNumero(vel),
      sessaoId,
    });
    await repo.putCardio(c);
    setMin('');
    setKm('');
    setVel('');
    setErro(false);
  };

  return (
    <div className="card stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{titulo}</h2>
        {cs.meta ? (
          <span className={`chip ${cs.validas >= cs.meta.sessoes ? 'good' : ''}`}>
            semana {cs.validas}/{cs.meta.sessoes} · meta {cs.meta.minutos} min
          </span>
        ) : (
          <span className="chip">opcional nesta fase</span>
        )}
      </div>
      {P.cardio?.intensidade && <p className="muted" style={{ margin: 0 }}>{P.cardio.intensidade}</p>}

      {lista.length > 0 && (
        <ul className="lista">
          {lista.map((c) => (
            <li key={c.id}>
              <span>
                <strong>{nomeCardio(c.tipo)}</strong>
                <div className="small muted num">{resumoCardio(c)}</div>
              </span>
              <button className="btn ghost sm danger" aria-label="Apagar cardio" onClick={() => confirm('Apagar este cardio?') && repo.deleteCardio(c.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="row wrap" role="radiogroup" aria-label="Tipo de cardio">
        {opcoes.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={tipo === o.id}
            className={`chip ${tipo === o.id ? 'accent' : ''}`}
            style={{ border: 0, cursor: 'pointer', padding: '6px 10px', fontSize: 13 }}
            onClick={() => setTipo(o.id)}
          >
            {o.nome}
          </button>
        ))}
      </div>
      {opcao?.obs && <p className="small muted" style={{ margin: 0 }}>{opcao.obs}</p>}

      {!dataFixa && (
        <label className="campo">
          Data
          <input className="input" type="date" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
        </label>
      )}
      <div className="row">
        <label className="campo grow">
          Minutos
          <input className="input num" inputMode="numeric" value={min} onChange={(e) => { setMin(e.target.value); setErro(false); }} style={erro ? { borderColor: 'var(--bad)' } : undefined} />
        </label>
        <label className="campo grow">
          km
          <input className="input num" inputMode="decimal" placeholder="opcional" value={km} onChange={(e) => setKm(e.target.value)} />
        </label>
        <label className="campo grow">
          km/h
          <input className="input num" inputMode="decimal" placeholder="opcional" value={vel} onChange={(e) => setVel(e.target.value)} />
        </label>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Preencha km ou velocidade: o outro é calculado.</p>
      <button className="btn block" onClick={adicionar}>+ Adicionar cardio</button>
      {!sessaoId && lista.length === 0 && dataFixa === undefined && data !== d.hoje && (
        <p className="small muted" style={{ margin: 0 }}>Nenhum cardio avulso em {formatarData(data)}.</p>
      )}
    </div>
  );
}
