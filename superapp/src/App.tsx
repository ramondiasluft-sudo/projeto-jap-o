import { lazy, Suspense, useEffect, useState } from 'react';
import { IcHoje, IcMais, IcMedidas, IcNutricao, IcProgresso, IcTreino } from './components/Icones';
import { TimerProvider } from './components/Timer';
import { NavCtx, type Aba } from './nav';
import Hoje from './screens/Hoje';
import Mais from './screens/Mais';
import Medidas from './screens/Medidas';
import Nutricao from './screens/Nutricao';
import Onboarding from './screens/Onboarding';
import TreinoTela from './screens/Treino';
import { useDados } from './state';

// Gráficos (Recharts) carregam só quando a aba é aberta.
const Progresso = lazy(() => import('./screens/Progresso'));

const ABAS: { id: Aba; nome: string; Icone: () => JSX.Element }[] = [
  { id: 'hoje', nome: 'Hoje', Icone: IcHoje },
  { id: 'treino', nome: 'Treino', Icone: IcTreino },
  { id: 'medidas', nome: 'Medidas', Icone: IcMedidas },
  { id: 'progresso', nome: 'Progresso', Icone: IcProgresso },
  { id: 'nutricao', nome: 'Nutrição', Icone: IcNutricao },
  { id: 'mais', nome: 'Mais', Icone: IcMais },
];

function abaDoHash(): Aba {
  const h = location.hash.replace('#', '') as Aba;
  return ABAS.some((a) => a.id === h) ? h : 'hoje';
}

export default function App() {
  const d = useDados();
  const [aba, setAba] = useState<Aba>(abaDoHash);

  useEffect(() => {
    const f = () => setAba(abaDoHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const ir = (a: Aba) => {
    if (a !== aba) location.hash = a;
    window.scrollTo(0, 0);
  };

  if (!d.carregado) return <div className="page muted">Carregando…</div>;
  if (!d.config) return <Onboarding />;

  return (
    <NavCtx.Provider value={ir}>
      <TimerProvider>
        {aba === 'hoje' && <Hoje />}
        {aba === 'treino' && <TreinoTela />}
        {aba === 'medidas' && <Medidas />}
        {aba === 'progresso' && (
          <Suspense fallback={<div className="page muted">Carregando gráficos…</div>}>
            <Progresso />
          </Suspense>
        )}
        {aba === 'nutricao' && <Nutricao />}
        {aba === 'mais' && <Mais />}
        <nav className="nav" aria-label="Navegação">
          <div className="nav-inner">
            {ABAS.map(({ id, nome, Icone }) => (
              <button key={id} className={aba === id ? 'on' : ''} onClick={() => ir(id)} aria-current={aba === id ? 'page' : undefined}>
                <Icone />
                {nome}
                {id === 'treino' && d.emAndamento && <span className="dot" aria-label="treino em andamento" />}
              </button>
            ))}
          </div>
        </nav>
      </TimerProvider>
    </NavCtx.Provider>
  );
}
