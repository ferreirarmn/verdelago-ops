// ============================================================================
// hsk.js — Módulo Housekeeping (alojamento + limpeza)
// ----------------------------------------------------------------------------
// Esqueleto funcional: arranca, mostra as zonas de alojamento e prepara o
// terreno para o mapa de camas e as escalas de limpeza (Fase 8).
// ============================================================================

import { el } from "../core/ui.js";
import { zonasDoModulo } from "../core/store.js";

export const moduloHSK = {
  id: "hsk",
  nome: "Housekeeping",
  icone: "🛏️",
  modulo: "HSK",          // valor da coluna Modulo na Lista Zonas
  tipologia: "Alojamento", // tipologia de zona que este módulo usa

  async init(core) {
    // Carregamentos específicos do HSK (ex.: Lista Camas) entram aqui na Fase 8.
  },

  render(core, alvo) {
    const zonas = zonasDoModulo("HSK");
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "🛏️ Housekeeping"),
        el("p", { class: "mut" }, "Agrupamentos de alojamento e escalas de limpeza.")
      ),
      el("div", { class: "mod-corpo" },
        zonas.length
          ? el("ul", { class: "lista-zonas" },
              ...zonas.map(z => el("li", {},
                el("strong", {}, z.Nome),
                el("span", { class: "tag" }, z.Tipologia || "—"))))
          : el("p", { class: "vazio" },
              "Ainda não há zonas de alojamento. Cria a primeira no separador Zonas.")
      ),
      el("div", { class: "mod-nota" },
        "Próximo (Fase 8): mapa de camas ligado à Lista Camas e escalas por zona.")
    );
  }
};
