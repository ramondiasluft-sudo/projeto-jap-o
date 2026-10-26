import { describe, expect, it } from 'vitest';
import { opcaoDaRefeicao, proteinaDasRefeicoes } from './nutricao';
import { protocolo as P } from './protocolo';

const R = P.nutricao.diaExemplo;

describe('alternativas de refeição', () => {
  it('cada refeição tem pelo menos 5 alternativas', () => {
    for (const r of R) expect(r.alternativas?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('dia exemplo soma ~186 g de proteína (meta da fase 185–190)', () => {
    expect(R.reduce((a, r) => a + r.proteinaG, 0)).toBe(186);
  });

  it('opção -1 ou vazia é o dia exemplo; índice válido é a alternativa', () => {
    expect(opcaoDaRefeicao(R[0], undefined)).toBe(R[0]);
    expect(opcaoDaRefeicao(R[0], -1)).toBe(R[0]);
    expect(opcaoDaRefeicao(R[0], 0).descricao).toMatch(/Crepioca/);
    expect(opcaoDaRefeicao(R[0], 99)).toBe(R[0]);
  });

  it('soma a proteína só das refeições feitas, pela opção escolhida', () => {
    const refeicoes = [true, true, false, false, true];
    const opcoes = [-1, 5, null, null, 3]; // café exemplo (28) + almoço carne de panela (62) + ceia cottage (17)
    expect(proteinaDasRefeicoes(R, { refeicoes, opcoes })).toBe(28 + 62 + 17);
    expect(proteinaDasRefeicoes(R, undefined)).toBe(0);
  });
});
