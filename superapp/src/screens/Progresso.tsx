import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmt } from '../components/util';
import { deDias, formatarData, paraDias } from '../domain/datas';
import { protocolo as P } from '../domain/protocolo';
import { aderenciaSemanal, buscarExercicio, mediaMovel } from '../domain/regras';
import type { TipoMedida } from '../domain/types';
import { useDados } from '../state';

/** Lê as cores do tema (CSS) para passar ao Recharts; reage a modo claro/escuro. */
function useCores() {
  const ler = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => s.getPropertyValue(n).trim();
    return { s1: v('--series-1'), s2: v('--series-2'), muted: v('--muted-mark'), bad: v('--bad'), grid: v('--grid'), surface: v('--surface') };
  };
  const [c, setC] = useState(ler);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const f = () => setC(ler());
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return c;
}

const eixoData = {
  type: 'number' as const,
  dataKey: 'x',
  domain: ['dataMin', 'dataMax'] as [string, string],
  tickFormatter: (x: number) => formatarData(deDias(x)),
  tickLine: false,
  axisLine: false,
  minTickGap: 24,
};
const eixoY = { tickLine: false, axisLine: false, width: 36, domain: ['auto', 'auto'] as [string, string] };
const rotuloData = (x: unknown) => formatarData(deDias(Number(x)));

function Grafico({ titulo, vazio, children, rodape }: { titulo: string; vazio: boolean; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="card">
      <h2>{titulo}</h2>
      {vazio ? <p className="muted">Sem dados ainda.</p> : <div className="chart">{children}</div>}
      {rodape}
    </div>
  );
}

function serieMedida(medidas: { tipo: TipoMedida; data: string; valor: number }[], tipo: TipoMedida) {
  return medidas.filter((m) => m.tipo === tipo).map((m) => ({ x: paraDias(m.data), data: m.data, valor: m.valor }));
}

export default function Progresso() {
  const d = useDados();
  const c = useCores();
  const tooltipStyle = { contentStyle: { background: c.surface, borderRadius: 8 }, labelFormatter: rotuloData };

  const peso = useMemo(() => {
    const pts = d.medidas.filter((m) => m.tipo === 'peso').map((m) => ({ data: m.data, valor: m.valor }));
    const mm = mediaMovel(pts, 7);
    return mm.map((p) => {
      const doDia = pts.filter((x) => x.data === p.data).map((x) => x.valor);
      return { x: paraDias(p.data), dia: doDia.reduce((a, b) => a + b, 0) / doDia.length, media7: Math.round(p.valor * 100) / 100 };
    });
  }, [d.medidas]);

  const exerciciosComCarga = useMemo(() => {
    const ids = new Set<string>();
    d.sessoes.forEach((s) => s.finalizada && s.series.forEach((x) => x.cargaKg !== undefined && ids.add(x.exercicioId)));
    return [...ids].map((id) => ({ id, nome: buscarExercicio(P, id)?.nome ?? id })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [d.sessoes]);
  const [exId, setExId] = useState<string>('');
  const exAtual = exId || exerciciosComCarga[0]?.id || '';

  const cargas = useMemo(
    () =>
      d.sessoes
        .filter((s) => s.finalizada)
        .flatMap((s) => {
          const ks = s.series.filter((x) => x.exercicioId === exAtual && x.cargaKg !== undefined).map((x) => x.cargaKg!);
          return ks.length ? [{ x: paraDias(s.data), carga: Math.max(...ks), treino: s.treino }] : [];
        }),
    [d.sessoes, exAtual],
  );

  const dor = d.sessoes.filter((s) => s.finalizada && typeof s.dorOmbro === 'number').map((s) => ({ x: paraDias(s.data), dor: s.dorOmbro }));
  const cintura = serieMedida(d.medidas, 'cintura');
  const gordura = serieMedida(d.medidas, 'gorduraPct');
  const ader = d.config && d.semanaBruta >= 1 ? aderenciaSemanal(d.sessoes, d.config.inicio, d.semana, d.config.diasPorSemana) : [];
  const ultimaMedia = peso[peso.length - 1]?.media7;

  return (
    <div className="page">
      <h1>Progresso</h1>
      <p className="sub">Semana {d.semana} · {d.fase.nome}</p>

      <Grafico
        titulo="Peso (kg)"
        vazio={peso.length === 0}
        rodape={ultimaMedia !== undefined && <p className="muted" style={{ marginBottom: 0 }}>Média 7 dias atual: <strong className="num">{fmt(ultimaMedia, 2)} kg</strong> · meta 6 meses {String(P.meta.metas.seisMeses.pesoKg).replace(',', '–')} kg</p>}
      >
        <ResponsiveContainer>
          <ComposedChart data={peso} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis {...eixoData} />
            <YAxis {...eixoY} />
            <Tooltip {...tooltipStyle} formatter={(v: number, n) => [`${fmt(v, 2)} kg`, n]} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            <Scatter name="Diário" dataKey="dia" fill={c.muted} />
            <Line name="Média 7 dias" dataKey="media7" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Grafico>

      <Grafico titulo="Cintura (cm)" vazio={cintura.length === 0}>
        <ResponsiveContainer>
          <LineChart data={cintura} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis {...eixoData} />
            <YAxis {...eixoY} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`${fmt(v)} cm`, 'Cintura']} />
            <Line dataKey="valor" stroke={c.s1} strokeWidth={2} dot={{ r: 4, fill: c.s1, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Grafico>

      <Grafico titulo="% de gordura" vazio={gordura.length === 0}>
        <ResponsiveContainer>
          <LineChart data={gordura} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis {...eixoData} />
            <YAxis {...eixoY} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`${fmt(v)} %`, 'Gordura']} />
            <Line dataKey="valor" stroke={c.s1} strokeWidth={2} dot={{ r: 4, fill: c.s1, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Grafico>

      <div className="card">
        <h2>Carga por exercício (kg)</h2>
        {exerciciosComCarga.length === 0 ? (
          <p className="muted">Sem treinos registrados ainda.</p>
        ) : (
          <>
            <select className="input" value={exAtual} onChange={(e) => setExId(e.target.value)} aria-label="Exercício">
              {exerciciosComCarga.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            <div className="chart" style={{ marginTop: 8 }}>
              <ResponsiveContainer>
                <LineChart data={cargas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis {...eixoData} />
                  <YAxis {...eixoY} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => [`${fmt(v)} kg`, 'Carga máx.']} />
                  <Line dataKey="carga" stroke={c.s1} strokeWidth={2} dot={{ r: 4, fill: c.s1, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      <Grafico titulo="Dor no ombro (0–10)" vazio={dor.length === 0} rodape={<p className="muted" style={{ marginBottom: 0 }}>Linha tracejada: limite {P.regras.dorOmbro.limiteOk}.</p>}>
        <ResponsiveContainer>
          <LineChart data={dor} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis {...eixoData} />
            <YAxis {...eixoY} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}/10`, 'Dor']} />
            <ReferenceLine y={P.regras.dorOmbro.limiteOk} stroke={c.bad} strokeDasharray="4 4" />
            <Line dataKey="dor" stroke={c.s1} strokeWidth={2} dot={{ r: 4, fill: c.s1, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Grafico>

      <Grafico titulo="Aderência semanal (% dos treinos)" vazio={ader.length === 0}>
        <ResponsiveContainer>
          <BarChart data={ader} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="semana" tickLine={false} axisLine={false} />
            <YAxis {...eixoY} domain={[0, 100]} ticks={[0, 50, 100]} />
            <Tooltip
              contentStyle={{ background: c.surface, borderRadius: 8 }}
              labelFormatter={(s) => `Semana ${s}`}
              formatter={(v: number, _n, item) => [`${v}% (${item.payload.feitos} treinos)`, 'Aderência']}
            />
            <Bar dataKey="pct" fill={c.s1} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </Grafico>
    </div>
  );
}
