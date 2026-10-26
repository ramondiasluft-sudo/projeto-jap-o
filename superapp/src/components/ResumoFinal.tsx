import { protocolo as P } from '../domain/protocolo';
import { resumoSemana26 } from '../domain/regras';
import { useDados } from '../state';
import { fmt } from './util';

function Linha({ nome, a, b, un }: { nome: string; a?: number; b?: number; un: string }) {
  const d = a !== undefined && b !== undefined ? b - a : undefined;
  return (
    <tr>
      <td>{nome}</td>
      <td>{fmt(a)} {un}</td>
      <td>{fmt(b)} {un}</td>
      <td>{d === undefined ? '—' : `${d > 0 ? '+' : ''}${fmt(d)}`}</td>
    </tr>
  );
}

export default function ResumoFinal() {
  const d = useDados();
  const r = resumoSemana26(P, d.medidas, d.sessoes);
  return (
    <div className="card destaque">
      <h2>Semana 26 — resumo</h2>
      <table className="tab">
        <thead>
          <tr><th></th><th>Início</th><th>Agora</th><th>Δ</th></tr>
        </thead>
        <tbody>
          <Linha nome="Peso" a={r.peso.inicio} b={r.peso.fim} un="kg" />
          <Linha nome="Cintura" a={r.cintura.inicio} b={r.cintura.fim} un="cm" />
          <Linha nome="% gordura" a={r.gordura.inicio} b={r.gordura.fim} un="%" />
        </tbody>
      </table>
      {r.cargas.length > 0 && (
        <details className="bloco" style={{ marginTop: 10 }}>
          <summary>Cargas início × fim ({r.cargas.length})</summary>
          <table className="tab">
            <tbody>
              {r.cargas.map((c) => (
                <Linha key={c.exercicioId} nome={c.nome} a={c.inicio} b={c.fim} un="kg" />
              ))}
            </tbody>
          </table>
        </details>
      )}
      <p style={{ marginBottom: 0 }}>
        <strong>Próximo passo:</strong> {r.decisao}
        <br />
        <span className="muted">
          Regra: % de gordura ≤ {P.regras.decisaoSemana26.seGorduraPctMenorOuIgual}% → {P.regras.decisaoSemana26.entao}; senão → {P.regras.decisaoSemana26.senao}.
        </span>
      </p>
    </div>
  );
}
