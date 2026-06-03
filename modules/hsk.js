// ============================================================================
// hsk.js — Módulo Housekeeping: MAPA DE CAMAS (Fase 8)
// ----------------------------------------------------------------------------
// Lê a Lista "Camas", agrupa por edifício (Zona) e por quarto, e mostra quem
// ocupa cada cama (nome vindo da ficha da Pessoa, pelo PessoaID).
// Permite ALOCAR e LIBERTAR camas, gravando direto no SharePoint.
//
// Lê o ZonaID de forma defensiva: a coluna é de Pesquisa, por isso o Graph
// pode devolvê-la como texto ("Z02"), como objeto, ou como ...LookupId.
// ============================================================================

import { el, toast, modal, badge } from "../core/ui.js";
import { dados, nomePessoa, pessoaPorId, funcaoPorId, zonasDoModulo } from "../core/store.js";
import * as graph from "../core/graph.js";

// estado interno do módulo
const M = { camas: [], zonaSel: null, carregado: false };

// injeta os estilos do módulo uma única vez
function garantirEstilos() {
  if (document.getElementById("hsk-css")) return;
  const css = `
  .hsk-edificios{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 22px}
  .hsk-edif{border:1px solid var(--line);background:#fff;border-radius:10px;padding:9px 14px;cursor:pointer;font-size:14px}
  .hsk-edif:hover{background:var(--soft)}
  .hsk-edif.ativo{background:var(--teal);color:#fff;border-color:var(--teal)}
  .hsk-edif .cont{opacity:.7;font-size:12px;margin-left:6px}
  .hsk-quarto{margin:18px 0}
  .hsk-quarto h4{margin:0 0 8px;color:var(--teal);font-size:15px}
  .hsk-camas{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
  .cama{border:1px solid var(--line);border-radius:11px;padding:11px 13px;cursor:pointer;background:#fff;transition:.12s;border-left:5px solid var(--line)}
  .cama:hover{box-shadow:0 4px 12px rgba(14,92,99,.12)}
  .cama .topo{display:flex;align-items:center;gap:8px;margin-bottom:3px}
  .cama .n{font-weight:700;font-size:13px;color:var(--mut)}
  .cama .est{margin-left:auto;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:10px}
  .cama .pessoa{font-weight:600;font-size:14.5px;color:var(--ink)}
  .cama .funcao{font-size:12px;color:var(--mut)}
  .cama.ocupada{border-left-color:var(--teal2)} .cama.ocupada .est{background:#e8faf4;color:var(--teal)}
  .cama.livre{border-left-color:#c9d6d4} .cama.livre .est{background:#eef2f1;color:var(--mut)}
  .cama.por-chegar{border-left-color:var(--amber)} .cama.por-chegar .est{background:#fbeede;color:var(--amber)}
  .cama.bloqueada{border-left-color:#b34b4b} .cama.bloqueada .est{background:#f7e3e3;color:#b34b4b}
  .hsk-resumo{font-size:13px;color:var(--mut);margin-bottom:6px}
  .pp-busca{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;margin-bottom:10px;font-size:14px}
  .pp-lista{max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:9px}
  .pp-item{padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--line)}
  .pp-item:hover{background:var(--soft)}
  .pp-item small{color:var(--mut)}
  .pp-acoes{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
  .pp-acoes .btn-sec{background:var(--soft);color:var(--teal-d);border:1px solid var(--line);border-radius:9px;padding:9px 14px;font-weight:600;cursor:pointer}
  `;
  document.head.append(el("style", { id: "hsk-css", html: css }));
}

// ---- resolução defensiva do ZonaID de uma cama ----
function zonaIdDaCama(c) {
  const v = c.ZonaID;
  if (typeof v === "string" && v) return v;                 // texto simples "Z02"
  if (v && typeof v === "object") return v.LookupValue || v.Value || "";  // objeto lookup
  if (c.ZonaIDLookupId != null) {                            // ...LookupId -> mapear via zonas
    const z = dados.zonas.find(z => String(z._id) === String(c.ZonaIDLookupId));
    return z ? z.Title : "";
  }
  return "";
}

function classeEstado(est) {
  const e = (est || "").toLowerCase();
  if (e.includes("ocup")) return "ocupada";
  if (e.includes("cheg")) return "por-chegar";
  if (e.includes("bloq")) return "bloqueada";
  return "livre";
}

// camas de uma zona (edifício)
function camasDaZona(zonaId) {
  return M.camas.filter(c => zonaIdDaCama(c) === zonaId);
}

export const moduloHSK = {
  id: "hsk",
  nome: "Housekeeping",
  icone: "🛏️",
  modulo: "HSK",
  tipologia: "Alojamento",

  async init() {
    garantirEstilos();
    if (!M.carregado) {
      M.camas = await graph.lerLista("Camas");
      M.carregado = true;
    }
  },

  render(core, alvo) {
    const edificios = zonasDoModulo("HSK"); // zonas do módulo (alojamentos)
    if (!M.zonaSel && edificios.length) M.zonaSel = edificios[0].Title;

    const self = this;
    const seletor = el("div", { class: "hsk-edificios" },
      ...edificios.map(z => el("div", {
        class: "hsk-edif" + (z.Title === M.zonaSel ? " ativo" : ""),
        onclick: () => { M.zonaSel = z.Title; self.render(core, alvo); }
      }, z.Nome,
        el("span", { class: "cont" }, "" + camasDaZona(z.Title).length + " camas")))
    );

    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "🛏️ Housekeeping — Mapa de camas"),
        el("p", { class: "mut" }, "Escolhe um alojamento; clica numa cama para alocar ou libertar.")),
      seletor,
      desenharMapa(self, core, alvo)
    );
  }
};

function desenharMapa(self, core, alvo) {
  if (!M.zonaSel) return el("p", { class: "vazio" }, "Sem alojamentos. Cria zonas HSK no separador Zonas.");
  const camas = camasDaZona(M.zonaSel);
  if (!camas.length) return el("p", { class: "vazio" }, "Este alojamento ainda não tem camas na Lista Camas.");

  const ocup = camas.filter(c => classeEstado(c.Estado) === "ocupada").length;
  const resumo = el("div", { class: "hsk-resumo" },
    camas.length + " camas · " + ocup + " ocupadas · " + (camas.length - ocup) + " disponíveis");

  // agrupar por quarto
  const porQuarto = {};
  for (const c of camas) {
    const q = c.Quarto || "—";
    (porQuarto[q] = porQuarto[q] || []).push(c);
  }
  const ordemQuartos = Object.keys(porQuarto)
    .sort((a, b) => String(a).localeCompare(String(b), "pt", { numeric: true }));

  const cont = el("div", {});
  cont.append(resumo);
  for (const q of ordemQuartos) {
    const camasOrd = porQuarto[q].sort((a, b) =>
      String(a.Numero ?? "").localeCompare(String(b.Numero ?? ""), "pt", { numeric: true }));
    const grupo = el("div", { class: "hsk-quarto" },
      el("h4", {}, "Quarto " + q),
      el("div", { class: "hsk-camas" }, ...camasOrd.map(c => cartaoCama(self, c, core, alvo))));
    cont.append(grupo);
  }
  return cont;
}

function cartaoCama(self, c, core, alvo) {
  const cls = classeEstado(c.Estado);
  const pid = c.PessoaID;
  const pessoa = pid ? pessoaPorId(pid) : null;
  const funcaoNome = pessoa ? (funcaoPorId(pessoa.FuncaoID)?.Nome || pessoa.FuncaoID || "") : "";

  return el("div", {
    class: "cama " + cls,
    onclick: () => abrirEditorCama(self, c, core, alvo)
  },
    el("div", { class: "topo" },
      el("span", { class: "n" }, "Cama " + (c.Numero ?? "?")),
      el("span", { class: "est" }, c.Estado || "Livre")),
    pessoa
      ? el("div", {},
          el("div", { class: "pessoa" }, nomePessoa(pid)),
          funcaoNome ? el("div", { class: "funcao" }, funcaoNome) : null,
          c.DataChegada ? el("div", { class: "funcao" }, "Chegada: " + String(c.DataChegada).slice(0, 10)) : null)
      : el("div", { class: "funcao" }, "— livre —")
  );
}

// ---- editor: alocar / libertar ----
function abrirEditorCama(self, c, core, alvo) {
  const corpo = el("div", {});
  const titulo = "Cama " + (c.Numero ?? "?") + " · Quarto " + (c.Quarto || "—");

  const ocupanteAtual = c.PessoaID
    ? el("p", {}, "Ocupada por ", el("strong", {}, nomePessoa(c.PessoaID)))
    : el("p", { class: "mut" }, "Atualmente livre.");

  const busca = el("input", { class: "pp-busca", placeholder: "Procurar pessoa para alocar…" });
  const lista = el("div", { class: "pp-lista" });

  function pintarLista(filtro = "") {
    const f = filtro.trim().toLowerCase();
    const res = dados.pessoas
      .filter(p => !f || (p.Nome || "").toLowerCase().includes(f))
      .slice(0, 60);
    if (!res.length) { lista.replaceChildren(el("div", { class: "pp-item mut" }, "Sem resultados.")); return; }
    lista.replaceChildren(...res.map(p =>
      el("div", { class: "pp-item", onclick: () => alocar(p.Title) },
        el("div", {}, p.Nome),
        el("small", {}, (funcaoPorId(p.FuncaoID)?.Nome) || p.FuncaoID || ""))));
  }
  busca.addEventListener("input", () => pintarLista(busca.value));
  pintarLista();

  let fechar;

  async function gravar(campos, msg) {
    try {
      badge("syncing");
      await graph.atualizarItem("Camas", c._id, campos);
      Object.assign(c, campos);
      badge("connected");
      toast(msg, "info");
      fechar();
      self.render(core, alvo);
    } catch (e) {
      badge("error", e.message);
      toast("Falhou: " + e.message, "error");
    }
  }
  function alocar(pessoaId) {
    gravar({ PessoaID: pessoaId, Estado: "Ocupada" }, "Cama alocada a " + nomePessoa(pessoaId));
  }

  const acoes = el("div", { class: "pp-acoes" },
    el("button", { class: "btn-sec", onclick: () => gravar({ Estado: "Por chegar" }, "Marcada como Por chegar") }, "Marcar por chegar"),
    c.PessoaID
      ? el("button", { class: "btn-sec", onclick: () => gravar({ PessoaID: "", Estado: "Livre" }, "Cama libertada") }, "Libertar cama")
      : null,
    el("button", { class: "btn-sec", onclick: () => gravar({ Estado: "Bloqueada" }, "Cama bloqueada") }, "Bloquear")
  );

  corpo.append(ocupanteAtual, busca, lista, acoes);
  fechar = modal(titulo, corpo);
}
