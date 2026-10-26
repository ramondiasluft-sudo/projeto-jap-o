import { describe, expect, it } from 'vitest';
import {
  alongamentosDoTreino,
  circunferencias,
  medidasDaAvaliacaoInicial,
  metaDaMedida,
  proporcoes,
  resumoMedida,
} from './medidas';
import { protocolo as P } from './protocolo';
import { montarTreino, faseDaSemana } from './regras';
import type { Medida } from './types';

const base = medidasDaAvaliacaoInicial(P.avaliacaoInicial);

describe('avaliação inicial como linha de base', () => {
  it('gera um registro por medida, com a data da avaliação', () => {
    const porTipo = Object.fromEntries(base.map((m) => [m.tipo, m]));
    expect(porTipo.peso).toMatchObject({ id: 'base-peso', valor: 93, data: '2026-10-26' });
    expect(porTipo.gorduraPct.valor).toBe(30);
    expect(porTipo.cintura.valor).toBe(93);
    expect(porTipo.ombro.valor).toBe(125);
    expect(porTipo.panturrilhaDir.valor).toBe(43);
    expect(base).toHaveLength(13); // 11 circunferências + peso + gordura
  });

  it('sem avaliação no JSON não gera nada', () => {
    expect(medidasDaAvaliacaoInicial(undefined)).toEqual([]);
  });
});

describe('resumo de cada medida', () => {
  it('mostra atual, variação desde a base e meta', () => {
    const m: Medida[] = [...base, { id: 'x', data: '2026-11-23', tipo: 'cintura', valor: 90.5 }];
    const r = resumoMedida(P, m, 'cintura');
    expect(r).toMatchObject({ atual: 90.5, base: 93, variacao: -2.5, meta: [85, 87], faltaParaMeta: -3.5 });
  });

  it('linha de base vence outro registro do mesmo dia', () => {
    const m: Medida[] = [{ id: 'y', data: '2026-10-26', tipo: 'peso', valor: 94 }, ...base];
    const r = resumoMedida(P, m, 'peso');
    expect(r.base).toBe(93);
    expect(r.atualEhBase).toBe(false);
  });

  it('medida nova no mesmo dia da avaliação já conta na variação', () => {
    const m: Medida[] = [...base, { id: 'n', data: '2026-10-26', tipo: 'cintura', valor: 91 }];
    expect(resumoMedida(P, m, 'cintura')).toMatchObject({ atual: 91, variacao: -2, atualEhBase: false });
    expect(resumoMedida(P, base, 'cintura').atualEhBase).toBe(true);
  });

  it('dentro da meta não falta nada', () => {
    const m: Medida[] = [...base, { id: 'z', data: '2027-04-01', tipo: 'ombro', valor: 129 }];
    expect(resumoMedida(P, m, 'ombro').faltaParaMeta).toBe(0);
  });

  it('braço esquerdo e direito usam a meta de braço; coxa não tem meta', () => {
    expect(metaDaMedida(P, 'bracoEsq')).toEqual([40, 41]);
    expect(metaDaMedida(P, 'bracoDir')).toEqual([40, 41]);
    expect(metaDaMedida(P, 'coxaEsq')).toBeUndefined();
  });

  it('sem registros devolve só a meta', () => {
    expect(resumoMedida(P, [], 'barriga')).toEqual({ tipo: 'barriga', meta: [87, 89] });
  });
});

describe('proporções', () => {
  it('bate com a avaliação inicial (1,34 e 0,51)', () => {
    const r = proporcoes(P, base);
    expect(r.ombroCintura).toBe(1.34);
    expect(r.cinturaAltura).toBe(0.51);
    expect(r.metaOmbroCintura).toBe(1.51);
    expect(r.metaCinturaAltura).toBe(0.47);
  });

  it('usa as últimas medidas', () => {
    const m: Medida[] = [
      ...base,
      { id: 'a', data: '2027-04-01', tipo: 'ombro', valor: 129 },
      { id: 'b', data: '2027-04-01', tipo: 'cintura', valor: 85 },
    ];
    expect(proporcoes(P, m)).toMatchObject({ ombroCintura: 1.52, cinturaAltura: 0.47 });
  });
});

describe('treinos v2', () => {
  it('B tem aquecimento de extensora e troca prancha por dead bug', () => {
    expect(P.treinos.B.aquecimento?.[0].id).toBe('cadeira_extensora_aquec');
    const ids = P.treinos.B.exercicios.map((e) => e.id);
    expect(ids).toContain('elevacao_pelvica');
    expect(ids).toContain('dead_bug');
    expect(ids).not.toContain('prancha');
    expect(ids).not.toContain('cadeira_extensora');
    const db = montarTreino(P, 'B', { semana: 1, fase: faseDaSemana(P.fases, 1) }).find((p) => p.exercicio.id === 'dead_bug')!;
    expect(db.series).toBe(3);
    expect(db.faixa).toEqual([8, 8]);
  });

  it('alongamentos de correção postural por treino', () => {
    expect(alongamentosDoTreino(P, 'A').map((a) => a.id)).toEqual(['along_peitoral']);
    expect(alongamentosDoTreino(P, 'B').map((a) => a.id)).toEqual(['along_flexor_quadril']);
    expect(alongamentosDoTreino(P, 'E')).toEqual([]);
  });

  it('lista de circunferências vem do monitoramento', () => {
    expect(circunferencias(P)).toEqual(['ombro', 'peito', 'bracoEsq', 'bracoDir', 'barriga', 'quadril', 'coxaEsq', 'coxaDir', 'panturrilhaEsq', 'panturrilhaDir']);
  });
});
