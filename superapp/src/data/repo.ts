// Camada de dados. A UI só conhece a interface `Repo`; a implementação atual usa
// IndexedDB (Dexie). Para plugar Supabase/Firebase, basta outra implementação.

import Dexie, { type Table } from 'dexie';
import type { Config, DecisaoAjuste, DiaNutricao, Foto, Medida, SessaoTreino, TipoMedida } from '../domain/types';

export interface Backup {
  app: 'superapp';
  versao: 1;
  exportadoEm: string;
  config?: Config;
  sessoes: SessaoTreino[];
  medidas: Medida[];
  nutricao: DiaNutricao[];
  decisoes: DecisaoAjuste[];
  fotos: (Omit<Foto, 'blob'> & { dataUrl: string })[];
}

export interface Repo {
  getConfig(): Promise<Config | undefined>;
  setConfig(c: Config): Promise<void>;

  listSessoes(): Promise<SessaoTreino[]>;
  putSessao(s: SessaoTreino): Promise<void>;
  /** Lê e grava a sessão numa transação, para escritas rápidas não se sobreporem. */
  updateSessao(id: string, fn: (s: SessaoTreino) => SessaoTreino): Promise<void>;
  deleteSessao(id: string): Promise<void>;

  listMedidas(tipo?: TipoMedida): Promise<Medida[]>;
  putMedida(m: Medida): Promise<void>;
  deleteMedida(id: string): Promise<void>;

  listFotos(): Promise<Foto[]>;
  putFoto(f: Foto): Promise<void>;
  deleteFoto(id: string): Promise<void>;

  getNutricao(data: string): Promise<DiaNutricao | undefined>;
  listNutricao(): Promise<DiaNutricao[]>;
  putNutricao(n: DiaNutricao): Promise<void>;

  listDecisoes(): Promise<DecisaoAjuste[]>;
  putDecisao(d: DecisaoAjuste): Promise<void>;

  exportar(): Promise<Backup>;
  importar(b: Backup): Promise<void>;

  /** Notifica a cada escrita. Retorna função para cancelar. */
  subscribe(cb: () => void): () => void;
}

class Banco extends Dexie {
  config!: Table<Config & { chave: string }, string>;
  sessoes!: Table<SessaoTreino, string>;
  medidas!: Table<Medida, string>;
  fotos!: Table<Foto, string>;
  nutricao!: Table<DiaNutricao, string>;
  decisoes!: Table<DecisaoAjuste, string>;

  constructor(nome: string) {
    super(nome);
    this.version(1).stores({
      config: 'chave',
      sessoes: 'id, data, treino',
      medidas: 'id, data, tipo',
      fotos: 'id, data',
      nutricao: 'data',
      decisoes: 'id',
    });
  }
}

function blobParaDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(r.result as string);
    r.onerror = () => erro(r.error);
    r.readAsDataURL(b);
  });
}

async function dataUrlParaBlob(u: string): Promise<Blob> {
  const [cab, dados] = u.split(',');
  const mime = cab.match(/data:(.*?);/)?.[1] ?? 'image/jpeg';
  const bin = atob(dados);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function criarRepoDexie(nome = 'superapp'): Repo {
  const db = new Banco(nome);
  const ouvintes = new Set<() => void>();
  const avisar = () => ouvintes.forEach((cb) => cb());
  const escrita =
    <A extends unknown[]>(fn: (...a: A) => Promise<unknown>) =>
    async (...a: A) => {
      await fn(...a);
      avisar();
    };

  const r: Repo = {
    async getConfig() {
      const c = await db.config.get('main');
      if (!c) return undefined;
      const { chave: _c, ...resto } = c;
      return { ...resto, ajustePassos: resto.ajustePassos ?? 0 };
    },
    setConfig: escrita((c: Config) => db.config.put({ ...c, chave: 'main' })),

    listSessoes: () => db.sessoes.orderBy('data').toArray(),
    putSessao: escrita((s: SessaoTreino) => db.sessoes.put(s)),
    updateSessao: escrita((id: string, fn: (s: SessaoTreino) => SessaoTreino) =>
      db.transaction('rw', db.sessoes, async () => {
        const atual = await db.sessoes.get(id);
        if (atual) await db.sessoes.put(fn(atual));
      }),
    ),
    deleteSessao: escrita((id: string) => db.sessoes.delete(id)),

    listMedidas: (tipo?: TipoMedida) =>
      tipo ? db.medidas.where('tipo').equals(tipo).sortBy('data') : db.medidas.orderBy('data').toArray(),
    putMedida: escrita((m: Medida) => db.medidas.put(m)),
    deleteMedida: escrita((id: string) => db.medidas.delete(id)),

    listFotos: () => db.fotos.orderBy('data').reverse().toArray(),
    putFoto: escrita((f: Foto) => db.fotos.put(f)),
    deleteFoto: escrita((id: string) => db.fotos.delete(id)),

    getNutricao: (data: string) => db.nutricao.get(data),
    listNutricao: () => db.nutricao.orderBy('data').toArray(),
    putNutricao: escrita((n: DiaNutricao) => db.nutricao.put(n)),

    listDecisoes: () => db.decisoes.toArray(),
    putDecisao: escrita((d: DecisaoAjuste) => db.decisoes.put(d)),

    async exportar() {
      const fotos = await db.fotos.toArray();
      return {
        app: 'superapp',
        versao: 1,
        exportadoEm: new Date().toISOString(),
        config: await r.getConfig(),
        sessoes: await db.sessoes.toArray(),
        medidas: await db.medidas.toArray(),
        nutricao: await db.nutricao.toArray(),
        decisoes: await db.decisoes.toArray(),
        fotos: await Promise.all(
          fotos.map(async ({ blob, ...f }) => ({ ...f, dataUrl: await blobParaDataUrl(blob) })),
        ),
      };
    },

    importar: escrita(async (b: Backup) => {
      if (b?.app !== 'superapp') throw new Error('Arquivo não é um backup deste app');
      const fotos = await Promise.all(
        (b.fotos ?? []).map(async ({ dataUrl, ...f }) => ({ ...f, blob: await dataUrlParaBlob(dataUrl) })),
      );
      await db.transaction('rw', [db.config, db.sessoes, db.medidas, db.fotos, db.nutricao, db.decisoes], async () => {
        await Promise.all([db.config, db.sessoes, db.medidas, db.fotos, db.nutricao, db.decisoes].map((t) => t.clear()));
        if (b.config) await db.config.put({ ...b.config, chave: 'main' });
        await db.sessoes.bulkPut(b.sessoes ?? []);
        await db.medidas.bulkPut(b.medidas ?? []);
        await db.nutricao.bulkPut(b.nutricao ?? []);
        await db.decisoes.bulkPut(b.decisoes ?? []);
        await db.fotos.bulkPut(fotos);
      });
    }),

    subscribe(cb) {
      ouvintes.add(cb);
      return () => ouvintes.delete(cb);
    },
  };
  return r;
}

export const repo: Repo = criarRepoDexie();

export function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
