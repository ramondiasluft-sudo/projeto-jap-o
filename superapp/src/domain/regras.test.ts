import { describe, expect, it } from 'vitest';
import { diaDaSemana, somarDias } from './datas';
import { protocolo as P } from './protocolo';
import {
  aderenciaSemanal,
  avaliarAjusteCalorico,
  avaliarInclinado,
  cargaSugerida,
  faseDaSemana,
  mediaMovel,
  montarTreino,
  resumoSemana26,
  rirMinimo,
  semanaAtual,
  semanaDoPrograma,
  statusDor,
  treinoDoDia,
  type EntradaCarga,
  type Ponto,
} from './regras';
import type { Fase, SessaoTreino, SerieRegistrada } from './types';

const INICIO = '2026-01-05'; // segunda-feira
const fase = (id: string) => P.fases.find((f) => f.id === id) as Fase;

let seq = 0;
function sessao(p: Partial<SessaoTreino> & { data: string }): SessaoTreino {
  return {
    id: `s${seq++}`,
    semana: 1,
    faseId: 'f1',
    treino: 'A',
    aquecimentoFeito: true,
    series: [],
    finalizada: true,
    iniciadaEm: seq,
    ...p,
  };
}
const series = (id: string, n: number, s: Omit<SerieRegistrada, 'exercicioId' | 'ordem'>) =>
  Array.from({ length: n }, (_, i) => ({ exercicioId: id, ordem: i + 1, ...s }));

describe('semana e fase', () => {
  it('calcula a semana a partir da data de início', () => {
    expect(diaDaSemana(INICIO)).toBe('seg');
    expect(semanaDoPrograma(INICIO, INICIO)).toBe(1);
    expect(semanaDoPrograma(INICIO, '2026-01-11')).toBe(1);
    expect(semanaDoPrograma(INICIO, '2026-01-12')).toBe(2);
    expect(semanaDoPrograma(INICIO, somarDias(INICIO, 7 * 25))).toBe(26);
    expect(semanaDoPrograma(INICIO, '2026-01-01')).toBe(0);
  });

  it('limita a semana entre 1 e 26', () => {
    expect(semanaAtual(INICIO, '2025-12-01')).toBe(1);
    expect(semanaAtual(INICIO, somarDias(INICIO, 7 * 40))).toBe(26);
  });

  it('encontra a fase de cada semana', () => {
    const esperado: Record<number, string> = {
      1: 'f1', 4: 'f1', 5: 'f2a', 8: 'f2a', 9: 'f2b', 12: 'f2b', 13: 'd1', 14: 'f3a', 17: 'f3a',
      18: 'f3b', 20: 'f3b', 21: 'd2', 22: 'f4', 25: 'f4', 26: 'r',
    };
    for (const [s, id] of Object.entries(esperado)) expect(faseDaSemana(P.fases, Number(s)).id).toBe(id);
  });

  it('treino do dia segue a agenda de 5 ou 4 dias', () => {
    expect(treinoDoDia(P.agendaSemanal, 5, '2026-01-05')).toBe('A');
    expect(treinoDoDia(P.agendaSemanal, 5, '2026-01-07')).toBe('C');
    expect(treinoDoDia(P.agendaSemanal, 5, '2026-01-09')).toBe('E');
    expect(treinoDoDia(P.agendaSemanal, 5, '2026-01-10')).toBeNull();
    expect(treinoDoDia(P.agendaSemanal, 4, '2026-01-07')).toBeNull();
    expect(treinoDoDia(P.agendaSemanal, 4, '2026-01-08')).toBe('C');
  });

  it('extrai o RIR mínimo da fase', () => {
    expect(rirMinimo('3')).toBe(3);
    expect(rirMinimo('1-2')).toBe(1);
    expect(rirMinimo('0-1 (isolados)')).toBe(0);
    expect(rirMinimo(null)).toBe(0);
  });
});

describe('séries e reps por fase', () => {
  const ex = (treino: 'A' | 'B' | 'C' | 'D' | 'E', semana: number, id: string, extra = {}) =>
    montarTreino(P, treino, { semana, fase: faseDaSemana(P.fases, semana), ...extra }).find(
      (p) => (p.original ?? p.exercicio).id === id,
    )!;

  it('usa os valores base na fase 1', () => {
    const p = ex('A', 1, 'supino_reto_halter_neutro');
    expect(p.series).toBe(4);
    expect(p.faixa).toEqual([6, 8]);
    expect(p.descansoSeg).toEqual([120, 180]);
    expect(p.fatorCarga).toBe(1);
  });

  it('aplica o esquema de força nos exercícios forcaFase3', () => {
    const p = ex('A', 14, 'supino_reto_halter_neutro');
    expect(p.series).toBe(5);
    expect(p.faixa).toEqual([4, 6]);
    expect(p.descansoSeg).toEqual([180, 180]);
    expect(ex('A', 18, 'supino_reto_halter_neutro').faixa).toEqual([3, 5]);
    // Remada não é forcaFase3: mantém base.
    expect(ex('A', 14, 'remada_baixa_triangulo').faixa).toEqual([8, 10]);
    // Puxada no treino D não tem forcaFase3.
    expect(ex('D', 14, 'puxada_frente_aberta').series).toBe(4);
    expect(ex('D', 14, 'puxada_frente_aberta').faixa).toEqual([8, 10]);
  });

  it('soma 1 série nos grupos-alvo da fase 2B', () => {
    expect(ex('A', 9, 'puxada_frente_aberta').series).toBe(5);
    expect(ex('E', 9, 'elevacao_lateral_halter').series).toBe(5);
    expect(ex('C', 9, 'peito_superior').series).toBe(5);
    expect(ex('A', 9, 'remada_baixa_triangulo').series).toBe(3);
  });

  it('corta séries pela metade (arredonda para cima) e carga a 80% no deload', () => {
    const p = ex('A', 13, 'remada_baixa_triangulo');
    expect(p.series).toBe(2); // ceil(3 × 0,5)
    expect(p.fatorCarga).toBeCloseTo(0.8);
    expect(ex('A', 21, 'supino_reto_halter_neutro').series).toBe(2);
  });

  it('marca a última série dos isolados na fase 4', () => {
    expect(ex('A', 22, 'rosca_direta_w').tecnicaUltimaSerie).toBe('rest-pause ou drop set');
    expect(ex('E', 22, 'elevacao_lateral_halter').tecnicaUltimaSerie).toBe('drop set');
    expect(ex('A', 22, 'supino_reto_halter_neutro').tecnicaUltimaSerie).toBeUndefined();
    expect(ex('A', 20, 'rosca_direta_w').tecnicaUltimaSerie).toBeUndefined();
  });

  it('descanso de isolados é 60–90 s', () => {
    expect(ex('E', 14, 'rosca_martelo').descansoSeg).toEqual([60, 90]);
  });

  it('dor alta troca exercício sensível pela alternativa e reduz carga', () => {
    const p = ex('E', 5, 'triceps_frances_cabo', { dorAlta: true });
    expect(p.exercicio.id).toBe('triceps_barra_reta');
    expect(p.fatorCarga).toBeCloseTo(0.8);
    const sem = ex('A', 5, 'supino_maquina', { dorAlta: true });
    expect(sem.exercicio.id).toBe('supino_maquina');
    expect(sem.fatorCarga).toBeCloseTo(0.8);
    expect(sem.avisos[0]).toMatch(/reduza/);
  });

  it('substitui o crossover pelo inclinado quando liberado', () => {
    const p = ex('C', 18, 'peito_superior', { substituirInclinado: true });
    expect(p.exercicio.id).toBe('supino_inclinado_halter_neutro');
    expect(p.faixa).toEqual([6, 10]);
    expect(ex('C', 18, 'peito_superior', { substituirInclinado: false }).exercicio.id).toBe('peito_superior');
  });
});

describe('carga sugerida', () => {
  const base = (historico: SessaoTreino[], over: Partial<EntradaCarga> = {}): EntradaCarga => ({
    exercicioId: 'supino_reto_halter_neutro',
    tipo: 'composto',
    topoFaixa: 8,
    unidade: 'reps',
    fatorCarga: 1,
    historico,
    fases: P.fases,
    incrementoKg: { composto: 2.5, isolado: 1 },
    ...over,
  });

  it('sem histórico pede para testar carga', () => {
    const r = cargaSugerida(base([]));
    expect(r.cargaKg).toBeUndefined();
    expect(r.hint).toBe('testar carga');
  });

  it('sobe 2,5 kg no composto quando bateu o topo com o RIR da fase', () => {
    const h = [sessao({ data: '2026-01-05', faseId: 'f1', series: series('supino_reto_halter_neutro', 4, { cargaKg: 30, reps: 8, rir: 3 }) })];
    const r = cargaSugerida(base(h));
    expect(r.motivo).toBe('subir');
    expect(r.cargaKg).toBe(32.5);
  });

  it('sobe 1 kg no isolado', () => {
    const h = [sessao({ data: '2026-01-05', series: series('rosca_direta_w', 3, { cargaKg: 20, reps: 10, rir: 3 }) })];
    expect(cargaSugerida(base(h, { exercicioId: 'rosca_direta_w', tipo: 'isolado', topoFaixa: 10 })).cargaKg).toBe(21);
  });

  it('repete a carga se alguma série ficou abaixo do topo', () => {
    const s = series('supino_reto_halter_neutro', 4, { cargaKg: 30, reps: 8, rir: 3 });
    s[3].reps = 7;
    const r = cargaSugerida(base([sessao({ data: '2026-01-05', series: s })]));
    expect(r.motivo).toBe('repetir');
    expect(r.cargaKg).toBe(30);
  });

  it('repete a carga se o RIR ficou abaixo do mínimo da fase', () => {
    const h = [sessao({ data: '2026-01-05', faseId: 'f1', series: series('supino_reto_halter_neutro', 4, { cargaKg: 30, reps: 8, rir: 1 }) })];
    expect(cargaSugerida(base(h)).motivo).toBe('repetir');
  });

  it('usa a última sessão (id compartilhado entre treinos)', () => {
    const h = [
      sessao({ data: '2026-01-05', treino: 'A', series: series('puxada_frente_aberta', 4, { cargaKg: 50, reps: 8, rir: 3 }) }),
      sessao({ data: '2026-01-08', treino: 'D', series: series('puxada_frente_aberta', 4, { cargaKg: 52.5, reps: 9, rir: 3 }) }),
    ];
    const r = cargaSugerida(base(h, { exercicioId: 'puxada_frente_aberta', topoFaixa: 10 }));
    expect(r.ultimaCargaKg).toBe(52.5);
    expect(r.cargaKg).toBe(52.5);
  });

  it('respeita o deload (80%, sem progressão)', () => {
    const h = [sessao({ data: '2026-03-23', faseId: 'f2b', series: series('supino_reto_halter_neutro', 4, { cargaKg: 40, reps: 8, rir: 2 }) })];
    const r = cargaSugerida(base(h, { fatorCarga: 0.8 }));
    expect(r.cargaKg).toBe(32);
  });

  it('ignora a sessão de deload como base depois do deload', () => {
    const h = [
      sessao({ data: '2026-03-23', faseId: 'f2b', series: series('supino_reto_halter_neutro', 4, { cargaKg: 40, reps: 7, rir: 2 }) }),
      sessao({ data: '2026-03-30', faseId: 'd1', series: series('supino_reto_halter_neutro', 2, { cargaKg: 32, reps: 8, rir: 4 }) }),
    ];
    expect(cargaSugerida(base(h)).cargaKg).toBe(40);
  });

  it('arredonda para 0,5 kg', () => {
    const h = [sessao({ data: '2026-01-05', series: series('supino_reto_halter_neutro', 4, { cargaKg: 27, reps: 6, rir: 3 }) })];
    expect(cargaSugerida(base(h, { fatorCarga: 0.8 })).cargaKg).toBe(21.5);
  });
});

describe('regra do supino inclinado', () => {
  const HOJE = somarDias(INICIO, 7 * 17); // semana 18

  it('não libera antes da semana 18', () => {
    expect(avaliarInclinado(17, [], HOJE).substituir).toBe(false);
  });

  it('libera com dor ≤ 2 em todos os treinos das últimas 4 semanas', () => {
    const s = [1, 2, 0, 2].map((dor, i) => sessao({ data: somarDias(HOJE, -i * 6), dorOmbro: dor }));
    expect(avaliarInclinado(18, s, HOJE).substituir).toBe(true);
  });

  it('mantém o crossover e explica o motivo se houve dor > 2', () => {
    const s = [1, 3, 0].map((dor, i) => sessao({ data: somarDias(HOJE, -i * 7), dorOmbro: dor }));
    const r = avaliarInclinado(18, s, HOJE);
    expect(r.substituir).toBe(false);
    expect(r.motivo).toMatch(/Dor 3\/10/);
  });

  it('ignora dores fora da janela de 4 semanas', () => {
    const s = [sessao({ data: somarDias(HOJE, -40), dorOmbro: 6 }), sessao({ data: somarDias(HOJE, -3), dorOmbro: 1 })];
    expect(avaliarInclinado(18, s, HOJE).substituir).toBe(true);
  });

  it('sem registros de dor não libera', () => {
    expect(avaliarInclinado(19, [], HOJE).substituir).toBe(false);
  });
});

describe('dor no ombro', () => {
  it('alerta quando a última dor > 3', () => {
    const s = [sessao({ data: '2026-01-05', dorOmbro: 1 }), sessao({ data: '2026-01-07', dorOmbro: 4 })];
    expect(statusDor(s)).toMatchObject({ ultima: 4, alerta: true, procurarMedico: false });
  });

  it('recomenda médico após 3 treinos seguidos com dor > 3', () => {
    const s = [4, 5, 6].map((d, i) => sessao({ data: somarDias('2026-01-05', i), dorOmbro: d }));
    expect(statusDor(s).procurarMedico).toBe(true);
    s.push(sessao({ data: '2026-01-09', dorOmbro: 2 }));
    expect(statusDor(s)).toMatchObject({ alerta: false, procurarMedico: false });
  });
});

describe('ajuste calórico', () => {
  const regras = P.regras.ajusteCalorico;
  // Gera um peso por dia, de forma linear, a partir de `ini` kg.
  const pesosLineares = (semanas: number, ini: number, porSemana: number): Ponto[] =>
    Array.from({ length: semanas * 7 }, (_, d) => ({ data: somarDias(INICIO, d), valor: ini - (porSemana / 7) * d }));

  it('só avalia nas semanas 3, 5, 7…', () => {
    const r = avaliarAjusteCalorico({ semana: 4, inicio: INICIO, fase: fase('f1'), pesos: pesosLineares(3, 93, 1), cinturas: [], regras });
    expect(r).toBeNull();
  });

  it('sugere +150 kcal com queda > 0,7 kg/semana', () => {
    const r = avaliarAjusteCalorico({ semana: 5, inicio: INICIO, fase: fase('f2a'), pesos: pesosLineares(4, 93, 1), cinturas: [], regras });
    expect(r?.sugestao).toBe('subir');
    expect(r?.detalhe).toMatch(/\+150 kcal/);
  });

  it('não sugere nada com queda dentro do ritmo', () => {
    const r = avaliarAjusteCalorico({ semana: 5, inicio: INICIO, fase: fase('f2a'), pesos: pesosLineares(4, 93, 0.4), cinturas: [], regras });
    expect(r).toBeNull();
  });

  it('sugere −150 kcal ou +2000 passos com peso e cintura estáveis em f1/f2a/f2b', () => {
    const cinturas = [
      { data: somarDias(INICIO, 7), valor: 100 },
      { data: somarDias(INICIO, 20), valor: 100.2 },
    ];
    const r = avaliarAjusteCalorico({ semana: 5, inicio: INICIO, fase: fase('f2a'), pesos: pesosLineares(4, 93, 0.05), cinturas, regras });
    expect(r?.sugestao).toBe('baixar');
    expect(r?.detalhe).toMatch(/2000 passos/);
  });

  it('não sugere baixar se a cintura caiu', () => {
    const cinturas = [
      { data: somarDias(INICIO, 7), valor: 101 },
      { data: somarDias(INICIO, 20), valor: 100 },
    ];
    const r = avaliarAjusteCalorico({ semana: 5, inicio: INICIO, fase: fase('f2a'), pesos: pesosLineares(4, 93, 0.05), cinturas, regras });
    expect(r).toBeNull();
  });

  it('não sugere baixar fora de f1/f2a/f2b', () => {
    const cinturas = [
      { data: somarDias(INICIO, 7 * 14), valor: 95 },
      { data: somarDias(INICIO, 7 * 16), valor: 95 },
    ];
    const pesos = Array.from({ length: 28 }, (_, d) => ({ data: somarDias(INICIO, 7 * 13 + d), valor: 91 }));
    const r = avaliarAjusteCalorico({ semana: 17, inicio: INICIO, fase: fase('f3a'), pesos, cinturas, regras });
    expect(r).toBeNull();
  });
});

describe('médias, aderência e semana 26', () => {
  it('média móvel de 7 dias', () => {
    const p = [1, 2, 3, 4, 5, 6, 7, 8].map((v, i) => ({ data: somarDias(INICIO, i), valor: v }));
    const mm = mediaMovel(p, 7);
    expect(mm[0].valor).toBe(1);
    expect(mm[6].valor).toBe(4);
    expect(mm[7].valor).toBe(5);
  });

  it('aderência conta sessões finalizadas por semana', () => {
    const s = [sessao({ data: INICIO }), sessao({ data: somarDias(INICIO, 1) }), sessao({ data: somarDias(INICIO, 8), finalizada: false })];
    const a = aderenciaSemanal(s, INICIO, 2, 5);
    expect(a[0]).toMatchObject({ feitos: 2, pct: 40 });
    expect(a[1]).toMatchObject({ feitos: 0, pct: 0 });
  });

  it('resumo final decide pelo % de gordura', () => {
    const medidas = [
      { id: '1', data: INICIO, tipo: 'gorduraPct' as const, valor: 30 },
      { id: '2', data: somarDias(INICIO, 175), tipo: 'gorduraPct' as const, valor: 19.5 },
    ];
    const s = [
      sessao({ data: INICIO, series: series('leg_press', 3, { cargaKg: 100, reps: 10 }) }),
      sessao({ data: somarDias(INICIO, 170), series: series('leg_press', 3, { cargaKg: 160, reps: 10 }) }),
    ];
    const r = resumoSemana26(P, medidas, s);
    expect(r.decisao).toBe(P.regras.decisaoSemana26.entao);
    expect(r.cargas[0]).toMatchObject({ exercicioId: 'leg_press', inicio: 100, fim: 160 });
    medidas[1].valor = 22;
    expect(resumoSemana26(P, medidas, s).decisao).toBe(P.regras.decisaoSemana26.senao);
  });
});
