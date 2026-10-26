import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { mmss } from './util';

interface TimerApi {
  iniciar: (segundos: number) => void;
  parar: () => void;
}
const Ctx = createContext<TimerApi>({ iniciar: () => {}, parar: () => {} });
export const useTimer = () => useContext(Ctx);

function bipar() {
  try {
    const ac = new AudioContext();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.2, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.6);
    o.connect(g).connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + 0.6);
  } catch {
    /* sem áudio */
  }
  navigator.vibrate?.([200, 100, 200]);
}

/** Timer de descanso flutuante. Usa horário de término, então sobrevive a troca de aba/tela. */
export function TimerProvider({ children }: { children: ReactNode }) {
  const [fim, setFim] = useState<number | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const avisou = useRef(false);

  const iniciar = useCallback((s: number) => {
    avisou.current = false;
    setFim(Date.now() + s * 1000);
    setAgora(Date.now());
  }, []);

  useEffect(() => {
    if (fim === null) return;
    const t = setInterval(() => setAgora(Date.now()), 250);
    return () => clearInterval(t);
  }, [fim]);

  const restante = fim === null ? 0 : (fim - agora) / 1000;
  useEffect(() => {
    if (fim !== null && restante <= 0 && !avisou.current) {
      avisou.current = true;
      bipar();
      const t = setTimeout(() => setFim(null), 4000);
      return () => clearTimeout(t);
    }
  }, [fim, restante]);

  return (
    <Ctx.Provider value={{ iniciar, parar: () => setFim(null) }}>
      {children}
      {fim !== null && (
        <div className="timer" role="timer" aria-live="polite">
          <div className={`timer-inner ${restante <= 0 ? 'fim' : ''}`}>
            <span className="small">Descanso</span>
            <span className="t">{restante <= 0 ? 'Vai!' : mmss(restante)}</span>
            <button className="btn sm" onClick={() => setFim((f) => (f ?? Date.now()) + 15000)}>+15 s</button>
            <button className="btn sm" onClick={() => setFim(null)}>Pular</button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
