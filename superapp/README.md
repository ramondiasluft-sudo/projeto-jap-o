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

Para instalar no celular, publique `dist/` em qualquer hospedagem HTTPS (GitHub Pages, Netlify,
Vercel…) e use "Adicionar à tela inicial". O build usa caminhos relativos, então funciona em subpasta.

## Estrutura

| Pasta | O que tem |
|---|---|
| `src/domain/regras.ts` | Regras de negócio como funções puras: semana/fase, treino do dia, séries por fase, deload, dupla progressão, regra do inclinado, dor no ombro, ajuste calórico, resumo da semana 26 |
| `src/domain/regras.test.ts` | Testes das regras |
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
