import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { repo } from './data/repo';
import { hojeISO } from './domain/datas';
import { medidasDaAvaliacaoInicial } from './domain/medidas';
import { protocolo as P } from './domain/protocolo';
import {
  avaliarAjusteCalorico,
  avaliarInclinado,
  faseDaSemana,
  semanaAtual,
  semanaDoPrograma,
  statusDor,
  treinoDoDia,
  type SugestaoAjuste,
} from './domain/regras';
import type { Config, DecisaoAjuste, DiaNutricao, Fase, Medida, SessaoTreino, TreinoId } from './domain/types';

export interface Dados {
  carregado: boolean;
  config?: Config;
  sessoes: SessaoTreino[];
  medidas: Medida[];
  nutricao: DiaNutricao[];
  decisoes: DecisaoAjuste[];
}

export interface Derivado extends Dados {
  hoje: string;
  semanaBruta: number;
  semana: number;
  fase: Fase;
  treinoHoje: TreinoId | null;
  dor: ReturnType<typeof statusDor>;
  inclinado: ReturnType<typeof avaliarInclinado>;
  sugestaoAjuste: SugestaoAjuste | null;
  /** Sessão em andamento (não finalizada), se houver. */
  emAndamento?: SessaoTreino;
  kcalMeta: number;
  passosMeta: number;
}

const Ctx = createContext<Derivado | null>(null);

function useHoje(): string {
  const [hoje, setHoje] = useState(hojeISO());
  useEffect(() => {
    const t = setInterval(() => setHoje(hojeISO()), 60_000);
    const vis = () => setHoje(hojeISO());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  return hoje;
}

export function DadosProvider({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Dados>({ carregado: false, sessoes: [], medidas: [], nutricao: [], decisoes: [] });
  const hoje = useHoje();

  useEffect(() => {
    let vivo = true;
    let semeando = false;
    const carregar = async () => {
      const [config, sessoes, medidas, nutricao, decisoes] = await Promise.all([
        repo.getConfig(),
        repo.listSessoes(),
        repo.listMedidas(),
        repo.listNutricao(),
        repo.listDecisoes(),
      ]);
      // Primeiro acesso (ou backup antigo): grava a avaliação inicial do JSON como linha de base.
      // Os ids são fixos (base-*), então repetir é inofensivo.
      if (config && !config.linhaBaseCarregada) {
        if (semeando) return;
        semeando = true;
        for (const m of medidasDaAvaliacaoInicial(P.avaliacaoInicial)) await repo.putMedida(m);
        await repo.setConfig({ ...config, linhaBaseCarregada: true });
        semeando = false;
        return; // as escritas disparam um novo carregamento
      }
      if (vivo) setDados({ carregado: true, config, sessoes, medidas, nutricao, decisoes });
    };
    carregar();
    const off = repo.subscribe(carregar);
    return () => {
      vivo = false;
      off();
    };
  }, []);

  const valor = useMemo<Derivado>(() => {
    const cfg = dados.config;
    const inicio = cfg?.inicio ?? hoje;
    const semanaBruta = semanaDoPrograma(inicio, hoje);
    const semana = semanaAtual(inicio, hoje, P.meta.duracaoSemanas);
    const fase = faseDaSemana(P.fases, semana);
    const finalizadas = dados.sessoes.filter((s) => s.finalizada);
    const decidida = new Set(dados.decisoes.map((d) => d.semana));
    const sug = avaliarAjusteCalorico({
      semana,
      inicio,
      fase,
      pesos: dados.medidas.filter((m) => m.tipo === 'peso'),
      cinturas: dados.medidas.filter((m) => m.tipo === 'cintura'),
      regras: P.regras.ajusteCalorico,
    });
    const subst = P.treinos.C.exercicios.find((e) => e.substituicao)?.substituicao;
    return {
      ...dados,
      hoje,
      semanaBruta,
      semana,
      fase,
      treinoHoje: semanaBruta >= 1 ? treinoDoDia(P.agendaSemanal, cfg?.diasPorSemana ?? 5, hoje) : null,
      dor: statusDor(finalizadas, P.regras.dorOmbro.limiteOk),
      inclinado: avaliarInclinado(semana, finalizadas, hoje, subst?.aPartirDaSemana),
      sugestaoAjuste: sug && !decidida.has(sug.semana) ? sug : null,
      emAndamento: dados.sessoes.find((s) => !s.finalizada),
      kcalMeta: fase.kcal + (cfg?.ajusteKcal ?? 0),
      passosMeta: fase.passosMeta + (cfg?.ajustePassos ?? 0),
    };
  }, [dados, hoje]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useDados(): Derivado {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDados fora do DadosProvider');
  return v;
}
