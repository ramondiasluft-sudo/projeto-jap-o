import { createContext, useContext } from 'react';

export type Aba = 'hoje' | 'treino' | 'medidas' | 'progresso' | 'nutricao' | 'mais';
export const NavCtx = createContext<(a: Aba) => void>(() => {});
export const useNav = () => useContext(NavCtx);
