import { useState } from 'react';
import { novoId, repo } from '../data/repo';
import { itemDeAlimento, somarItens } from '../domain/nutricao';
import { protocolo as P } from '../domain/protocolo';
import type { ItemRefeicao, Macros } from '../domain/types';
import { useDados } from '../state';
import { fmt, lerNumero } from './util';

const OUTRO = '__outro';

export function textoMacros(m: Macros): string {
  return `${m.kcal} kcal · P ${fmt(m.p)} g · C ${fmt(m.c)} g · G ${fmt(m.g)} g`;
}

export function descreverItens(itens: ItemRefeicao[]): string {
  return itens.map((i) => (i.gramas ? `${i.gramas} g ${i.nome.split(/[,(/]/)[0].trim().toLowerCase()}` : i.nome)).join(' + ');
}

/** Monta uma refeição com alimentos e gramas (ou itens livres) e calcula os macros. */
export default function MontarRefeicao(props: {
  titulo: string;
  inicial?: ItemRefeicao[];
  onSalvar: (itens: ItemRefeicao[]) => void;
  onCancelar: () => void;
}) {
  const d = useDados();
  const alimentos = [...(P.nutricao.alimentos ?? [])].sort((a, b) => a.nome.localeCompare(b.nome));
  const [itens, setItens] = useState<ItemRefeicao[]>(props.inicial ?? []);
  const [alimentoId, setAlimentoId] = useState(alimentos[0]?.id ?? OUTRO);
  const [gramas, setGramas] = useState('');
  const [nomeOutro, setNomeOutro] = useState('');
  const [kcalOutro, setKcalOutro] = useState('');
  const [protOutro, setProtOutro] = useState('');
  const [guardar, setGuardar] = useState(false);
  const [nomeSalva, setNomeSalva] = useState('');
  const [erro, setErro] = useState('');

  const alimento = alimentos.find((a) => a.id === alimentoId);
  const total = somarItens(itens);
  const salvas = d.config?.refeicoesSalvas ?? [];

  const adicionar = () => {
    if (alimentoId === OUTRO) {
      const kcal = lerNumero(kcalOutro);
      if (!nomeOutro.trim() || kcal === undefined) return setErro('Informe o nome e as kcal.');
      setItens((x) => [...x, { nome: nomeOutro.trim(), kcal: Math.round(kcal), p: lerNumero(protOutro) ?? 0, c: 0, g: 0 }]);
      setNomeOutro('');
      setKcalOutro('');
      setProtOutro('');
    } else {
      const g = lerNumero(gramas);
      if (!alimento || !g) return setErro('Informe as gramas.');
      setItens((x) => [...x, itemDeAlimento(alimento, g)]);
      setGramas('');
    }
    setErro('');
  };

  const salvar = async () => {
    if (itens.length === 0) return setErro('Adicione pelo menos um alimento.');
    if (guardar && d.config) {
      const nome = nomeSalva.trim() || descreverItens(itens);
      await repo.setConfig({ ...d.config, refeicoesSalvas: [...salvas, { id: novoId(), nome, itens }] });
    }
    props.onSalvar(itens);
  };

  return (
    <div className="card destaque stack" style={{ margin: '8px 0' }}>
      <h2 style={{ margin: 0 }}>{props.titulo}</h2>

      {salvas.length > 0 && (
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Minhas refeições (toque para carregar)</div>
          <div className="row wrap">
            {salvas.map((s) => (
              <span key={s.id} className="chip" style={{ padding: 0 }}>
                <button className="chip" style={{ border: 0, cursor: 'pointer' }} onClick={() => setItens(s.itens)}>⭐ {s.nome}</button>
                <button
                  className="chip"
                  style={{ border: 0, cursor: 'pointer', paddingLeft: 2 }}
                  aria-label={`Apagar ${s.nome}`}
                  onClick={() => d.config && confirm(`Apagar "${s.nome}" de Minhas refeições?`) && repo.setConfig({ ...d.config, refeicoesSalvas: salvas.filter((x) => x.id !== s.id) })}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {itens.length > 0 && (
        <ul className="lista">
          {itens.map((i, k) => (
            <li key={k}>
              <span>
                {i.gramas ? <strong className="num">{i.gramas} g </strong> : null}
                {i.nome}
                <div className="small muted num">{textoMacros(i)}</div>
              </span>
              <button className="btn ghost sm danger" aria-label={`Remover ${i.nome}`} onClick={() => setItens((x) => x.filter((_, j) => j !== k))}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <label className="campo">
        Alimento
        <select className="input" value={alimentoId} onChange={(e) => { setAlimentoId(e.target.value); setErro(''); }}>
          {alimentos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          <option value={OUTRO}>Outro (digitar kcal e proteína)</option>
        </select>
      </label>

      {alimentoId === OUTRO ? (
        <div className="stack">
          <label className="campo">
            Nome
            <input className="input" value={nomeOutro} placeholder="ex.: pastel de carne" onChange={(e) => setNomeOutro(e.target.value)} />
          </label>
          <div className="row">
            <label className="campo grow">
              kcal
              <input className="input num" inputMode="numeric" value={kcalOutro} onChange={(e) => setKcalOutro(e.target.value)} />
            </label>
            <label className="campo grow">
              Proteína (g)
              <input className="input num" inputMode="decimal" placeholder="opcional" value={protOutro} onChange={(e) => setProtOutro(e.target.value)} />
            </label>
          </div>
        </div>
      ) : (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <label className="campo grow">
            Gramas
            <input className="input num" inputMode="numeric" value={gramas} onChange={(e) => { setGramas(e.target.value); setErro(''); }} onKeyDown={(e) => e.key === 'Enter' && adicionar()} />
          </label>
          {alimento?.porcao && (
            <button className="btn sm" style={{ minHeight: 44 }} onClick={() => setGramas(String((lerNumero(gramas) ?? 0) + alimento.porcao!.g))}>
              + {alimento.porcao.nome} ({alimento.porcao.g} g)
            </button>
          )}
        </div>
      )}
      <button className="btn block" onClick={adicionar}>+ Adicionar à refeição</button>
      {erro && <p className="small" style={{ color: 'var(--bad)', margin: 0 }}>{erro}</p>}

      {itens.length > 0 && (
        <div className="metric">
          <div className="v">{total.kcal} kcal</div>
          <div className="l num">Proteína {fmt(total.p)} g · Carbo {fmt(total.c)} g · Gordura {fmt(total.g)} g</div>
        </div>
      )}

      <label className="row small" style={{ gap: 6 }}>
        <input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} />
        Guardar em "Minhas refeições" para repetir
      </label>
      {guardar && (
        <input className="input" placeholder="Nome (ex.: Café de arroz com frango)" value={nomeSalva} onChange={(e) => setNomeSalva(e.target.value)} />
      )}
      <div className="row">
        <button className="btn primary grow" onClick={salvar}>Salvar refeição</button>
        <button className="btn ghost" onClick={props.onCancelar}>Cancelar</button>
      </div>
      {P.nutricao.alimentosObs && <p className="small muted" style={{ margin: 0 }}>{P.nutricao.alimentosObs}</p>}
    </div>
  );
}
