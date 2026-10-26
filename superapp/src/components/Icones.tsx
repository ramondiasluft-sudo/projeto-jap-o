// Ícones de linha simples (24×24), herdam a cor do texto.
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const IcHoje = () => (
  <svg viewBox="0 0 24 24" {...base}><rect x="3" y="4" width="18" height="17" rx="3" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
);
export const IcTreino = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" /></svg>
);
export const IcMedidas = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M4 20h16M7 16V9M12 16V5M17 16v-4" /></svg>
);
export const IcProgresso = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>
);
export const IcNutricao = () => (
  <svg viewBox="0 0 24 24" {...base}><path d="M12 21c-4 0-7-3-7-8 0-4 3-6 5-6 1 0 1.5.5 2 .5s1-.5 2-.5c2 0 5 2 5 6 0 5-3 8-7 8z" /><path d="M12 7c0-2 1-4 3-4" /></svg>
);
export const IcMais = () => (
  <svg viewBox="0 0 24 24" {...base}><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
);
export const IcCheck = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...base} strokeWidth={3}><path d="M5 12l5 5 9-10" /></svg>
);
