import { useEffect, useMemo, useState } from 'react';
import CardioCard, { nomeCardio, resumoCardio } from '../components/CardioCard';
import { IcCheck } from '../components/Icones';
import { useTimer } from '../components/Timer';
import { fmt, lerNumero } from '../components/util';
import { novoId, repo } from '../data/repo';
import { formatarData } from '../domain/datas';
import { alongamentosDoTreino } from '../domain/medidas';
import { protocolo as P } from '../domain/protocolo';
import { cargaSugerida, montarTreino, rirMinimo, type CargaSugerida, type Prescricao } from '../domain/regras';
import type { SerieRegistrada, SessaoTreino, Tecnica, TreinoId } from '../domain/types';
import { useDados } from '../state';

const TREINOS = Object.keys(P.treinos) as TreinoId[];

function faixaTxt(p: Prescricao): string {
  const [a, b] = p.faixa;
  const un = p.unidade === 'reps' ? 'reps' : p.unidade === 'segundos' ? 's' : 'm';
  if (p.unidade === 'segundos' && a === 0) return `até ${b} s`;
  return a === b ? `${a} ${un}` : `${a}–${b} ${un}`;
}

function descansoTxt([a, b]: [number, number]): string {
  const m = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s} s`);
  return a === b ? m(a) : a >= 120 ? `${a / 60}–${b / 60} min` : `${a}–${b} s`;
}

// ---------------------------------------------------------------------------

function Escolher() {
  const d = useDados();
  const [escolhido, setEscolhido] = useState<TreinoId>(d.treinoHoje ?? 'A');
  const historico = [...d.sessoes].filter((s) => s.finalizada).reverse().slice(0, 20);

  const comecar = () =>
    repo.putSessao({
      id: novoId(), data: d.hoje, semana: d.semana, faseId: d.fase.id, treino: escolhido,
      aquecimentoFeito: false, series: [], finalizada: false, iniciadaEm: Date.now(),
    });

  return (
    <div className="page">
      <h1>Treino</h1>
      <p className="sub">Semana {d.semana} · {d.fase.nome}{d.treinoHoje ? ` · hoje é o treino ${d.treinoHoje}` : ' · hoje é descanso'}</p>
      <div className="card stack">
        <div className="seg">
          {TREINOS.map((t) => (
            <button key={t} className={escolhido === t ? 'on' : ''} onClick={() => setEscolhido(t)}>
              {t}{t === d.treinoHoje ? ' •' : ''}
            </button>
          ))}
        </div>
        <div>
          <strong>{P.treinos[escolhido].nome}</strong>
          <ol className="small" style={{ paddingLeft: 20, margin: '6px 0', color: 'var(--text-2)' }}>
            {P.treinos[escolhido].exercicios.map((e) => <li key={e.id}>{e.nome}</li>)}
          </ol>
        </div>
        <button className="btn primary block" onClick={comecar}>Começar treino {escolhido}</button>
      </div>

      <CardioCard titulo="Cardio avulso" />

      {historico.length > 0 && (
        <div className="card">
          <h2>Últimos treinos</h2>
          <ul className="lista">
            {historico.map((s) => (
              <li key={s.id}>
                <div>
                  <strong>{formatarData(s.data)} · {s.treino}</strong>{' '}
                  <span className="muted">sem. {s.semana} · {new Set(s.series.map((x) => x.exercicioId)).size} exerc. · {s.series.length} séries{s.duracaoMin ? ` · ${s.duracaoMin} min` : ''}</span>
                  {d.cardios.filter((c) => c.sessaoId === s.id).map((c) => (
                    <div key={c.id} className="small muted">Cardio: {nomeCardio(c.tipo)} · {resumoCardio(c)}</div>
                  ))}
                  {s.observacoes && <div className="small" style={{ whiteSpace: 'pre-wrap', marginTop: 2 }}>📝 {s.observacoes}</div>}
                </div>
                <div className="row">
                  {typeof s.dorOmbro === 'number' && (
                    <span className={`chip ${s.dorOmbro > P.regras.dorOmbro.limiteOk ? 'bad' : 'good'}`}>dor {s.dorOmbro}</span>
                  )}
                  <button className="btn ghost sm danger" aria-label="Apagar" onClick={() => { if (confirm('Apagar este treino?')) { repo.deleteSessao(s.id); d.cardios.filter((c) => c.sessaoId === s.id).forEach((c) => repo.deleteCardio(c.id)); } }}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

type Rascunho = { kg?: string; reps?: string; rir?: string; seg?: string; m?: string };

function LinhaSerie(props: {
  p: Prescricao;
  ordem: number;
  feita?: SerieRegistrada;
  kgPadrao?: number;
  rirPadrao: number;
  onSalvar: (s: SerieRegistrada | null) => void;
}) {
  const { p, ordem, feita, kgPadrao, rirPadrao, onSalvar } = props;
  const [r, setR] = useState<Rascunho>({});
  const [tecnica, setTecnica] = useState<Tecnica | undefined>(feita?.tecnica);
  const [faltou, setFaltou] = useState(false);
  useEffect(() => setTecnica(feita?.tecnica), [feita?.tecnica]);

  const val = (k: keyof Rascunho, salvo: number | undefined, padrao?: number) =>
    r[k] ?? (salvo !== undefined ? String(salvo).replace('.', ',') : padrao !== undefined ? String(padrao).replace('.', ',') : '');
  const kg = val('kg', feita?.cargaKg, kgPadrao);
  const reps = val('reps', feita?.reps);
  const rir = val('rir', feita?.rir, rirPadrao);
  const seg = val('seg', feita?.segundos);
  const m = val('m', feita?.metros);
  const ultima = ordem === p.series;

  const alternar = () => {
    if (feita) {
      onSalvar(null);
      setR({});
      return;
    }
    const s: SerieRegistrada = { exercicioId: p.exercicio.id, ordem };
    if (p.unidade === 'segundos') {
      s.segundos = lerNumero(seg);
      if (s.segundos === undefined) return setFaltou(true);
    } else if (p.unidade === 'metros') {
      s.cargaKg = lerNumero(kg);
      s.metros = lerNumero(m);
      if (s.metros === undefined) return setFaltou(true);
    } else {
      s.cargaKg = lerNumero(kg);
      s.reps = lerNumero(reps);
      s.rir = lerNumero(rir);
      if (s.reps === undefined) return setFaltou(true);
    }
    if (ultima && tecnica) s.tecnica = tecnica;
    setFaltou(false);
    onSalvar(s);
  };

  const set = (k: keyof Rascunho) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFaltou(false);
    setR((x) => ({ ...x, [k]: e.target.value }));
  };
  const cls = p.unidade === 'segundos' ? 'sem-carga' : p.unidade === 'metros' ? 'dist' : '';
  const erro = faltou ? { borderColor: 'var(--bad)' } : undefined;

  return (
    <>
      <div className={`serie ${cls} ${feita ? 'feita' : ''}`}>
        <span className="n">{ordem}</span>
        {p.unidade !== 'segundos' && (
          <input className="input num" inputMode="decimal" aria-label={`Carga série ${ordem}`} placeholder="kg" value={kg} onChange={set('kg')} disabled={!!feita} />
        )}
        {p.unidade === 'reps' && (
          <input className="input num" inputMode="numeric" aria-label={`Reps série ${ordem}`} placeholder={`${p.faixa[0]}–${p.faixa[1]}`} value={reps} onChange={set('reps')} disabled={!!feita} style={erro} />
        )}
        {p.unidade === 'segundos' && (
          <input className="input num" inputMode="numeric" aria-label={`Segundos série ${ordem}`} placeholder={`${p.faixa[0]}–${p.faixa[1]} s`} value={seg} onChange={set('seg')} disabled={!!feita} style={erro} />
        )}
        {p.unidade === 'metros' && (
          <input className="input num" inputMode="numeric" aria-label={`Metros série ${ordem}`} placeholder={`${p.faixa[0]}–${p.faixa[1]} m`} value={m} onChange={set('m')} disabled={!!feita} style={erro} />
        )}
        {p.unidade === 'reps' && (
          <input className="input num" inputMode="numeric" aria-label={`RIR série ${ordem}`} value={rir} onChange={set('rir')} disabled={!!feita} />
        )}
        <button className={`tick ${feita ? 'on' : ''}`} style={{ width: 44, height: 42 }} aria-label={feita ? 'Desmarcar série' : 'Concluir série'} onClick={alternar}>
          {feita ? <IcCheck /> : '✓'}
        </button>
      </div>
      {ultima && p.tecnicaUltimaSerie && (
        <div className="serie" style={{ marginTop: 4 }}>
          <span />
          <div className="tec">
            {(p.tecnicaUltimaSerie === 'drop set' ? (['drop-set'] as Tecnica[]) : (['rest-pause', 'drop-set'] as Tecnica[])).map((t) => (
              <button key={t} className={`chip ${tecnica === t ? 'accent' : ''}`} style={{ border: 0, cursor: 'pointer' }} disabled={!!feita} onClick={() => setTecnica(tecnica === t ? undefined : t)}>
                {t === 'rest-pause' ? 'Rest-pause' : 'Drop set'}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CardExercicio(props: {
  p: Prescricao;
  sessao: SessaoTreino;
  sug: CargaSugerida;
  rirPadrao: number;
  salvar: (s: SerieRegistrada | null, ordem: number) => void;
}) {
  const { p, sessao, sug, rirPadrao, salvar } = props;
  const ex = p.exercicio;
  const feitas = sessao.series.filter((s) => s.exercicioId === ex.id);
  const parceiro = ex.biset ? P.treinos[ex.biset[0] as TreinoId]?.exercicios[Number(ex.biset.slice(1)) - 1] : undefined;
  const completo = feitas.length >= p.series;
  const d = useDados();
  // A escolha vale para os próximos treinos também.
  const trocarVariacao = (idBase: string, id: string) => {
    if (!d.config) return;
    repo.setConfig({ ...d.config, variacoes: { ...d.config.variacoes, [idBase]: id } });
  };

  return (
    <div className="card" style={completo ? { opacity: 0.75 } : undefined}>
      <div className="ex-head">
        <div className="grow">
          <div className="ex-nome">{ex.nome}</div>
          <div className="muted num">
            {p.series} × {faixaTxt(p)} · descanso {descansoTxt(p.descansoSeg)}
          </div>
        </div>
        {completo && <span className="chip good">Feito</span>}
      </div>
      {p.opcoesVariacao && p.idBase && (
        <div className="seg" style={{ marginTop: 8 }} role="radiogroup" aria-label="Variação">
          {p.opcoesVariacao.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={ex.id === o.id}
              className={ex.id === o.id ? 'on' : ''}
              disabled={feitas.length > 0 && ex.id !== o.id}
              title={feitas.length > 0 ? 'Desmarque as séries para trocar' : undefined}
              style={{ whiteSpace: 'normal', fontSize: 13 }}
              onClick={() => trocarVariacao(p.idBase!, o.id)}
            >
              {o.nome}
            </button>
          ))}
        </div>
      )}
      <div className="row wrap" style={{ marginTop: 6 }}>
        {p.forca && <span className="chip accent">Força</span>}
        {p.serieExtra && <span className="chip accent">+1 série</span>}
        {p.fatorCarga < 1 && <span className="chip warn">carga {Math.round(p.fatorCarga * 100)}%</span>}
        {ex.strap && <span className="chip">strap</span>}
        {parceiro && <span className="chip">bi-set c/ {parceiro.nome.split(',')[0]}</span>}
        {p.tecnicaUltimaSerie && <span className="chip warn">última: {p.tecnicaUltimaSerie}</span>}
        {ex.grupo === 'pegada' && <span className="chip">pegada</span>}
      </div>
      {ex.obs && <p className="small muted" style={{ margin: '6px 0 0' }}>{ex.obs}</p>}
      {p.avisos.map((a) => (
        <p key={a} className="small" style={{ margin: '6px 0 0', color: 'var(--warn)' }}>{a}</p>
      ))}
      {p.unidade !== 'segundos' && (
        <p className="small" style={{ margin: '8px 0 0' }}>
          {sug.cargaKg !== undefined ? (
            <>
              Sugestão <strong className="num">{fmt(sug.cargaKg)} kg</strong> <span className={`chip ${sug.motivo === 'subir' ? 'good' : ''}`}>{sug.hint}</span>
            </>
          ) : (
            <span className="chip warn">{sug.hint}</span>
          )}
          {sug.ultimaCargaKg !== undefined && (
            <span className="muted"> · última {fmt(sug.ultimaCargaKg)} kg em {formatarData(sug.ultimaData!)}</span>
          )}
        </p>
      )}

      <div className={`serie-cab ${p.unidade === 'segundos' ? 'sem-carga' : p.unidade === 'metros' ? 'dist' : ''}`}>
        <span>#</span>
        {p.unidade !== 'segundos' && <span>kg</span>}
        <span>{p.unidade === 'reps' ? 'reps' : p.unidade === 'segundos' ? 'segundos' : 'metros'}</span>
        {p.unidade === 'reps' && <span>RIR</span>}
        <span />
      </div>
      {Array.from({ length: p.series }, (_, i) => i + 1).map((ordem) => {
        const feita = feitas.find((s) => s.ordem === ordem);
        // Carga padrão: a da série anterior desta sessão, senão a sugerida.
        const anterior = [...feitas].filter((s) => s.ordem < ordem && s.cargaKg !== undefined).pop()?.cargaKg;
        return (
          <LinhaSerie
            key={ordem}
            p={p}
            ordem={ordem}
            feita={feita}
            kgPadrao={anterior ?? sug.cargaKg}
            rirPadrao={rirPadrao}
            onSalvar={(s) => salvar(s, ordem)}
          />
        );
      })}
    </div>
  );
}

function Execucao({ sessao }: { sessao: SessaoTreino }) {
  const d = useDados();
  const timer = useTimer();
  const [dor, setDor] = useState<number | undefined>(sessao.dorOmbro);
  const [obs, setObs] = useState(sessao.observacoes ?? '');
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const fase = P.fases.find((f) => f.id === sessao.faseId) ?? d.fase;
  const prescricoes = useMemo(
    () =>
      montarTreino(P, sessao.treino, {
        semana: sessao.semana,
        fase,
        dorAlta: d.dor.alerta,
        substituirInclinado: d.inclinado.substituir,
        variacoes: d.config?.variacoes,
      }),
    [sessao.treino, sessao.semana, fase, d.dor.alerta, d.inclinado.substituir, d.config?.variacoes],
  );
  const historico = useMemo(() => d.sessoes.filter((s) => s.finalizada && s.id !== sessao.id), [d.sessoes, sessao.id]);
  const inc = P.regras.duplaProgressao.incrementoKg;
  const rirPadrao = rirMinimo(fase.rir);
  const temAquecimento = P.aquecimentoOmbro.aplicaEm.includes(sessao.treino);
  const pedeDor = temAquecimento;
  const aquecEspecifico = P.treinos[sessao.treino].aquecimento ?? [];
  const alongamentos = alongamentosDoTreino(P, sessao.treino);
  const alongFeitos = sessao.alongamentosFeitos ?? [];
  const alternarAlong = (id: string) =>
    repo.updateSessao(sessao.id, (a) => {
      const f = a.alongamentosFeitos ?? [];
      return { ...a, alongamentosFeitos: f.includes(id) ? f.filter((x) => x !== id) : [...f, id] };
    });
  const subst = P.treinos[sessao.treino].exercicios.find((e) => e.substituicao)?.substituicao;
  const minutos = Math.round((agora - sessao.iniciadaEm) / 60000);
  const totalSeries = prescricoes.reduce((a, p) => a + p.series, 0);

  const salvarSerie = (p: Prescricao) => (s: SerieRegistrada | null, ordem: number) => {
    repo.updateSessao(sessao.id, (atual) => {
      const resto = atual.series.filter((x) => !(x.exercicioId === p.exercicio.id && x.ordem === ordem));
      return { ...atual, series: s ? [...resto, s] : resto };
    });
    if (s) timer.iniciar(p.descansoSeg[1]);
  };

  const finalizar = async () => {
    if (pedeDor && dor === undefined && !confirm('Finalizar sem registrar a dor no ombro?')) return;
    await repo.updateSessao(sessao.id, (a) => ({ ...a, dorOmbro: dor, observacoes: obs.trim() || undefined, finalizada: true, duracaoMin: Math.min(240, Math.max(1, minutos)) }));
    timer.parar();
    window.scrollTo(0, 0);
  };

  return (
    <div className="page">
      <div className="row between">
        <div>
          <h1>Treino {sessao.treino}</h1>
          <p className="sub" style={{ margin: 0 }}>{P.treinos[sessao.treino].nome} · {fase.nome}{fase.rir ? ` · RIR ${fase.rir}` : ''}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontWeight: 700 }}>{minutos} min</div>
          <div className="muted num">{sessao.series.length}/{totalSeries} séries</div>
        </div>
      </div>
      {sessao.series.length === 0 && (
        <div className="seg" style={{ marginTop: 10 }}>
          {TREINOS.map((t) => (
            <button key={t} className={sessao.treino === t ? 'on' : ''} onClick={() => repo.updateSessao(sessao.id, (a) => ({ ...a, treino: t }))}>{t}</button>
          ))}
        </div>
      )}

      {d.dor.alerta && (
        <div className="card perigo small">
          <strong>Última dor no ombro: {d.dor.ultima}/10.</strong> {P.regras.dorOmbro.acaoAcimaDoLimite}. Exercícios sensíveis já foram trocados ou estão com carga reduzida.
        </div>
      )}
      {subst && sessao.semana >= subst.aPartirDaSemana && (
        <div className={`card small ${d.inclinado.substituir ? 'ok' : 'alerta'}`}>
          {d.inclinado.substituir
            ? <>Supino inclinado liberado: {d.inclinado.motivo}.</>
            : <>Mantendo o crossover: {d.inclinado.motivo}.</>}
        </div>
      )}

      {temAquecimento && (
        <div className={`card ${sessao.aquecimentoFeito ? 'ok' : ''}`}>
          <div className="row between">
            <h2 style={{ margin: 0 }}>Aquecimento de ombro</h2>
            <span className="muted">{P.aquecimentoOmbro.duracaoMin[0]}–{P.aquecimentoOmbro.duracaoMin[1]} min</span>
          </div>
          {!sessao.aquecimentoFeito && (
            <ul className="lista small" style={{ margin: '6px 0' }}>
              {P.aquecimentoOmbro.itens.map((i) => (
                <li key={i.nome}><span>{i.nome}</span><span className="muted num">{i.series} × {i.reps}</span></li>
              ))}
            </ul>
          )}
          <div className="check" style={{ paddingBottom: 0 }}>
            <button className={`tick ${sessao.aquecimentoFeito ? 'on' : ''}`} aria-label="Aquecimento feito" onClick={() => repo.updateSessao(sessao.id, (a) => ({ ...a, aquecimentoFeito: !a.aquecimentoFeito }))}>
              {sessao.aquecimentoFeito && <IcCheck />}
            </button>
            <span>Aquecimento feito</span>
          </div>
        </div>
      )}

      {aquecEspecifico.length > 0 && (
        <div className={`card ${sessao.aquecimentoEspecificoFeito ? 'ok' : ''}`}>
          <h2 style={{ margin: 0 }}>Aquecimento do treino</h2>
          <ul className="lista small" style={{ margin: '6px 0' }}>
            {aquecEspecifico.map((e) => (
              <li key={e.id}>
                <span>
                  {e.nome}
                  {e.obs && <div className="muted">{e.obs}</div>}
                </span>
                <span className="muted num" style={{ whiteSpace: 'nowrap' }}>{e.series} × {e.reps ? (e.reps[0] === e.reps[1] ? e.reps[0] : e.reps.join('–')) : ''}</span>
              </li>
            ))}
          </ul>
          <div className="check" style={{ paddingBottom: 0 }}>
            <button className={`tick ${sessao.aquecimentoEspecificoFeito ? 'on' : ''}`} aria-label="Aquecimento do treino feito" onClick={() => repo.updateSessao(sessao.id, (a) => ({ ...a, aquecimentoEspecificoFeito: !a.aquecimentoEspecificoFeito }))}>
              {sessao.aquecimentoEspecificoFeito && <IcCheck />}
            </button>
            <span>Aquecimento feito</span>
          </div>
        </div>
      )}

      {prescricoes.map((p) => (
        <CardExercicio
          key={p.exercicio.id + (p.original?.id ?? '')}
          p={p}
          sessao={sessao}
          rirPadrao={rirPadrao}
          sug={cargaSugerida({
            exercicioId: p.exercicio.id,
            tipo: p.exercicio.tipo,
            topoFaixa: p.faixa[1],
            unidade: p.unidade,
            fatorCarga: p.fatorCarga,
            historico,
            fases: P.fases,
            incrementoKg: { composto: inc.composto[0], isolado: inc.isolado[0] },
          })}
          salvar={salvarSerie(p)}
        />
      ))}

      {alongamentos.length > 0 && (
        <div className={`card ${alongamentos.every((a) => alongFeitos.includes(a.id)) ? 'ok' : ''}`}>
          <h2>Correção postural (fim do treino)</h2>
          {alongamentos.map((a) => (
            <div className="check" key={a.id}>
              <button className={`tick ${alongFeitos.includes(a.id) ? 'on' : ''}`} aria-label={a.nome} onClick={() => alternarAlong(a.id)}>
                {alongFeitos.includes(a.id) && <IcCheck />}
              </button>
              <div className="grow">
                {a.nome}
                <div className="muted small">{a.series} × {a.segundos} s{a.obs ? ` ${a.obs}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CardioCard sessaoId={sessao.id} data={sessao.data} titulo="Cardio (fim do treino)" />

      <div className="card">
        <label className="campo" style={{ marginBottom: 12 }}>
          <strong style={{ color: 'var(--text)' }}>Anotações</strong>
          <textarea
            className="input"
            rows={3}
            placeholder="Ex.: troquei o supino com halteres pela barra, me senti mais seguro no ombro"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            onBlur={() => obs !== (sessao.observacoes ?? '') && repo.updateSessao(sessao.id, (a) => ({ ...a, observacoes: obs.trim() || undefined }))}
          />
        </label>
        {pedeDor && (
          <>
            <h2>Dor no ombro hoje (0–10)</h2>
            <div className="dor-escala">
              {Array.from({ length: 11 }, (_, i) => (
                <button key={i} className={dor === i ? 'on' : ''} onClick={() => setDor(i)} style={i > P.regras.dorOmbro.limiteOk && dor !== i ? { color: 'var(--bad)' } : undefined}>{i}</button>
              ))}
            </div>
            <p className="muted">Acima de {P.regras.dorOmbro.limiteOk}: o próximo treino troca exercícios sensíveis e reduz carga.</p>
          </>
        )}
        <button className="btn primary block" onClick={finalizar}>Finalizar treino</button>
        <button className="btn ghost danger block" style={{ marginTop: 8 }} onClick={() => { if (confirm('Descartar este treino? As séries registradas serão apagadas.')) { timer.parar(); repo.deleteSessao(sessao.id); d.cardios.filter((c) => c.sessaoId === sessao.id).forEach((c) => repo.deleteCardio(c.id)); } }}>
          Descartar
        </button>
      </div>
    </div>
  );
}

export default function TreinoTela() {
  const d = useDados();
  return d.emAndamento ? <Execucao sessao={d.emAndamento} /> : <Escolher />;
}
