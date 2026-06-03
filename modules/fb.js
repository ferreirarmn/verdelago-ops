// ============================================================================
// fb.js — Módulo F\&B
// ----------------------------------------------------------------------------
// Esqueleto funcional: arranca e mostra as zonas do módulo. As vistas próprias
// (escalas, painéis) entram na Fase 8, reaproveitando shared/escalas.js.
// ============================================================================

import { el } from "../core/ui.js";
import { zonasDoModulo } from "../core/store.js";

export const moduloFB = {
  id: "fb",
  nome: "F\&B",
  icone: "🍽️",
  modulo: "F\&B",
  tipologia: "Outlet",

  async init(core) {
    // Carregamentos específicos do módulo entram aqui na Fase 8.
  },

  render(core, alvo) {
    const zonas = zonasDoModulo("F\&B");
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "🍽️ F\&B"),
        el("p", { class: "mut" }, "outlets e escalas por turno.")
      ),
      el("div", { class: "mod-corpo" },
        zonas.length
          ? el("ul", { class: "lista-zonas" },
              ...zonas.map(z => el("li", {},
                el("strong", {}, z.Nome),
                el("span", { class: "tag" }, z.Tipologia || "—"))))
          : el("p", { class: "vazio" },
              "Ainda não há zonas deste módulo. Cria a primeira no separador Zonas.")
      ),
      el("div", { class: "mod-nota" },
        "Próximo (Fase 8): painel de cobertura por outlet e turno.")
    );
  }
};
