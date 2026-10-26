# App de acompanhamento — Protocolo 6 Meses

Especificação para o Claude Code. Os dados do protocolo estão em `protocolo.json` (fonte única de verdade: fases, treinos, regras, nutrição, métricas). O app deve ler esse arquivo, não duplicar valores no código.

## Objetivo

Acompanhar pelo celular, durante 26 semanas, treino, cargas, alimentação, medidas e dor no ombro, e sugerir automaticamente a carga e a fase corretas.

## Stack sugerida

- React + TypeScript + Vite, PWA instalável (manifest + service worker), mobile-first (~380 px).
- Persistência local: IndexedDB (via Dexie). Exportar/importar backup em JSON.
- Gráficos: Recharts.
- Sem backend na v1. Deixar a camada de dados isolada (repository) para plugar Supabase/Firebase depois.

## Conceito central: data de início

O usuário informa a **data de início** no primeiro acesso. A partir dela o app calcula:

- `semanaAtual = floor((hoje - inicio) / 7) + 1` (1 a 26).
- `faseAtual` = fase cujo intervalo `semanas` contém `semanaAtual`.
- `treinoDoDia` = `agendaSemanal.padrao5` (ou `padrao4`, configurável) pelo dia da semana.

## Telas

1. **Hoje** — semana e fase atuais, treino do dia, metas do dia (kcal, macros, passos, cardio), checklist rápido (creatina, água, passos, sono).
2. **Treino em execução**
   - Aquecimento de ombro (quando `aquecimentoOmbro.aplicaEm` incluir o treino), com check.
   - Aquecimento específico do treino (`treinos[X].aquecimento`, ex.: cadeira extensora leve no B para o joelho), com check.
   - Ao final, alongamentos de `correcaoPostural` cujo `aplicaEm` inclua o treino, com check.
   - Lista de exercícios com séries × reps já ajustadas à fase (ver regras), carga sugerida e última carga feita.
   - Registro por série: carga (kg), reps, RIR. Para `tipo: tempo` registra segundos; `distancia` registra metros.
   - Indicação de bi-set, strap, observações.
   - Timer de descanso (180 s compostos na fase 3, 120–180 s compostos, 60–90 s isolados).
   - Ao fim: dor no ombro 0–10 (treinos A, C, D, E).
3. **Medidas** — lançar peso, cintura, passos, sono, bioimpedância e circunferências (`monitoramento.circunferencias.itens`); upload de fotos (frente, lado com braços soltos, costas).
   - A `avaliacaoInicial` do JSON é carregada como primeiro registro (linha de base) no primeiro acesso.
   - Cada medida mostra: valor atual, variação desde a linha de base e meta (`metas.seisMeses`).
   - Proporções calculadas: ombro ÷ cintura (meta 1,51) e cintura ÷ altura (meta 0,47).
4. **Progresso** — gráficos: peso (pontos diários + média móvel 7 dias), cintura, % gordura, carga por exercício ao longo do tempo, dor do ombro, aderência semanal.
5. **Nutrição** — metas da fase atual, dia exemplo, registro simples diário (kcal e proteína atingidas, sim/não por refeição).
6. **Protocolo** — visualização somente leitura das fases (linha do tempo das 26 semanas) e dos 5 treinos.
7. **Configurações** — data de início, 4 ou 5 dias/semana, backup/restore.

## Regras de negócio (implementar como funções puras e testadas)

### Séries e reps por fase
- Base: valores de `treinos[X].exercicios`.
- Fase com `esquemaForca`: exercícios com `forcaFase3: true` usam `esquemaForca.series` e `esquemaForca.reps`.
- Fase com `seriesExtras`: +1 série nos exercícios listados.
- Fase com `deload: true`: `ceil(series × 0.5)` e carga sugerida × 0.8.
- Fase com `tecnicasIntensidade`: marcar última série de isolados como "rest-pause ou drop set".

### Carga sugerida (dupla progressão)
- Pega a última sessão do mesmo exercício (por `id`, que é compartilhado entre treinos).
- Se todas as séries atingiram o topo da faixa com RIR ≥ RIR mínimo da fase → sugerir +2,5 kg (composto) ou +1 kg (isolado).
- Senão → repetir carga.
- Sem histórico → campo vazio com hint "testar carga".

### Substituição do supino inclinado
- `peito_superior` troca para `substituicao` a partir da semana 18 **somente se** a dor do ombro registrada nas últimas 4 semanas foi ≤ 2 em todos os treinos. Caso contrário mantém o crossover e mostra o motivo.

### Dor no ombro
- Dor > 3 → alerta no treino: trocar exercício marcado `ombroSensivel` por `alternativaSeDor` (quando houver) e reduzir carga.
- Dor > 3 em 3 treinos seguidos → banner recomendando ortopedista/fisioterapeuta.

### Ajuste calórico (a cada 2 semanas)
- Calcular média semanal de peso.
- Queda > 0,7 kg/semana → sugerir +150 kcal.
- Fases f1/f2a/f2b com média e cintura estáveis por 2 semanas → sugerir −150 kcal ou +2.000 passos.
- As sugestões aparecem como card; o usuário aceita e o ajuste passa a valer sobre a meta da fase.

### Semana 26
- Mostrar resumo (peso, cintura, % gordura, cargas início × fim) e a decisão de `regras.decisaoSemana26`.

## Modelo de dados (IndexedDB)

```ts
type Config = { inicio: string; diasPorSemana: 4 | 5; ajusteKcal: number };
type SessaoTreino = { id: string; data: string; semana: number; faseId: string; treino: 'A'|'B'|'C'|'D'|'E'; aquecimentoFeito: boolean; dorOmbro?: number; series: SerieRegistrada[]; duracaoMin?: number };
type SerieRegistrada = { exercicioId: string; ordem: number; cargaKg?: number; reps?: number; rir?: number; segundos?: number; metros?: number; tecnica?: 'rest-pause'|'drop-set' };
type TipoMedida = 'peso'|'cintura'|'barriga'|'peito'|'quadril'|'ombro'|'bracoEsq'|'bracoDir'|'coxaEsq'|'coxaDir'|'panturrilhaEsq'|'panturrilhaDir'|'passos'|'sono'|'gorduraPct'|'massaMagraKg';
type Medida = { id: string; data: string; tipo: TipoMedida; valor: number };
type Foto = { id: string; data: string; angulo: 'frente'|'lado'|'costas'; blob: Blob };
type DiaNutricao = { data: string; kcal?: number; proteinaG?: number; creatina: boolean; aguaL?: number };
```

## Mudanças da versão 2 (26/10/2026)

- `avaliacaoInicial`: medidas de 26/10, proporções, postura, pontos fortes e fracos.
- Treino B: cadeira extensora vira aquecimento (joelho); entram elevação pélvica (3 x 10–12) e dead bug (3 x 8 cada lado, no lugar da prancha).
- `correcaoPostural`: alongamento de peitoral (fim de A, C, D) e de flexor do quadril (fim de B).
- Novas metas de circunferência e de proporção em `metas.seisMeses`.

## Critérios de aceite da v1

- Instalável no celular e funciona offline.
- Abrir o app mostra o treino do dia correto para a semana/fase.
- Registrar um treino completo leva menos de 1 toque extra por série além de digitar carga e reps.
- Carga sugerida segue a dupla progressão e respeita deload.
- Gráfico de peso com média móvel e gráfico de carga por exercício.
- Backup/restore em JSON.
- Testes unitários para: cálculo de semana/fase, séries por fase, carga sugerida, regra do inclinado, ajuste calórico.
