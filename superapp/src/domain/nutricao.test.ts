import { describe, expect, it } from 'vitest';
import { itemDeAlimento, OPCAO_LIVRE, opcaoDaRefeicao, proteinaDasRefeicoes, somarItens } from './nutricao';
import { protocolo as P } from './protocolo';

const R = P.nutricao.diaExemplo;
const alimento = (id: string) => P.nutricao.alimentos!.find((a) => a.id === id)!;

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

describe('refeição montada', () => {
  it('calcula macros pelas gramas', () => {
    expect(itemDeAlimento(alimento('frango_peito'), 150)).toMatchObject({ kcal: 239, p: 48, c: 0, g: 3.8, gramas: 150 });
    expect(itemDeAlimento(alimento('arroz_branco'), 80)).toMatchObject({ kcal: 102, p: 2, c: 22.5 });
  });

  it('café de 27/10: 80 g de arroz + 150 g de frango', () => {
    const t = somarItens([itemDeAlimento(alimento('arroz_branco'), 80), itemDeAlimento(alimento('frango_peito'), 150)]);
    expect(t).toEqual({ kcal: 341, p: 50, c: 22.5, g: 4 });
  });

  it('almoço do serviço: arroz, feijão, chambaril, empadão e farofa', () => {
    const t = somarItens([
      itemDeAlimento(alimento('arroz_branco'), 225),
      itemDeAlimento(alimento('feijao'), 100),
      itemDeAlimento(alimento('chambaril'), 70),
      itemDeAlimento(alimento('empadao'), 120),
      itemDeAlimento(alimento('farofa'), 30),
    ]);
    expect(t.kcal).toBe(958);
    expect(t.p).toBe(43.6);
  });

  it('refeição montada entra na soma de proteína', () => {
    const livre = [itemDeAlimento(alimento('arroz_branco'), 80), itemDeAlimento(alimento('frango_peito'), 150)];
    const dia = { refeicoes: [true, true, false, false, false], opcoes: [OPCAO_LIVRE, -1], livres: [livre] };
    expect(proteinaDasRefeicoes(R, dia)).toBe(50 + 55);
  });

  it('opção livre sem itens cai no plano', () => {
    expect(proteinaDasRefeicoes(R, { refeicoes: [true], opcoes: [OPCAO_LIVRE], livres: [] })).toBe(28);
  });
});
