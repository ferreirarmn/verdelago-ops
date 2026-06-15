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

const M = { camas: [], zonaSel: null, carregado: false, cols: null };

// nomes internos reais das colunas da Lista Camas (display != interno no SharePoint)
const normc = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
function colInterna(logico) {
  if (!M.cols) return logico;
  const alvo = normc(logico);
  const c = M.cols.find(x => normc(x.displayName) === alvo || normc(x.name) === alvo);
  return c ? c.name : logico;
}
// traduz um objeto de campos (chaves lógicas) para os nomes internos
function camposInternos(campos) {
  const out = {};
  for (const [k, v] of Object.entries(campos)) out[colInterna(k)] = v;
  return out;
}

function garantirEstilos() {
  // Estilos centralizados em estilo.css (design system v2) — nada a injetar.
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
  const e = normc(est);
  if (e.includes("ocupada") || e === "ocupado") return "ocupada";
  if (e.includes("cheg")) return "por-chegar";
  if (e.includes("bloq") || e.includes("naoocupar") || e.includes("naoocup")) return "bloqueada";
  if (e.includes("adicional")) return "adicional";
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
    if (!M.carregado) {
      M.camas = await graph.lerLista("Camas");
      try { M.cols = await graph.colunasDaLista("Camas"); } catch { M.cols = null; }
      M.carregado = true;
    }
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
      await graph.atualizarItem("Camas", c._id, camposInternos(campos));
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
