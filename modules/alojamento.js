// ============================================================================
// alojamento.js — Módulo ALOJAMENTO (transversal, não pertence ao HSK)
// ----------------------------------------------------------------------------
// Gere a disponibilidade de camas para trabalhadores do Verdelago, de qualquer
// departamento. Os edifícios são as Zonas de Tipologia "Alojamento".
// Aloja/desaloja qualquer colaborador; assinala quem já está alojado noutro
// sítio para evitar duplicações.
// ============================================================================

import { el, toast, modal, badge } from "../core/ui.js";
import { dados, nomePessoa, pessoaPorId, funcaoPorId, zonasPorTipologia } from "../core/store.js";
import * as graph from "../core/graph.js";

const M = { camas: [], zonaSel: null, carregado: false };

function garantirEstilos() {
  if (document.getElementById("aloj-css")) return;
  const css = `
  .aloj-edificios{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 18px}
  .aloj-edif{border:1px solid var(--line);background:#fff;border-radius:10px;padding:9px 14px;cursor:pointer;font-size:14px}
  .aloj-edif:hover{background:var(--soft)}
  .aloj-edif.ativo{background:var(--teal);color:#fff;border-color:var(--teal)}
  .aloj-edif .cont{opacity:.7;font-size:12px;margin-left:6px}
  .aloj-kpis{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 18px}
  .kpi{background:#fff;border:1px solid var(--line);border-radius:11px;padding:10px 16px;min-width:120px}
  .kpi .v{font-size:22px;font-weight:700;color:var(--teal)}
  .kpi .l{font-size:12px;color:var(--mut)}
  .kpi.livres .v{color:var(--teal2)}
  .aloj-quarto{margin:18px 0}
  .aloj-quarto h4{margin:0 0 8px;color:var(--teal);font-size:15px}
  .aloj-camas{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
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
  .pp-busca{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;margin-bottom:10px;font-size:14px}
  .pp-lista{max-height:300px;overflow:auto;border:1px solid var(--line);border-radius:9px}
  .pp-item{padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px}
  .pp-item:hover{background:var(--soft)}
  .pp-item .meta{margin-left:auto;font-size:11px}
  .pp-item .ja{color:var(--amber);font-weight:600}
  .pp-item small{color:var(--mut)}
  .pp-acoes{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
  .pp-acoes .btn-sec{background:var(--soft);color:var(--teal-d);border:1px solid var(--line);border-radius:9px;padding:9px 14px;font-weight:600;cursor:pointer}
  `;
  document.head.append(el("style", { id: "aloj-css", html: css }));
}

// leitura defensiva do ZonaID (coluna de Pesquisa)
function zonaIdDaCama(c) {
  const v = c.ZonaID;
  if (typeof v === "string" && v) return v;
  if (v && typeof v === "object") return v.LookupValue || v.Value || "";
  if (c.ZonaIDLookupId != null) {
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
function camasDaZona(zonaId) { return M.camas.filter(c => zonaIdDaCama(c) === zonaId); }

// onde está alojada uma pessoa (se estiver) — devolve {cama, zonaNome} ou null
function alojamentoDaPessoa(pessoaId, exceto) {
  const c = M.camas.find(c => c.PessoaID === pessoaId && c !== exceto);
  if (!c) return null;
  const z = dados.zonas.find(z => z.Title === zonaIdDaCama(c));
  return { cama: c, zonaNome: z ? z.Nome : zonaIdDaCama(c) };
}

export const moduloAlojamento = {
  id: "alojamento",
  nome: "Alojamento",
  icone: "🏠",
  tipologia: "Alojamento",

  async init() {
    garantirEstilos();
    if (!M.carregado) { M.camas = await graph.lerLista("Camas"); M.carregado = true; }
  },

  render(core, alvo) {
    const edificios = zonasPorTipologia("Alojamento");
    if (!M.zonaSel && edificios.length) M.zonaSel = edificios[0].Title;
    const self = this;

    const seletor = el("div", { class: "aloj-edificios" },
      ...edificios.map(z => el("div", {
        class: "aloj-edif" + (z.Title === M.zonaSel ? " ativo" : ""),
        onclick: () => { M.zonaSel = z.Title; self.render(core, alvo); }
      }, z.Nome, el("span", { class: "cont" }, "" + camasDaZona(z.Title).length + " camas")))
    );

    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "Alojamento de trabalhadores"),
        el("p", { class: "mut" }, "Disponibilidade de camas para colaboradores do Verdelago. Clica numa cama para alojar ou libertar.")),
      kpisGlobais(),
      seletor,
      desenharMapa(self, core, alvo)
    );
  }
};

function kpisGlobais() {
  const total = M.camas.length;
  const ocup = M.camas.filter(c => classeEstado(c.Estado) === "ocupada").length;
  const chegar = M.camas.filter(c => classeEstado(c.Estado) === "por-chegar").length;
  const bloq = M.camas.filter(c => classeEstado(c.Estado) === "bloqueada").length;
  const livres = total - ocup - chegar - bloq;
  const kpi = (v, l, cls = "") => el("div", { class: "kpi " + cls }, el("div", { class: "v" }, "" + v), el("div", { class: "l" }, l));
  return el("div", { class: "aloj-kpis" },
    kpi(total, "camas totais"),
    kpi(ocup, "ocupadas"),
    kpi(livres, "livres", "livres"),
    kpi(chegar, "por chegar"),
    kpi(bloq, "bloqueadas"));
}

function desenharMapa(self, core, alvo) {
  if (!M.zonaSel) return el("p", { class: "vazio" }, "Sem edifícios de alojamento. Cria zonas de Tipologia \"Alojamento\" no separador Zonas.");
  const camas = camasDaZona(M.zonaSel);
  if (!camas.length) return el("p", { class: "vazio" }, "Este edifício ainda não tem camas na Lista Camas.");

  const porQuarto = {};
  for (const c of camas) { const q = c.Quarto || "—"; (porQuarto[q] = porQuarto[q] || []).push(c); }
  const ordem = Object.keys(porQuarto).sort((a, b) => String(a).localeCompare(String(b), "pt", { numeric: true }));

  const cont = el("div", {});
  for (const q of ordem) {
    const camasOrd = porQuarto[q].sort((a, b) =>
      String(a.Numero ?? "").localeCompare(String(b.Numero ?? ""), "pt", { numeric: true }));
    cont.append(el("div", { class: "aloj-quarto" },
      el("h4", {}, "Quarto " + q),
      el("div", { class: "aloj-camas" }, ...camasOrd.map(c => cartao(self, c, core, alvo)))));
  }
  return cont;
}

function cartao(self, c, core, alvo) {
  const cls = classeEstado(c.Estado);
  const pessoa = c.PessoaID ? pessoaPorId(c.PessoaID) : null;
  const funcaoNome = pessoa ? (funcaoPorId(pessoa.FuncaoID)?.Nome || pessoa.FuncaoID || "") : "";
  return el("div", { class: "cama " + cls, onclick: () => editor(self, c, core, alvo) },
    el("div", { class: "topo" },
      el("span", { class: "n" }, "Cama " + (c.Numero ?? "?")),
      el("span", { class: "est" }, c.Estado || "Livre")),
    pessoa
      ? el("div", {},
          el("div", { class: "pessoa" }, nomePessoa(c.PessoaID)),
          funcaoNome ? el("div", { class: "funcao" }, funcaoNome) : null,
          c.DataChegada ? el("div", { class: "funcao" }, "Chegada: " + String(c.DataChegada).slice(0, 10)) : null)
      : el("div", { class: "funcao" }, "— livre —"));
}

function editor(self, c, core, alvo) {
  const corpo = el("div", {});
  const titulo = "Cama " + (c.Numero ?? "?") + " · Quarto " + (c.Quarto || "—");
  const atual = c.PessoaID
    ? el("p", {}, "Ocupada por ", el("strong", {}, nomePessoa(c.PessoaID)))
    : el("p", { class: "mut" }, "Atualmente livre.");

  const busca = el("input", { class: "pp-busca", placeholder: "Procurar colaborador para alojar…" });
  const lista = el("div", { class: "pp-lista" });

  function pintar(filtro = "") {
    const f = filtro.trim().toLowerCase();
    const res = dados.pessoas.filter(p => !f || (p.Nome || "").toLowerCase().includes(f)).slice(0, 60);
    if (!res.length) { lista.replaceChildren(el("div", { class: "pp-item mut" }, "Sem resultados.")); return; }
    lista.replaceChildren(...res.map(p => {
      const ja = alojamentoDaPessoa(p.Title, c);
      return el("div", { class: "pp-item", onclick: () => alojar(p.Title, ja) },
        el("div", {},
          el("div", {}, p.Nome),
          el("small", {}, (funcaoPorId(p.FuncaoID)?.Nome) || p.FuncaoID || "")),
        ja ? el("span", { class: "meta ja" }, "já em " + ja.zonaNome) : el("span", { class: "meta", style: "color:var(--mut)" }, "sem cama"));
    }));
  }
  busca.addEventListener("input", () => pintar(busca.value));
  pintar();

  let fechar;
  async function gravar(campos, msg) {
    try {
      badge("syncing");
      await graph.atualizarItem("Camas", c._id, campos);
      Object.assign(c, campos);
      badge("connected"); toast(msg, "info"); fechar(); self.render(core, alvo);
    } catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); }
  }
  function alojar(pessoaId, ja) {
    const fazer = () => gravar({ PessoaID: pessoaId, Estado: "Ocupada" }, "Cama alojada a " + nomePessoa(pessoaId));
    if (ja) {
      if (confirm(nomePessoa(pessoaId) + " já está alojado em " + ja.zonaNome + ". Alojar aqui à mesma? (continua nas duas camas)")) fazer();
    } else fazer();
  }

  const acoes = el("div", { class: "pp-acoes" },
    el("button", { class: "btn-sec", onclick: () => gravar({ Estado: "Por chegar" }, "Marcada como Por chegar") }, "Marcar por chegar"),
    c.PessoaID ? el("button", { class: "btn-sec", onclick: () => gravar({ PessoaID: "", Estado: "Livre" }, "Cama libertada") }, "Libertar cama") : null,
    el("button", { class: "btn-sec", onclick: () => gravar({ Estado: "Bloqueada" }, "Cama bloqueada") }, "Bloquear"));

  corpo.append(atual, busca, lista, acoes);
  fechar = modal(titulo, corpo);
}
