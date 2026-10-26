import dados from '../data/protocolo.json';
import type { Protocolo } from './types';

// Fonte única de verdade: o app lê o protocolo do JSON, sem duplicar valores.
export const protocolo = dados as unknown as Protocolo;
