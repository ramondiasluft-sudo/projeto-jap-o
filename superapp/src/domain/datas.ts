import type { DiaSemana } from './types';

// Datas são strings YYYY-MM-DD no fuso local. Toda a aritmética é feita em UTC
// para não sofrer com horário de verão.

const DIA_MS = 86_400_000;

export function paraDias(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DIA_MS);
}

export function deDias(dias: number): string {
  const dt = new Date(dias * DIA_MS);
  return dt.toISOString().slice(0, 10);
}

export function hojeISO(agora: Date = new Date()): string {
  const y = agora.getFullYear();
  const m = String(agora.getMonth() + 1).padStart(2, '0');
  const d = String(agora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function somarDias(iso: string, n: number): string {
  return deDias(paraDias(iso) + n);
}

export function diffDias(a: string, b: string): number {
  return paraDias(a) - paraDias(b);
}

const DIAS: DiaSemana[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

export function diaDaSemana(iso: string): DiaSemana {
  // 1970-01-01 foi quinta-feira (índice 4).
  const idx = (((paraDias(iso) + 4) % 7) + 7) % 7;
  return DIAS[idx];
}

export function formatarData(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
