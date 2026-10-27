import { describe, expect, it } from 'vitest';
import { cardioDaSemana, completarCardio } from './cardio';
import { somarDias } from './datas';
import { protocolo as P } from './protocolo';
import { faseDaSemana } from './regras';
import type { Cardio } from './types';

describe('cardio', () => {
  it('calcula a velocidade média a partir de minutos e km', () => {
    expect(completarCardio({ minutos: 15, km: 1.6 })).toMatchObject({ velocidadeKmh: 6.4 });
  });

  it('calcula os km a partir de minutos e velocidade', () => {
    expect(completarCardio({ minutos: 15, velocidadeKmh: 6 })).toMatchObject({ km: 1.5 });
  });

  it('não sobrescreve o que foi digitado (esteira mostra média própria)', () => {
    expect(completarCardio({ minutos: 15, km: 1.6, velocidadeKmh: 6 })).toEqual({ minutos: 15, km: 1.6, velocidadeKmh: 6 });
  });

  it('soma a semana e conta sessões que atingem os minutos da meta', () => {
    const inicio = '2026-10-26';
    const c = (d: number, minutos: number): Cardio => ({ id: String(d), data: somarDias(inicio, 7 * 4 + d), tipo: 'bike', minutos });
    const fase = faseDaSemana(P.fases, 5); // f2a: 2× 20 min
    const r = cardioDaSemana([c(0, 15), c(2, 25), c(-3, 30)], inicio, 5, fase);
    expect(r).toMatchObject({ sessoes: 2, minutos: 40, validas: 1, meta: { sessoes: 2, minutos: 20 } });
  });

  it('protocolo tem pelo menos 5 opções de cardio', () => {
    expect(P.cardio?.opcoes.length).toBeGreaterThanOrEqual(5);
  });
});
