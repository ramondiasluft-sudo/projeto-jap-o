# Superapp — Protocolo 6 Meses

PWA (React + TypeScript + Vite) para acompanhar pelo celular, durante 26 semanas, treino, cargas,
alimentação, medidas e dor no ombro. Especificação em [`SPEC.md`](SPEC.md).

Os dados do protocolo vêm só de [`src/data/protocolo.json`](src/data/protocolo.json) — para mudar
fases, treinos ou regras, edite o JSON.

## Rodar

```bash
cd superapp
npm install
npm run dev        # desenvolvimento
npm test           # testes unitários (regras + repositório)
npm run build      # gera dist/ (PWA instalável, funciona offline)
npm run preview    # serve o build
```

**App publicado:** https://ramondiasluft-sudo.github.io/projeto-jap-o/ — abra no celular e use
"Adicionar à tela inicial". Cada push que mexe em `superapp/` roda os testes, gera o build e atualiza
a branch `gh-pages` (workflow `.github/workflows/superapp-pages.yml`).

## Estrutura

| Pasta | O que tem |
|---|---|
| `src/domain/regras.ts` | Regras de negócio como funções puras: semana/fase, treino do dia, séries por fase, deload, dupla progressão, regra do inclinado, dor no ombro, ajuste calórico, resumo da semana 26 |
| `src/domain/regras.test.ts` | Testes das regras |
| `src/domain/medidas.ts` | (v2) Linha de base a partir de `avaliacaoInicial`, variação e meta de cada medida, proporções ombro ÷ cintura e cintura ÷ altura, alongamentos por treino |
| `src/data/repo.ts` | Interface `Repo` + implementação IndexedDB (Dexie), backup/restore em JSON. Para Supabase/Firebase, crie outra implementação da interface |
| `src/state.tsx` | Carrega os dados e deriva semana, fase, alertas e sugestões |
| `src/screens/` | Hoje, Treino, Medidas, Progresso, Nutrição, Mais (Protocolo + Configurações) |

## Decisões onde a spec deixava margem

- **Carga sugerida**: o topo da faixa é o da prescrição de hoje; o RIR mínimo é o da fase da sessão
  anterior. Sessões de deload não servem de base (depois do deload volta-se à carga anterior).
  RIR em branco conta como atingido (o campo já vem preenchido com o RIR mínimo da fase).
  Cargas arredondadas para 0,5 kg.
- **Dor > 3**: vale a última dor registrada. Exercícios `ombroSensivel` são trocados pela
  `alternativaSeDor` (se houver) e a carga sugerida cai para 80%.
- **Supino inclinado**: exige ao menos um registro de dor nas últimas 4 semanas, todos ≤ 2.
- **Ajuste calórico**: avaliado nas semanas 3, 5, 7… com as médias semanais de peso. Queda =
  (média de 3 semanas atrás − média da semana passada) / 2. Estagnado = médias das 2 últimas
  semanas a até 0,2 kg e cintura a até 0,5 cm entre duas medições com ≥ 7 dias. Cada sugestão
  aparece uma vez por semana de avaliação; aceitar soma o ajuste à meta de todas as fases seguintes.
- **Timer de descanso** começa no limite superior da faixa (ex.: 180 s compostos, 90 s isolados).
- **Fotos** são reduzidas para no máx. 1600 px (JPEG) para o backup não ficar enorme.
- **Linha de base (v2)**: gravada uma vez, no primeiro acesso (ou ao restaurar um backup antigo), com ids
  fixos `base-<medida>`. A variação de cada medida é contada a partir dela, mesmo que existam registros
  de peso anteriores.
- **Variações de exercício**: `exercicios[].variacoes` + `variacaoPreferida` no JSON. A troca feita no
  treino fica salva na configuração e vale para os próximos treinos. Cada variação tem histórico de carga
  próprio (barra e halteres não se comparam). Séries, reps e marcações (força, +1 série, drop set) são herdadas.
- **Cardio**: opções em `cardio.opcoes` no JSON; registro no fim do treino ou avulso (tela Treino).
  Km ou velocidade: o que faltar é calculado; o que foi digitado nunca é sobrescrito. A semana conta
  quantas sessões atingiram os minutos da meta da fase.
- **Anotações** do treino ficam na sessão e aparecem no histórico.
- **Refeição montada ("o que comi")**: em cada refeição, monte com alimentos da tabela
  `nutricao.alimentos` (macros por 100 g, base TACO) + gramas, ou itens livres (nome, kcal, proteína).
  Os macros calculados ficam gravados no dia, então mudar a tabela não altera o histórico.
  Combinações podem ser guardadas em "Minhas refeições" (configuração) e reaplicadas com um toque.
