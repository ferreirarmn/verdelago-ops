// correspondencias.js — tabela de correspondência entre nomes do PLANO
// (orçamento) e nomes do REAL (Pessoas/Funções). Resolve as pequenas diferenças
// de grafia/designação para que as comparações plano vs real fiquem exatas.
//
// Lista SharePoint "Correspondencias": colunas
//   Title       = nome no PLANO (ex.: "Cozinheiro de 2ª", "RESTAURANTE")
//   Tipo        = "Departamento" | "Função"  (choice)
//   NomeReal    = nome canónico no REAL (ex.: "Cozinheiro 2ª", "F&B")
//
// Uso: await carregarCorrespondencias(); depois canonDepartamento(nome) /
// canonFuncao(nome) devolvem o nome canónico (do REAL) para qualquer das fontes.

import * as graph from "./graph.js";

export const normCorr = s => String(s || "").toUpperCase()
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/\bDE\b/g, " ").replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();

let _itens = null;            // itens crus da lista
const _mapa = { Departamento: {}, "Função": {} };   // normPlano|normReal -> canónico

export function correspondenciasCarregadas() { return _itens != null; }
export function itensCorrespondencia() { return _itens || []; }

export async function carregarCorrespondencias() {
  try {
    _itens = await graph.lerLista("Correspondencias");
  } catch { _itens = []; }
  reconstruirMapa();
  return _itens;
}

function reconstruirMapa() {
  _mapa.Departamento = {}; _mapa["Função"] = {};
  for (const it of (_itens || [])) {
    const tipo = it.Tipo === "Departamento" ? "Departamento" : "Função";
    const plano = it.Title, real = it.NomeReal || it.Title;
    if (plano) _mapa[tipo][normCorr(plano)] = real;
    if (real) _mapa[tipo][normCorr(real)] = real;   // o próprio real mapeia para si
  }
}

function canon(tipo, nome) {
  if (!nome) return nome;
  const m = _mapa[tipo] || {};
  return m[normCorr(nome)] || nome;     // sem correspondência: devolve o original
}
export const canonDepartamento = nome => canon("Departamento", nome);
export const canonFuncao = nome => canon("Função", nome);

// dois nomes (de fontes diferentes) referem a mesma função/departamento?
export function mesmoDepartamento(a, b) { return normCorr(canonDepartamento(a)) === normCorr(canonDepartamento(b)); }
export function mesmaFuncao(a, b) { return normCorr(canonFuncao(a)) === normCorr(canonFuncao(b)); }
