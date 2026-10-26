// Tipos do protocolo (espelham protocolo.json) e do modelo de dados persistido.

export type TreinoId = 'A' | 'B' | 'C' | 'D' | 'E';
export type TipoExercicio = 'composto' | 'isolado' | 'tempo' | 'distancia';
export type DiaSemana = 'dom' | 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab';

export interface Fase {
  id: string;
  nome: string;
  semanas: [number, number];
  foco: string;
  rir: string | null;
  kcal: number;
  proteinaG: number;
  gorduraG: number;
  carboG: number;
  passosMeta: number;
  cardio: { sessoes: number; minutos: number } | null;
  ritmoPesoKgSem?: [number, number];
  seriesExtras?: string[];
  deload?: boolean;
  esquemaForca?: { series: number; reps: [number, number]; descansoSeg: number };
  liberaReintroducaoOmbro?: boolean;
  tecnicasIntensidade?: boolean;
}

export interface Substituicao {
  aPartirDaSemana: number;
  condicao: string;
  id: string;
  nome: string;
  series: number;
  reps: [number, number];
  tipo: TipoExercicio;
  cargaInicialPct?: number;
}

export interface Exercicio {
  id: string;
  nome: string;
  series: number;
  reps?: [number, number];
  segundos?: [number, number];
  metros?: [number, number];
  tipo: TipoExercicio;
  forcaFase3?: boolean;
  obs?: string;
  strap?: boolean;
  biset?: string;
  ombroSensivel?: boolean;
  alternativaSeDor?: string;
  substituicao?: Substituicao;
  dropSetFase4?: boolean;
  grupo?: string;
  meta?: { segundos: number; ateSemana: number };
}

export interface Treino {
  nome: string;
  exercicios: Exercicio[];
}

export interface Protocolo {
  meta: {
    nome: string;
    versao: number;
    duracaoSemanas: number;
    diasPorSemana: number;
    duracaoTreinoMin: number;
    academia: string;
    atleta: {
      idade: number;
      alturaCm: number;
      pesoInicialKg: number;
      gorduraInicialPct: number;
      massaMagraInicialKg: number;
    };
    metas: Record<string, Record<string, number | number[]>>;
  };
  fases: Fase[];
  agendaSemanal: {
    padrao5: Partial<Record<DiaSemana, TreinoId | null>>;
    padrao4: Partial<Record<DiaSemana, TreinoId | null>>;
    obs4dias: string;
  };
  aquecimentoOmbro: {
    aplicaEm: TreinoId[];
    duracaoMin: [number, number];
    itens: { nome: string; series: number; reps: string }[];
  };
  treinos: Record<TreinoId, Treino>;
  regras: {
    duplaProgressao: {
      descricao: string;
      incrementoKg: { composto: [number, number]; isolado: [number, number] };
      alternativaIsolado: string;
    };
    deload: { fatorSeries: number; fatorCarga: number };
    dorOmbro: {
      escala: [number, number];
      limiteOk: number;
      acaoAcimaDoLimite: string;
      alertaMedico: string;
    };
    ajusteCalorico: {
      janelaSemanas: number;
      seQuedaMaiorQueKgSem: number;
      entao: string;
      seEstagnadoFases: string[];
      condicaoEstagnado: string;
      entaoEstagnado: string;
    };
    deloadKcalExtra: number;
    decisaoSemana26: { seGorduraPctMenorOuIgual: number; entao: string; senao: string };
  };
  nutricao: {
    gastoEstimadoKcal: number;
    aguaLitrosDia: number;
    refeicoesComProteina: { quantidade: number; proteinaPorRefeicaoG: [number, number] };
    diaExemplo: { refeicao: string; descricao: string; proteinaG: number }[];
  };
  suplementos: { nome: string; dose: string; frequencia: string }[];
  monitoramento: { id: string; unidade: string | null; frequencia?: string; como?: string; meta?: number[]; semanas?: number[] }[];
}

// ---------- Modelo de dados (IndexedDB) ----------

export type Config = {
  inicio: string; // YYYY-MM-DD
  diasPorSemana: 4 | 5;
  ajusteKcal: number;
  ajustePassos: number;
};

export type Tecnica = 'rest-pause' | 'drop-set';

export type SerieRegistrada = {
  exercicioId: string;
  ordem: number;
  cargaKg?: number;
  reps?: number;
  rir?: number;
  segundos?: number;
  metros?: number;
  tecnica?: Tecnica;
};

export type SessaoTreino = {
  id: string;
  data: string; // YYYY-MM-DD
  semana: number;
  faseId: string;
  treino: TreinoId;
  aquecimentoFeito: boolean;
  dorOmbro?: number;
  series: SerieRegistrada[];
  duracaoMin?: number;
  finalizada: boolean;
  iniciadaEm: number; // epoch ms
};

export type TipoMedida = 'peso' | 'cintura' | 'passos' | 'sono' | 'gorduraPct' | 'massaMagraKg';

export type Medida = { id: string; data: string; tipo: TipoMedida; valor: number };

export type Angulo = 'frente' | 'lado' | 'costas';
export type Foto = { id: string; data: string; angulo: Angulo; blob: Blob };

export type DiaNutricao = {
  data: string;
  kcal?: number;
  proteinaG?: number;
  creatina: boolean;
  aguaL?: number;
  refeicoes?: boolean[];
};

export type TipoAjuste = 'kcal+150' | 'kcal-150' | 'passos+2000';

export type DecisaoAjuste = {
  id: string; // `${semana}`
  semana: number;
  data: string;
  sugestao: 'subir' | 'baixar';
  escolha: TipoAjuste | 'ignorar';
};
