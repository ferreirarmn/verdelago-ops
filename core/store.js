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

/** Zonas de um módulo (ex.: "F&B"), só as ativas. */
export const zonasDoModulo = mod => dados.zonas.filter(z => z.Modulo === mod && z.Ativa !== false);

/** Turno (objeto) pelo TurnoID. */
export const turnoPorId = id => dados.turnos.find(t => t.Title === id) || null;

/** Recarrega só as Zonas (depois de criar/editar uma). */
export async function recarregarZonas() {
  dados.zonas = await graph.lerLista("Zonas");
}
