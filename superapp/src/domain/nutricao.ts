// Regras da nutrição: opção escolhida em cada refeição, refeição montada e somas.

import type { Alimento, DiaNutricao, ItemRefeicao, Macros, OpcaoRefeicao, Refeicao } from './types';

/** Valor de `opcoes[i]` que indica refeição montada (o que foi comido de fato). */
export const OPCAO_LIVRE = -2;

/** -1 (ou vazio) = dia exemplo; 0..n = alternativa. */
export function opcaoDaRefeicao(r: Refeicao, indice: number | null | undefined): OpcaoRefeicao {
  if (indice === null || indice === undefined || indice < 0) return r;
  return r.alternativas?.[indice] ?? r;
}

const umaCasa = (n: number) => Math.round(n * 10) / 10;

/** Macros de `gramas` de um alimento da tabela (valores por 100 g). */
export function itemDeAlimento(a: Alimento, gramas: number): ItemRefeicao {
  const k = gramas / 100;
  return {
    alimentoId: a.id,
    nome: a.nome,
    gramas,
    kcal: Math.round(a.por100g.kcal * k),
    p: umaCasa(a.por100g.p * k),
    c: umaCasa(a.por100g.c * k),
    g: umaCasa(a.por100g.g * k),
  };
}

export function somarItens(itens: Macros[]): Macros {
  const t = itens.reduce((s, i) => ({ kcal: s.kcal + i.kcal, p: s.p + i.p, c: s.c + i.c, g: s.g + i.g }), { kcal: 0, p: 0, c: 0, g: 0 });
  return { kcal: Math.round(t.kcal), p: umaCasa(t.p), c: umaCasa(t.c), g: umaCasa(t.g) };
}

type DiaParcial = Pick<DiaNutricao, 'refeicoes' | 'opcoes' | 'livres'>;

/** Itens da refeição montada, se for essa a opção escolhida. */
export function livreDaRefeicao(dia: DiaParcial | undefined, i: number): ItemRefeicao[] | undefined {
  if (dia?.opcoes?.[i] !== OPCAO_LIVRE) return undefined;
  return dia.livres?.[i] ?? undefined;
}

/** Proteína da refeição i pela opção escolhida (montada, alternativa ou plano). */
export function proteinaDaRefeicao(r: Refeicao, i: number, dia: DiaParcial | undefined): number {
  const livre = livreDaRefeicao(dia, i);
  return livre ? somarItens(livre).p : opcaoDaRefeicao(r, dia?.opcoes?.[i]).proteinaG;
}

/** Proteína estimada das refeições marcadas como feitas. */
export function proteinaDasRefeicoes(refeicoes: Refeicao[], dia: DiaParcial | undefined): number {
  if (!dia?.refeicoes) return 0;
  const total = refeicoes.reduce((soma, r, i) => (dia.refeicoes?.[i] ? soma + proteinaDaRefeicao(r, i, dia) : soma), 0);
  return Math.round(total);
}
