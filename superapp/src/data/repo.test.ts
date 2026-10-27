import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { criarRepoDexie } from './repo';

describe('repositório (IndexedDB)', () => {
  it('exporta e restaura backup em JSON', async () => {
    const a = criarRepoDexie('teste-a');
    await a.setConfig({ inicio: '2026-01-05', diasPorSemana: 5, ajusteKcal: 150, ajustePassos: 0 });
    await a.putSessao({
      id: 's1', data: '2026-01-05', semana: 1, faseId: 'f1', treino: 'A', aquecimentoFeito: true,
      dorOmbro: 2, finalizada: true, iniciadaEm: 1,
      series: [{ exercicioId: 'supino_reto_halter_neutro', ordem: 1, cargaKg: 30, reps: 8, rir: 3 }],
    });
    await a.putMedida({ id: 'm1', data: '2026-01-05', tipo: 'peso', valor: 93 });
    await a.putNutricao({ data: '2026-01-05', creatina: true, kcal: 2300 });
    await a.putCardio({ id: 'c1', data: '2026-01-05', tipo: 'esteira_caminhada', minutos: 15, km: 1.6, velocidadeKmh: 6, sessaoId: 's1' });

    const json = JSON.parse(JSON.stringify(await a.exportar()));
    const b = criarRepoDexie('teste-b');
    await b.putMedida({ id: 'velho', data: '2025-12-01', tipo: 'peso', valor: 99 });
    await b.importar(json);

    expect(await b.getConfig()).toMatchObject({ inicio: '2026-01-05', ajusteKcal: 150 });
    expect((await b.listSessoes())[0].series[0].cargaKg).toBe(30);
    expect((await b.listMedidas()).map((m) => m.id)).toEqual(['m1']);
    expect((await b.getNutricao('2026-01-05'))?.creatina).toBe(true);
    expect(await b.listCardios()).toEqual([{ id: 'c1', data: '2026-01-05', tipo: 'esteira_caminhada', minutos: 15, km: 1.6, velocidadeKmh: 6, sessaoId: 's1' }]);
  });

  it('updateSessao não perde séries em escritas simultâneas', async () => {
    const r = criarRepoDexie('teste-c');
    await r.putSessao({ id: 's', data: '2026-01-05', semana: 1, faseId: 'f1', treino: 'A', aquecimentoFeito: false, series: [], finalizada: false, iniciadaEm: 1 });
    await Promise.all(
      [1, 2, 3].map((ordem) => r.updateSessao('s', (s) => ({ ...s, series: [...s.series, { exercicioId: 'x', ordem, reps: 8 }] }))),
    );
    expect((await r.listSessoes())[0].series).toHaveLength(3);
  });

  it('rejeita arquivo que não é backup', async () => {
    const r = criarRepoDexie('teste-d');
    await expect(r.importar({} as never)).rejects.toThrow();
  });
});
