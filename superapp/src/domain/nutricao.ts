// Regras da nutrição: opção escolhida em cada refeição e proteína somada.

import type { DiaNutricao, OpcaoRefeicao, Refeicao } from './types';

/** -1 (ou vazio) = dia exemplo; 0..n = alternativa. */
export function opcaoDaRefeicao(r: Refeicao, indice: number | null | undefined): OpcaoRefeicao {
  if (indice === null || indice === undefined || indice < 0) return r;
  return r.alternativas?.[indice] ?? r;
}

/** Proteína estimada das refeições marcadas como feitas, pela opção escolhida em cada uma. */
export function proteinaDasRefeicoes(refeicoes: Refeicao[], dia: Pick<DiaNutricao, 'refeicoes' | 'opcoes'> | undefined): number {
  if (!dia?.refeicoes) return 0;
  return refeicoes.reduce(
    (soma, r, i) => (dia.refeicoes?.[i] ? soma + opcaoDaRefeicao(r, dia.opcoes?.[i]).proteinaG : soma),
    0,
  );
}
