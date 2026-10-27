// Regras do cardio: completa km/velocidade e soma a semana contra a meta da fase.

import { intervaloDaSemana } from './regras';
import type { Cardio, Fase } from './types';

const umaCasa = (n: number) => Math.round(n * 10) / 10;
const duasCasas = (n: number) => Math.round(n * 100) / 100;

/**
 * Completa o que faltar: com minutos e km calcula a velocidade média; com minutos e
 * velocidade calcula os km. O que o usuário digitou nunca é sobrescrito.
 */
export function completarCardio<T extends Pick<Cardio, 'minutos' | 'km' | 'velocidadeKmh'>>(c: T): T {
  const horas = c.minutos / 60;
  if (!(horas > 0)) return c;
  if (c.km !== undefined && c.velocidadeKmh === undefined) return { ...c, velocidadeKmh: umaCasa(c.km / horas) };
  if (c.velocidadeKmh !== undefined && c.km === undefined) return { ...c, km: duasCasas(c.velocidadeKmh * horas) };
  return c;
}

export interface CardioSemana {
  sessoes: number;
  minutos: number;
  /** Sessões com pelo menos os minutos da meta. */
  validas: number;
  meta: Fase['cardio'];
}

export function cardioDaSemana(cardios: Cardio[], inicio: string, semana: number, fase: Fase): CardioSemana {
  const [a, b] = intervaloDaSemana(inicio, semana);
  const da = cardios.filter((c) => c.data >= a && c.data <= b);
  const minMeta = fase.cardio?.minutos ?? 0;
  return {
    sessoes: da.length,
    minutos: da.reduce((s, c) => s + c.minutos, 0),
    validas: da.filter((c) => c.minutos >= minMeta).length,
    meta: fase.cardio,
  };
}
