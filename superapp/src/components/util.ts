import { repo, novoId } from '../data/repo';
import type { TipoMedida } from '../domain/types';

export function fmt(n: number | undefined, casas = 1): string {
  if (n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 });
}

/** Lê número digitado com vírgula ou ponto. */
export function lerNumero(s: string): number | undefined {
  if (s.trim() === '') return undefined;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Medidas diárias (passos, sono) têm um registro por dia: id fixo por tipo+data. */
export async function salvarMedidaDiaria(tipo: TipoMedida, data: string, valor: number | undefined) {
  const id = `${tipo}-${data}`;
  if (valor === undefined) await repo.deleteMedida(id);
  else await repo.putMedida({ id, tipo, data, valor });
}

export async function salvarMedida(tipo: TipoMedida, data: string, valor: number) {
  await repo.putMedida({ id: novoId(), tipo, data, valor });
}

export function mmss(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
