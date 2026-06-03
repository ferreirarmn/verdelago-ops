// ============================================================================
// hsk.js — Módulo Housekeeping (departamento de limpeza)
// ----------------------------------------------------------------------------
// Nota: o alojamento/camas NÃO pertence ao HSK — é o módulo "Alojamento",
// transversal. Aqui virão Pessoas (do HSK), Presenças e Escalas de limpeza.
// (Em construção — próximo passo.)
// ============================================================================

import { el } from "../core/ui.js";
import { dados, funcaoPorId } from "../core/store.js";

// pessoas cujo departamento da função é HSK
function pessoasHSK() {
  return dados.pessoas.filter(p => {
    const f = funcaoPorId(p.FuncaoID);
    return f && (f.Modulo === "HSK" || (f.Departamento || "").toUpperCase().includes("HOUSEKEEPING"));
  });
}

export const moduloHSK = {
  id: "hsk",
  nome: "Housekeeping",
  icone: "🧹",
  modulo: "HSK",

  async init() {},

  render(core, alvo) {
    const n = pessoasHSK().length;
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "🧹 Housekeeping"),
        el("p", { class: "mut" }, "Departamento de limpeza: pessoas, presenças e escalas.")),
      el("div", { class: "mod-corpo" },
        el("p", {}, "Identifiquei " + n + " pessoas no departamento de Housekeeping.")),
      el("div", { class: "mod-nota" },
        "Em construção: Pessoas (acrescentar/editar/retirar), Presenças e Escalas de limpeza. " +
        "O alojamento passou a ser um módulo próprio (separador Alojamento).")
    );
  }
};
