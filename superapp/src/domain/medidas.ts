// Regras das medidas corporais (v2): linha de base, variação, metas e proporções.
// Funções puras, testadas em medidas.test.ts.

import type { Alongamento, AvaliacaoInicial, Medida, Protocolo, TipoMedida, TreinoId } from './types';

export const NOME_MEDIDA: Record<TipoMedida, string> = {
  peso: 'Peso',
  cintura: 'Cintura',
  barriga: 'Barriga',
  peito: 'Peito',
  quadril: 'Quadril',
  ombro: 'Ombro',
  bracoEsq: 'Braço esq.',
  bracoDir: 'Braço dir.',
  coxaEsq: 'Coxa esq.',
  coxaDir: 'Coxa dir.',
  panturrilhaEsq: 'Panturrilha esq.',
  panturrilhaDir: 'Panturrilha dir.',
  passos: 'Passos',
  sono: 'Sono',
  gorduraPct: '% gordura',
  massaMagraKg: 'Massa magra',
};

export const UNIDADE_MEDIDA: Record<TipoMedida, string> = {
  peso: 'kg', cintura: 'cm', barriga: 'cm', peito: 'cm', quadril: 'cm', ombro: 'cm',
  bracoEsq: 'cm', bracoDir: 'cm', coxaEsq: 'cm', coxaDir: 'cm', panturrilhaEsq: 'cm', panturrilhaDir: 'cm',
  passos: 'passos', sono: 'h', gorduraPct: '%', massaMagraKg: 'kg',
};

/** Chave em `metas.seisMeses` para cada medida (braço esq./dir. usam a mesma). */
const CHAVE_META: Partial<Record<TipoMedida, string>> = {
  peso: 'pesoKg',
  gorduraPct: 'gorduraPct',
  massaMagraKg: 'massaMagraKg',
  cintura: 'cinturaCm',
  barriga: 'barrigaCm',
  ombro: 'ombroCm',
  peito: 'peitoCm',
  bracoEsq: 'bracoCm',
  bracoDir: 'bracoCm',
  quadril: 'quadrilCm',
};

export const PREFIXO_BASE = 'base-';

/** Converte a avaliação inicial do JSON em registros de medida (linha de base). */
export function medidasDaAvaliacaoInicial(av: AvaliacaoInicial | undefined): Medida[] {
  if (!av) return [];
  const out: Medida[] = [];
  const add = (tipo: TipoMedida, valor: number | undefined) => {
    if (typeof valor === 'number') out.push({ id: `${PREFIXO_BASE}${tipo}`, data: av.data, tipo, valor });
  };
  add('peso', av.pesoKg);
  add('gorduraPct', av.gorduraBioPct);
  for (const [tipo, valor] of Object.entries(av.medidasCm)) add(tipo as TipoMedida, valor);
  return out;
}

export function metaDaMedida(p: Protocolo, tipo: TipoMedida): [number, number] | undefined {
  const chave = CHAVE_META[tipo];
  const v = chave ? p.meta.metas.seisMeses?.[chave] : undefined;
  if (Array.isArray(v) && v.length === 2) return [v[0], v[1]];
  if (typeof v === 'number') return [v, v];
  return undefined;
}

function porData(a: Medida, b: Medida): number {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  // No mesmo dia, a linha de base vem antes de qualquer outro registro.
  const ba = a.id.startsWith(PREFIXO_BASE) ? 0 : 1;
  const bb = b.id.startsWith(PREFIXO_BASE) ? 0 : 1;
  return ba - bb;
}

export interface ResumoMedida {
  tipo: TipoMedida;
  atual?: number;
  dataAtual?: string;
  base?: number;
  dataBase?: string;
  /** atual − base */
  variacao?: number;
  /** O registro atual é a própria linha de base (ainda não há medida nova). */
  atualEhBase?: boolean;
  meta?: [number, number];
  /** Quanto falta (com sinal) para entrar na faixa da meta; 0 se já está dentro. */
  faltaParaMeta?: number;
}

export function resumoMedida(p: Protocolo, medidas: Medida[], tipo: TipoMedida): ResumoMedida {
  const v = medidas.filter((m) => m.tipo === tipo).sort(porData);
  const meta = metaDaMedida(p, tipo);
  if (!v.length) return { tipo, meta };
  const base = v.find((m) => m.id.startsWith(PREFIXO_BASE)) ?? v[0];
  const atual = v[v.length - 1];
  let faltaParaMeta: number | undefined;
  if (meta) {
    faltaParaMeta = atual.valor < meta[0] ? meta[0] - atual.valor : atual.valor > meta[1] ? meta[1] - atual.valor : 0;
  }
  return {
    tipo,
    atual: atual.valor,
    dataAtual: atual.data,
    base: base.valor,
    dataBase: base.data,
    variacao: Math.round((atual.valor - base.valor) * 100) / 100,
    atualEhBase: atual.id === base.id,
    meta,
    faltaParaMeta,
  };
}

export interface Proporcoes {
  ombroCintura?: number;
  cinturaAltura?: number;
  metaOmbroCintura?: number;
  metaCinturaAltura?: number;
}

const ultima = (medidas: Medida[], tipo: TipoMedida) =>
  medidas.filter((m) => m.tipo === tipo).sort(porData).pop()?.valor;
const duasCasas = (n: number) => Math.round(n * 100) / 100;

/** Ombro ÷ cintura e cintura ÷ altura, com as últimas medidas de cada uma. */
export function proporcoes(p: Protocolo, medidas: Medida[]): Proporcoes {
  const ombro = ultima(medidas, 'ombro');
  const cintura = ultima(medidas, 'cintura');
  const altura = p.meta.atleta.alturaCm;
  const metas = p.meta.metas.seisMeses ?? {};
  const num = (x: unknown) => (typeof x === 'number' ? x : undefined);
  return {
    ombroCintura: ombro && cintura ? duasCasas(ombro / cintura) : undefined,
    cinturaAltura: cintura && altura ? duasCasas(cintura / altura) : undefined,
    metaOmbroCintura: num(metas.ombroCinturaRazao),
    metaCinturaAltura: num(metas.cinturaAlturaRazao),
  };
}

export function alongamentosDoTreino(p: Protocolo, treino: TreinoId): Alongamento[] {
  return (p.correcaoPostural ?? []).filter((a) => a.aplicaEm.includes(treino));
}

export function circunferencias(p: Protocolo): TipoMedida[] {
  return p.monitoramento.find((m) => m.id === 'circunferencias')?.itens ?? [];
}
