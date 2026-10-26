import { useEffect, useState } from 'react';
import { CORES_FASE } from '../components/cores';
import ResumoFinal from '../components/ResumoFinal';
import { IcCheck } from '../components/Icones';
import { fmt, lerNumero, salvarMedidaDiaria } from '../components/util';
import { novoId, repo } from '../data/repo';
import { diffDias, formatarData } from '../domain/datas';
import { protocolo as P } from '../domain/protocolo';
import type { TipoAjuste } from '../domain/types';
import { useNav } from '../nav';
import { useDados } from '../state';


function CardAjuste() {
  const d = useDados();
  const s = d.sugestaoAjuste;
  if (!s || !d.config) return null;
  const decidir = async (escolha: TipoAjuste | 'ignorar') => {
    const cfg = { ...d.config! };
    if (escolha === 'kcal+150') cfg.ajusteKcal += 150;
    if (escolha === 'kcal-150') cfg.ajusteKcal -= 150;
    if (escolha === 'passos+2000') cfg.ajustePassos += 2000;
    if (escolha !== 'ignorar') await repo.setConfig(cfg);
    await repo.putDecisao({ id: String(s.semana), semana: s.semana, data: d.hoje, sugestao: s.sugestao, escolha });
  };
  return (
    <div className="card alerta">
      <h2>Ajuste da dieta: {s.titulo}</h2>
      <p className="small" style={{ marginTop: 0 }}>{s.detalhe}</p>
      <div className="row wrap">
        {s.sugestao === 'subir' ? (
          <button className="btn primary sm" onClick={() => decidir('kcal+150')}>Aceitar +150 kcal</button>
        ) : (
          <>
            <button className="btn primary sm" onClick={() => decidir('kcal-150')}>−150 kcal</button>
            <button className="btn primary sm" onClick={() => decidir('passos+2000')}>+2.000 passos</button>
          </>
        )}
        <button className="btn ghost sm" onClick={() => decidir('ignorar')}>Ignorar</button>
      </div>
    </div>
  );
}

function Checklist() {
  const d = useDados();
  const dia = d.nutricao.find((n) => n.data === d.hoje);
  const passos = d.medidas.find((m) => m.id === `passos-${d.hoje}`)?.valor;
  const sono = d.medidas.find((m) => m.id === `sono-${d.hoje}`)?.valor;
  const [passosTxt, setPassosTxt] = useState(passos?.toString() ?? '');
  const [sonoTxt, setSonoTxt] = useState(sono?.toString().replace('.', ',') ?? '');
  useEffect(() => setPassosTxt(passos?.toString() ?? ''), [passos]);
  useEffect(() => setSonoTxt(sono?.toString().replace('.', ',') ?? ''), [sono]);

  const agua = dia?.aguaL ?? 0;
  const metaAgua = P.nutricao.aguaLitrosDia;
  const salvarDia = (patch: Partial<NonNullable<typeof dia>>) =>
    repo.putNutricao({ data: d.hoje, creatina: false, ...dia, ...patch });
  const sonoMeta = P.monitoramento.find((m) => m.id === 'sono')?.meta ?? [7, 9];

  return (
    <div className="card">
      <h2>Checklist de hoje</h2>
      <div className="check">
        <button className={`tick ${dia?.creatina ? 'on' : ''}`} aria-label="Creatina" onClick={() => salvarDia({ creatina: !dia?.creatina })}>
          {dia?.creatina && <IcCheck />}
        </button>
        <div className="grow">Creatina <span className="muted">{P.suplementos[0].dose}</span></div>
      </div>
      <div className="check">
        <button className={`tick ${agua >= metaAgua ? 'on' : ''}`} aria-label="Água" onClick={() => salvarDia({ aguaL: agua >= metaAgua ? 0 : metaAgua })}>
          {agua >= metaAgua && <IcCheck />}
        </button>
        <div className="grow">Água <span className="muted num">{fmt(agua)} / {fmt(metaAgua)} L</span></div>
        <button className="btn sm" onClick={() => salvarDia({ aguaL: Math.max(0, agua - 0.5) })} aria-label="Menos água">−</button>
        <button className="btn sm" onClick={() => salvarDia({ aguaL: agua + 0.5 })}>+0,5</button>
      </div>
      <div className="check">
        <span className={`tick ${passos !== undefined && passos >= d.passosMeta ? 'on' : ''}`}>
          {passos !== undefined && passos >= d.passosMeta && <IcCheck />}
        </span>
        <div className="grow">Passos <span className="muted num">meta {d.passosMeta.toLocaleString('pt-BR')}</span></div>
        <input
          className="input num" style={{ width: 110 }} inputMode="numeric" placeholder="0" value={passosTxt}
          onChange={(e) => setPassosTxt(e.target.value)}
          onBlur={() => salvarMedidaDiaria('passos', d.hoje, lerNumero(passosTxt))}
        />
      </div>
      <div className="check">
        <span className={`tick ${sono !== undefined && sono >= sonoMeta[0] ? 'on' : ''}`}>
          {sono !== undefined && sono >= sonoMeta[0] && <IcCheck />}
        </span>
        <div className="grow">Sono <span className="muted">meta {sonoMeta[0]}–{sonoMeta[1]} h</span></div>
        <input
          className="input num" style={{ width: 110 }} inputMode="decimal" placeholder="h" value={sonoTxt}
          onChange={(e) => setSonoTxt(e.target.value)}
          onBlur={() => salvarMedidaDiaria('sono', d.hoje, lerNumero(sonoTxt))}
        />
      </div>
    </div>
  );
}

export default function Hoje() {
  const d = useDados();
  const ir = useNav();
  const f = d.fase;
  const cfg = d.config!;
  const antes = d.semanaBruta < 1;
  const depois = d.semanaBruta > P.meta.duracaoSemanas;
  const treino = d.treinoHoje ? P.treinos[d.treinoHoje] : null;
  const feitoHoje = d.sessoes.find((s) => s.finalizada && s.data === d.hoje);

  const comecar = async (t: keyof typeof P.treinos) => {
    if (!d.emAndamento) {
      await repo.putSessao({
        id: novoId(), data: d.hoje, semana: d.semana, faseId: d.fase.id, treino: t,
        aquecimentoFeito: false, series: [], finalizada: false, iniciadaEm: Date.now(),
      });
    }
    ir('treino');
  };

  return (
    <div className="page">
      <div className="row between">
        <div>
          <div className="muted">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{antes ? 'Quase lá' : `Semana ${d.semana} de ${P.meta.duracaoSemanas}`}</h1>
        </div>
        {!antes && <span className="chip accent">{f.nome}</span>}
      </div>
      {antes ? (
        <p className="sub">O protocolo começa em {formatarData(cfg.inicio)} (faltam {diffDias(cfg.inicio, d.hoje)} dias).</p>
      ) : (
        <>
          <p className="sub">{f.foco}{f.rir ? ` · RIR ${f.rir}` : ''}</p>
          <div className="progress" aria-label="Progresso do protocolo">
            <div style={{ width: `${Math.min(100, (d.semana / P.meta.duracaoSemanas) * 100)}%`, background: CORES_FASE[f.id] }} />
          </div>
        </>
      )}

      {d.dor.procurarMedico && (
        <div className="card perigo">
          <h2>Dor no ombro persistente</h2>
          <p className="small" style={{ margin: 0 }}>3 treinos seguidos com dor acima de {P.regras.dorOmbro.limiteOk}/10. {P.regras.dorOmbro.alertaMedico}.</p>
        </div>
      )}

      <CardAjuste />

      {(d.semana === P.meta.duracaoSemanas || depois) && <ResumoFinal />}

      <div className="card">
        {d.emAndamento ? (
          <>
            <h2>Treino {d.emAndamento.treino} em andamento</h2>
            <p className="muted" style={{ marginTop: 0 }}>{P.treinos[d.emAndamento.treino].nome} · {d.emAndamento.series.length} séries registradas</p>
            <button className="btn primary block" onClick={() => ir('treino')}>Continuar treino</button>
          </>
        ) : treino && d.treinoHoje ? (
          <>
            <div className="row between">
              <h2 style={{ margin: 0 }}>Treino {d.treinoHoje} · {treino.nome}</h2>
              {feitoHoje && <span className="chip good">Feito</span>}
            </div>
            <p className="muted">
              {treino.exercicios.length} exercícios · ~{P.meta.duracaoTreinoMin} min
              {P.aquecimentoOmbro.aplicaEm.includes(d.treinoHoje) && ' · aquecimento de ombro'}
              {f.deload && ' · deload'}
            </p>
            <button className="btn primary block" onClick={() => comecar(d.treinoHoje!)}>
              {feitoHoje ? 'Treinar de novo' : 'Começar treino'}
            </button>
          </>
        ) : (
          <>
            <h2>Dia de descanso</h2>
            <p className="muted" style={{ marginTop: 0 }}>Nenhum treino na agenda de {cfg.diasPorSemana} dias. Caminhe para bater os passos.</p>
            <button className="btn block" onClick={() => ir('treino')}>Escolher um treino mesmo assim</button>
          </>
        )}
      </div>

      <div className="card">
        <h2>Metas do dia</h2>
        <div className="metric-grid">
          <div className="metric"><div className="v">{d.kcalMeta.toLocaleString('pt-BR')}</div><div className="l">kcal{cfg.ajusteKcal ? ` (ajuste ${cfg.ajusteKcal > 0 ? '+' : ''}${cfg.ajusteKcal})` : ''}</div></div>
          <div className="metric"><div className="v">{f.proteinaG} g</div><div className="l">proteína</div></div>
          <div className="metric"><div className="v">{f.carboG} g</div><div className="l">carboidrato</div></div>
          <div className="metric"><div className="v">{f.gorduraG} g</div><div className="l">gordura</div></div>
          <div className="metric"><div className="v">{d.passosMeta.toLocaleString('pt-BR')}</div><div className="l">passos</div></div>
          <div className="metric"><div className="v">{f.cardio ? `${f.cardio.sessoes}× ${f.cardio.minutos}′` : '—'}</div><div className="l">cardio na semana</div></div>
        </div>
      </div>

      <Checklist />
    </div>
  );
}
