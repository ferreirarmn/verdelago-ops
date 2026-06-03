// ============================================================================
// store.js — Dados do núcleo em memória + atalhos usados por todos os módulos
// ----------------------------------------------------------------------------
// Carrega Pessoas, Funções, Zonas e Turnos uma vez. Os módulos consultam aqui
// em vez de irem ao SharePoint a toda a hora.
// ============================================================================

import * as graph from "./graph.js";

export const dados = {
  pessoas: [],
  funcoes: [],
  zonas: [],
  turnos: [],
  utilizador: null   // {displayName, mail}
};

/** Carrega o núcleo partilhado. Chamar após graph.arrancar(). */
export async function carregarNucleo() {
  const [pessoas, funcoes, zonas, turnos, utilizador] = await Promise.all([
    graph.lerLista("Pessoas"),
    graph.lerLista("Funções"),
    graph.lerLista("Zonas"),
    graph.lerLista("Turnos"),
    graph.eu().catch(() => null)
  ]);
  dados.pessoas = pessoas;
  dados.funcoes = funcoes;
  dados.zonas = zonas;
  dados.turnos = turnos;
  dados.utilizador = utilizador;
}

// ---- Atalhos (a "magia" da fonte única: nunca se guardam nomes) ----

/** Devolve a ficha de uma pessoa pelo PessoaID (Title). */
export const pessoaPorId = id => dados.pessoas.find(p => p.Title === id) || null;

/** Nome a mostrar de uma pessoa pelo seu ID. */
export const nomePessoa = id => (pessoaPorId(id)?.Nome) || "(desconhecido)";

/** Função (objeto) pelo FuncaoID. */
export const funcaoPorId = id => dados.funcoes.find(f => f.Title === id) || null;

/**
 * Resolve a função de uma pessoa de forma defensiva — funciona se o FuncaoID
 * for texto ("F21"), objeto de Pesquisa, ou ...LookupId (id do item Funções).
 */
export function funcaoDaPessoa(p) {
  if (!p) return null;
  const v = p.FuncaoID;
  if (typeof v === "string" && v) return funcaoPorId(v);
  if (v && typeof v === "object" && v.LookupValue) return funcaoPorId(v.LookupValue);
  if (p.FuncaoIDLookupId != null)
    return dados.funcoes.find(f => String(f._id) === String(p.FuncaoIDLookupId)) || null;
  return null;
}

/** Módulo (HSK/F&B/Náutico/Gestão) de uma pessoa, via a sua função. */
export const moduloDaPessoa = p => funcaoDaPessoa(p)?.Modulo || "";

/** True se a coluna FuncaoID da Lista Pessoas é de Pesquisa (lookup). */
export const funcaoEhLookup = () => dados.pessoas.some(p => "FuncaoIDLookupId" in p);

/**
 * Pessoas de um módulo (ex.: "HSK"), por defeito só as ativas.
 * Apanha também quem tenha o departamento correspondente, por segurança.
 */
export function pessoasDoModulo(mod, incluirInativas = false) {
  const depAlvo = { HSK: "HOUSEKEEPING", "F&B": "", "Náutico": "" }[mod] || "";
  return dados.pessoas.filter(p => {
    if (!incluirInativas && (p.Estado || "").toLowerCase().includes("inativ")) return false;
    const f = funcaoDaPessoa(p);
    if (!f) return false;
    if (f.Modulo === mod) return true;
    if (depAlvo && (f.Departamento || "").toUpperCase().includes(depAlvo)) return true;
    return false;
  });
}

/** Zonas de um módulo (ex.: "F&B"), só as ativas. */
export const zonasDoModulo = mod => dados.zonas.filter(z => z.Modulo === mod && z.Ativa !== false);

/** Zonas por tipologia (ex.: "Alojamento"), só as ativas — transversal aos módulos. */
export const zonasPorTipologia = tip => dados.zonas.filter(z => z.Tipologia === tip && z.Ativa !== false);

/** Turno (objeto) pelo TurnoID. */
export const turnoPorId = id => dados.turnos.find(t => t.Title === id) || null;

/** Recarrega só as Zonas (depois de criar/editar uma). */
export async function recarregarZonas() {
  dados.zonas = await graph.lerLista("Zonas");
}
