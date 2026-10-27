// Regras de negócio do protocolo. Tudo aqui é função pura: recebe dados, devolve
// resultado, sem acessar banco, relógio ou DOM. Testado em regras.test.ts.

import { diaDaSemana, diffDias, formatarData, paraDias, somarDias } from './datas';
import type {
  Exercicio,
  Fase,
  Medida,
  Protocolo,
  SessaoTreino,
  TreinoId,
} from './types';

// ---------------------------------------------------------------------------
// Semana, fase e treino do dia
// ---------------------------------------------------------------------------

/** Semana do programa sem limites: < 1 antes do início, > 26 depois do fim. */
export function semanaDoPrograma(inicio: string, hoje: string): number {
  return Math.floor(diffDias(hoje, inicio) / 7) + 1;
}

/** Semana limitada ao intervalo do programa (1..duracao). */
export function semanaAtual(inicio: string, hoje: string, duracao = 26): number {
  return Math.min(duracao, Math.max(1, semanaDoPrograma(inicio, hoje)));
}

export function faseDaSemana(fases: Fase[], semana: number): Fase {
  const f = fases.find((x) => semana >= x.semanas[0] && semana <= x.semanas[1]);
  if (f) return f;
  return semana < fases[0].semanas[0] ? fases[0] : fases[fases.length - 1];
}

export function treinoDoDia(
  agenda: Protocolo['agendaSemanal'],
  diasPorSemana: 4 | 5,
  data: string,
): TreinoId | null {
  const padrao = diasPorSemana === 4 ? agenda.padrao4 : agenda.padrao5;
  return padrao[diaDaSemana(data)] ?? null;
}

/** Início (inclusive) e fim (inclusive) de uma semana do programa. */
export function intervaloDaSemana(inicio: string, semana: number): [string, string] {
  const ini = somarDias(inicio, (semana - 1) * 7);
  return [ini, somarDias(ini, 6)];
}

/** "3" → 3, "1-2" → 1, "0-1 (isolados)" → 0, null → 0. */
export function rirMinimo(rir: string | null | undefined): number {
  if (!rir) return 0;
  const m = rir.match(/\d+/);
  return m ? Number(m[0]) : 0;
}

// ---------------------------------------------------------------------------
// Séries e reps por fase
// ---------------------------------------------------------------------------

export type Unidade = 'reps' | 'segundos' | 'metros';

export interface Prescricao {
  /** Exercício efetivo (após substituição/troca por dor). */
  exercicio: Exercicio;
  /** Exercício do protocolo, quando houve troca. */
  original?: Exercicio;
  series: number;
  faixa: [number, number];
  unidade: Unidade;
  descansoSeg: [number, number];
  forca: boolean;
  serieExtra: boolean;
  /** Técnica a aplicar na última série (fase 4, isolados). */
  tecnicaUltimaSerie?: 'rest-pause ou drop set' | 'drop set';
  /** Multiplicador sobre a carga sugerida (deload 0,8; dor alta 0,8). */
  fatorCarga: number;
  avisos: string[];
  /** Id do exercício no protocolo (antes de variação/troca). */
  idBase?: string;
  /** Opções de variação deste exercício (a primeira é a do protocolo). */
  opcoesVariacao?: { id: string; nome: string }[];
}

/** Aplica a variação escolhida (ou a preferida do protocolo). Mantém séries, reps e marcações. */
export function aplicarVariacao(ex: Exercicio, escolhida?: string): Exercicio {
  const id = escolhida ?? ex.variacaoPreferida;
  if (!id || id === ex.id) return ex;
  const v = ex.variacoes?.find((x) => x.id === id);
  if (!v) return ex;
  const { variacoes: _v, variacaoPreferida: _p, ...resto } = ex;
  return { ...resto, id: v.id, nome: v.nome, obs: v.obs };
}

export interface ContextoTreino {
  semana: number;
  fase: Fase;
  /** Última dor registrada > limite (3). */
  dorAlta?: boolean;
  /** Resultado da regra do inclinado. */
  substituirInclinado?: boolean;
  /** Variação escolhida pelo usuário (id do protocolo → id usado). */
  variacoes?: Record<string, string>;
}

export const FATOR_CARGA_DOR = 0.8;

export function unidadeDe(ex: Exercicio): { unidade: Unidade; faixa: [number, number] } {
  if (ex.segundos) return { unidade: 'segundos', faixa: ex.segundos };
  if (ex.metros) return { unidade: 'metros', faixa: ex.metros };
  return { unidade: 'reps', faixa: ex.reps ?? [0, 0] };
}

export function descansoPara(ex: Exercicio, forca: boolean, fase: Fase): [number, number] {
  if (forca && fase.esquemaForca) {
    const s = fase.esquemaForca.descansoSeg;
    return [s, s];
  }
  if (ex.tipo === 'composto') return [120, 180];
  return [60, 90];
}

/** Ajusta séries/reps/descanso de um exercício para a fase (sem trocas). */
export function prescreverExercicio(
  ex: Exercicio,
  fase: Fase,
  fatorDeload = 0.5,
  fatorCargaDeload = 0.8,
  idOriginal?: string,
): Prescricao {
  let { unidade, faixa } = unidadeDe(ex);
  let series = ex.series;
  let forca = false;
  let serieExtra = false;
  let fatorCarga = 1;
  const avisos: string[] = [];

  if (fase.esquemaForca && ex.forcaFase3) {
    series = fase.esquemaForca.series;
    faixa = [...fase.esquemaForca.reps];
    forca = true;
  }
  const idsExtra = fase.seriesExtras ?? [];
  if (idsExtra.includes(ex.id) || (idOriginal && idsExtra.includes(idOriginal))) {
    series += 1;
    serieExtra = true;
  }
  if (fase.deload) {
    series = Math.ceil(series * fatorDeload);
    fatorCarga *= fatorCargaDeload;
  }
  let tecnicaUltimaSerie: Prescricao['tecnicaUltimaSerie'];
  if (fase.tecnicasIntensidade && ex.tipo === 'isolado') {
    tecnicaUltimaSerie = ex.dropSetFase4 ? 'drop set' : 'rest-pause ou drop set';
  }
  if (ex.meta) {
    avisos.push(`Meta: ${ex.meta.segundos} s até a semana ${ex.meta.ateSemana}`);
  }

  return {
    exercicio: ex,
    series,
    faixa,
    unidade,
    descansoSeg: descansoPara(ex, forca, fase),
    forca,
    serieExtra,
    tecnicaUltimaSerie,
    fatorCarga,
    avisos,
  };
}

export function buscarExercicio(p: Protocolo, id: string): Exercicio | undefined {
  for (const t of Object.values(p.treinos)) {
    const e = t.exercicios.find((x) => x.id === id);
    if (e) return e;
    const s = t.exercicios.find((x) => x.substituicao?.id === id)?.substituicao;
    if (s) return { ...s };
    const comVar = t.exercicios.find((x) => x.variacoes?.some((v) => v.id === id));
    if (comVar) return aplicarVariacao(comVar, id);
  }
  return undefined;
}

/** Lista de exercícios do treino já ajustada à fase, substituição e dor. */
export function montarTreino(p: Protocolo, treino: TreinoId, ctx: ContextoTreino): Prescricao[] {
  const { fatorSeries, fatorCarga } = p.regras.deload;
  return p.treinos[treino].exercicios.map((original) => {
    let ex = aplicarVariacao(original, ctx.variacoes?.[original.id]);
    let trocado = ex !== original;
    const avisosTroca: string[] = [];

    if (original.substituicao && ctx.substituirInclinado && ctx.semana >= original.substituicao.aPartirDaSemana) {
      const s = original.substituicao;
      ex = { id: s.id, nome: s.nome, series: s.series, reps: s.reps, tipo: s.tipo };
      trocado = true;
      if (s.cargaInicialPct) {
        avisosTroca.push(`Reintrodução: comece com ~${s.cargaInicialPct}% da carga antiga`);
      }
    }

    let fatorDor = 1;
    if (ctx.dorAlta && ex.ombroSensivel) {
      const alt = ex.alternativaSeDor ? buscarExercicio(p, ex.alternativaSeDor) : undefined;
      if (alt) {
        avisosTroca.push(`Dor no ombro > 3: trocado por ${alt.nome} (era ${ex.nome})`);
        ex = { ...alt, series: ex.series };
        trocado = true;
      } else {
        avisosTroca.push('Dor no ombro > 3: reduza a carga e pare se doer');
      }
      fatorDor = FATOR_CARGA_DOR;
    }

    const pr = prescreverExercicio(ex, ctx.fase, fatorSeries, fatorCarga, original.id);
    pr.fatorCarga *= fatorDor;
    pr.avisos = [...avisosTroca, ...pr.avisos];
    if (trocado) pr.original = original;
    pr.idBase = original.id;
    if (original.variacoes?.length) {
      pr.opcoesVariacao = [{ id: original.id, nome: original.nome }, ...original.variacoes.map((v) => ({ id: v.id, nome: v.nome }))];
    }
    return pr;
  });
}

// ---------------------------------------------------------------------------
// Carga sugerida (dupla progressão)
// ---------------------------------------------------------------------------

export interface EntradaCarga {
  exercicioId: string;
  tipo: Exercicio['tipo'];
  /** Topo da faixa prescrita hoje (reps, segundos ou metros). */
  topoFaixa: number;
  unidade: Unidade;
  /** Fator da prescrição de hoje (deload/dor). */
  fatorCarga: number;
  /** Sessões finalizadas (qualquer ordem). */
  historico: SessaoTreino[];
  fases: Fase[];
  incrementoKg: { composto: number; isolado: number };
}

export interface CargaSugerida {
  cargaKg?: number;
  ultimaCargaKg?: number;
  ultimaData?: string;
  motivo: 'subir' | 'repetir' | 'sem-historico' | 'sem-carga';
  hint: string;
}

export function arredondarCarga(kg: number): number {
  return Math.round(kg * 2) / 2;
}

function ordenarRecentes(s: SessaoTreino[]): SessaoTreino[] {
  return [...s].sort((a, b) => (a.data === b.data ? b.iniciadaEm - a.iniciadaEm : a.data < b.data ? 1 : -1));
}

export function cargaSugerida(e: EntradaCarga): CargaSugerida {
  const comExercicio = ordenarRecentes(e.historico).filter(
    (s) => s.finalizada && s.series.some((x) => x.exercicioId === e.exercicioId),
  );
  if (comExercicio.length === 0) {
    return { motivo: 'sem-historico', hint: 'testar carga' };
  }
  const ehDeload = (s: SessaoTreino) => !!e.fases.find((f) => f.id === s.faseId)?.deload;
  // Sessões de deload usam carga reduzida: não servem de base para progressão.
  const base = comExercicio.find((s) => !ehDeload(s)) ?? comExercicio[0];
  const series = base.series.filter((x) => x.exercicioId === e.exercicioId);
  const cargas = series.map((x) => x.cargaKg).filter((x): x is number => typeof x === 'number');
  if (cargas.length === 0) {
    return { motivo: 'sem-carga', hint: 'sem carga registrada', ultimaData: base.data };
  }
  const ultima = Math.max(...cargas);
  const rirMin = rirMinimo(e.fases.find((f) => f.id === base.faseId)?.rir);
  const valor = (x: (typeof series)[number]) =>
    e.unidade === 'segundos' ? x.segundos : e.unidade === 'metros' ? x.metros : x.reps;
  const bateuTopo = series.every((x) => (valor(x) ?? 0) >= e.topoFaixa && (x.rir === undefined || x.rir >= rirMin));

  const emDeload = e.fatorCarga < 1;
  if (bateuTopo && !emDeload) {
    const inc = e.tipo === 'isolado' ? e.incrementoKg.isolado : e.incrementoKg.composto;
    return {
      cargaKg: arredondarCarga((ultima + inc) * e.fatorCarga),
      ultimaCargaKg: ultima,
      ultimaData: base.data,
      motivo: 'subir',
      hint: `+${String(inc).replace('.', ',')} kg`,
    };
  }
  return {
    cargaKg: arredondarCarga(ultima * e.fatorCarga),
    ultimaCargaKg: ultima,
    ultimaData: base.data,
    motivo: 'repetir',
    hint: e.fatorCarga < 1 ? `${Math.round(e.fatorCarga * 100)}% da última` : 'repetir carga',
  };
}

// ---------------------------------------------------------------------------
// Ombro: regra do inclinado e alertas de dor
// ---------------------------------------------------------------------------

export const SEMANA_INCLINADO = 18;
export const DOR_MAX_INCLINADO = 2;
export const LIMITE_DOR = 3;

export function avaliarInclinado(
  semana: number,
  sessoes: SessaoTreino[],
  hoje: string,
  aPartirDaSemana = SEMANA_INCLINADO,
): { substituir: boolean; motivo: string } {
  if (semana < aPartirDaSemana) {
    return { substituir: false, motivo: `Supino inclinado só a partir da semana ${aPartirDaSemana}` };
  }
  const desde = somarDias(hoje, -28);
  const comDor = sessoes.filter(
    (s) => s.finalizada && typeof s.dorOmbro === 'number' && s.data > desde && s.data <= hoje,
  );
  if (comDor.length === 0) {
    return { substituir: false, motivo: 'Sem registro de dor no ombro nas últimas 4 semanas' };
  }
  const acima = comDor.filter((s) => (s.dorOmbro as number) > DOR_MAX_INCLINADO);
  if (acima.length > 0) {
    const pior = acima.reduce((a, b) => ((b.dorOmbro as number) > (a.dorOmbro as number) ? b : a));
    return {
      substituir: false,
      motivo: `Dor ${pior.dorOmbro}/10 em ${formatarData(pior.data)} (precisa ser ≤ ${DOR_MAX_INCLINADO} por 4 semanas)`,
    };
  }
  return { substituir: true, motivo: `Dor ≤ ${DOR_MAX_INCLINADO} em ${comDor.length} treinos nas últimas 4 semanas` };
}

export function statusDor(
  sessoes: SessaoTreino[],
  limite = LIMITE_DOR,
): { ultima?: number; alerta: boolean; procurarMedico: boolean } {
  const comDor = ordenarRecentes(sessoes).filter((s) => s.finalizada && typeof s.dorOmbro === 'number');
  const ultima = comDor[0]?.dorOmbro;
  const tres = comDor.slice(0, 3);
  return {
    ultima,
    alerta: typeof ultima === 'number' && ultima > limite,
    procurarMedico: tres.length === 3 && tres.every((s) => (s.dorOmbro as number) > limite),
  };
}

// ---------------------------------------------------------------------------
// Peso: médias
// ---------------------------------------------------------------------------

export interface Ponto {
  data: string;
  valor: number;
}

function media(v: number[]): number | undefined {
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}

/** Média móvel de N dias corridos (janela termina na data do ponto). */
export function mediaMovel(pontos: Ponto[], dias = 7): Ponto[] {
  const ord = [...pontos].sort((a, b) => (a.data < b.data ? -1 : 1));
  const datas = [...new Set(ord.map((p) => p.data))];
  return datas.map((d) => {
    const ini = paraDias(d) - (dias - 1);
    const janela = ord.filter((p) => paraDias(p.data) >= ini && p.data <= d).map((p) => p.valor);
    return { data: d, valor: media(janela) as number };
  });
}

export function mediaDaSemana(medidas: Ponto[], inicio: string, semana: number): number | undefined {
  const [a, b] = intervaloDaSemana(inicio, semana);
  return media(medidas.filter((m) => m.data >= a && m.data <= b).map((m) => m.valor));
}

// ---------------------------------------------------------------------------
// Ajuste calórico (a cada 2 semanas)
// ---------------------------------------------------------------------------

export const TOLERANCIA_PESO_KG = 0.2;
export const TOLERANCIA_CINTURA_CM = 0.5;

/** Semanas em que o app avalia o ajuste: 3, 5, 7, … (fechou um bloco de 2 semanas). */
export function semanaDeAvaliacao(semana: number, janela = 2): boolean {
  return semana > janela && (semana - 1) % janela === 0;
}

export interface SugestaoAjuste {
  semana: number;
  sugestao: 'subir' | 'baixar';
  titulo: string;
  detalhe: string;
}

export function avaliarAjusteCalorico(args: {
  semana: number;
  inicio: string;
  fase: Fase;
  pesos: Ponto[];
  cinturas: Ponto[];
  regras: Protocolo['regras']['ajusteCalorico'];
}): SugestaoAjuste | null {
  const { semana, inicio, fase, pesos, cinturas, regras } = args;
  if (!semanaDeAvaliacao(semana, regras.janelaSemanas)) return null;

  const m1 = mediaDaSemana(pesos, inicio, semana - 1);
  const m2 = mediaDaSemana(pesos, inicio, semana - 2);
  const m3 = semana - 3 >= 1 ? mediaDaSemana(pesos, inicio, semana - 3) : undefined;
  if (m1 === undefined || m2 === undefined) return null;

  // Queda média por semana dentro da janela de 2 semanas.
  const queda = m3 !== undefined ? (m3 - m1) / 2 : m2 - m1;
  const fmt = (n: number) => n.toFixed(2).replace('.', ',');

  if (queda > regras.seQuedaMaiorQueKgSem) {
    return {
      semana,
      sugestao: 'subir',
      titulo: 'Perda de peso rápida demais',
      detalhe: `Queda média de ${fmt(queda)} kg/semana (limite ${fmt(regras.seQuedaMaiorQueKgSem)}). Sugestão: ${regras.entao}.`,
    };
  }

  if (regras.seEstagnadoFases.includes(fase.id)) {
    const [, fimJanela] = intervaloDaSemana(inicio, semana - 1);
    const cs = [...cinturas].filter((c) => c.data <= fimJanela).sort((a, b) => (a.data < b.data ? 1 : -1));
    const c1 = cs[0];
    const c0 = c1 && cs.find((c) => diffDias(c1.data, c.data) >= 7);
    const pesoEstavel = Math.abs(m2 - m1) <= TOLERANCIA_PESO_KG;
    const cinturaEstavel = !!c1 && !!c0 && Math.abs(c0.valor - c1.valor) <= TOLERANCIA_CINTURA_CM;
    if (pesoEstavel && cinturaEstavel) {
      return {
        semana,
        sugestao: 'baixar',
        titulo: 'Peso e cintura estagnados',
        detalhe: `Média de peso ${fmt(m2)} → ${fmt(m1)} kg e cintura ${c0!.valor} → ${c1.valor} cm em 2 semanas. Sugestão: ${regras.entaoEstagnado}.`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Aderência e resumo da semana 26
// ---------------------------------------------------------------------------

export function aderenciaSemanal(
  sessoes: SessaoTreino[],
  inicio: string,
  ateSemana: number,
  diasPorSemana: number,
): { semana: number; feitos: number; pct: number }[] {
  const out = [];
  for (let w = 1; w <= ateSemana; w++) {
    const [a, b] = intervaloDaSemana(inicio, w);
    const feitos = sessoes.filter((s) => s.finalizada && s.data >= a && s.data <= b).length;
    out.push({ semana: w, feitos, pct: Math.min(100, Math.round((feitos / diasPorSemana) * 100)) });
  }
  return out;
}

export interface ResumoFinal {
  peso: { inicio?: number; fim?: number };
  cintura: { inicio?: number; fim?: number };
  gordura: { inicio?: number; fim?: number };
  cargas: { exercicioId: string; nome: string; inicio: number; fim: number }[];
  decisao: string;
}

export function resumoSemana26(p: Protocolo, medidas: Medida[], sessoes: SessaoTreino[]): ResumoFinal {
  const porTipo = (t: Medida['tipo']) =>
    medidas.filter((m) => m.tipo === t).sort((a, b) => (a.data < b.data ? -1 : 1));
  const extremos = (t: Medida['tipo']) => {
    const v = porTipo(t);
    if (!v.length) return { inicio: undefined, fim: undefined };
    // Peso: média dos 7 primeiros/últimos dias, para não depender de um dia só.
    if (t === 'peso') {
      const ini = v.filter((m) => diffDias(m.data, v[0].data) < 7).map((m) => m.valor);
      const fim = v.filter((m) => diffDias(v[v.length - 1].data, m.data) < 7).map((m) => m.valor);
      return { inicio: media(ini), fim: media(fim) };
    }
    return { inicio: v[0].valor, fim: v[v.length - 1].valor };
  };

  const peso = extremos('peso');
  const gordura = extremos('gorduraPct');
  if (gordura.inicio === undefined) gordura.inicio = p.meta.atleta.gorduraInicialPct;
  if (peso.inicio === undefined) peso.inicio = p.meta.atleta.pesoInicialKg;

  const ord = [...sessoes].filter((s) => s.finalizada).sort((a, b) => (a.data < b.data ? -1 : 1));
  const cargasMap = new Map<string, { inicio: number; fim: number }>();
  for (const s of ord) {
    const porEx = new Map<string, number>();
    for (const x of s.series) {
      if (typeof x.cargaKg !== 'number') continue;
      porEx.set(x.exercicioId, Math.max(porEx.get(x.exercicioId) ?? 0, x.cargaKg));
    }
    for (const [id, kg] of porEx) {
      const atual = cargasMap.get(id);
      cargasMap.set(id, { inicio: atual ? atual.inicio : kg, fim: kg });
    }
  }
  const cargas = [...cargasMap].map(([exercicioId, v]) => ({
    exercicioId,
    nome: buscarExercicio(p, exercicioId)?.nome ?? exercicioId,
    ...v,
  }));

  const d = p.regras.decisaoSemana26;
  const gFim = gordura.fim ?? gordura.inicio;
  const decisao = gFim !== undefined && gFim <= d.seGorduraPctMenorOuIgual ? d.entao : d.senao;

  return { peso, cintura: extremos('cintura'), gordura, cargas, decisao };
}
