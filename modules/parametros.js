// ============================================================================
// parametros.js — Parâmetros de dimensionamento (HSK e F&B)
// ----------------------------------------------------------------------------
// Afinam as necessidades calculadas nas Escalas a partir das room nights.
//  HSK: minutos por tipologia × tarefa (Estadia/Entrada/Turndown/Valet),
//       mix de tipologias, horas produtivas e mínimos/fixos.
//  F&B: covers por pessoa, por outlet (já inclui o horário) e área FOH/BOH/Copa.
// Persistência: lista SharePoint "Parametros" (Title=chave, Valor=JSON).
// Se a lista não existir, usa os valores embebidos (escala_base/escala_fb) e
// avisa. Guardar grava de volta. As Escalas leem daqui (com o mesmo fallback).
// ============================================================================

import { el, toast, badge, modal } from "../core/ui.js";
import * as graph from "../core/graph.js";

const M = { hsk: null, fb: null, fonte: "—", erro: null, tab: "hsk", listaOk: false };

// ---- carregamento partilhado (usado também pelas Escalas) ----
export async function carregarParametros() {
  // 1) defaults embebidos
  let hsk = null, fb = null;
  try { const b = await (await fetch("escala_base.json?" + Date.now())).json(); hsk = b.config_hsk; } catch {}
  try { fb = await (await fetch("escala_fb.json?" + Date.now())).json(); } catch {}
  let fonte = "valores base (ficheiros)", listaOk = false;
  // 2) tentar sobrepor com a lista SharePoint "Parametros"
  try {
    const itens = await graph.lerLista("Parametros");
    listaOk = true;
    const byKey = {};
    for (const it of itens) byKey[String(it.Title).toLowerCase()] = it;
    if (byKey["hsk"]?.Valor) { try { hsk = { ...hsk, ...JSON.parse(byKey["hsk"].Valor) }; fonte = "lista Parametros"; } catch {} }
    if (byKey["fb"]?.Valor) { try { const o = JSON.parse(byKey["fb"].Valor); fb = { ...fb, ...o }; fonte = "lista Parametros"; } catch {} }
  } catch { /* lista ainda não existe: usa defaults */ }
  return { hsk, fb, fonte, listaOk };
}

function garantirEstilos() {
  if (document.getElementById("par-css")) return;
  const css = `
  .par-tabs{display:flex;gap:6px;margin:8px 0 20px;border-bottom:1px solid var(--line)}
  .par-tab{background:none;border:none;padding:10px 18px;font-size:14px;color:var(--mut);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-1px}
  .par-tab.ativo{color:var(--teal);border-bottom-color:var(--teal);font-weight:600}
  .par-fonte{display:flex;align-items:center;gap:8px;background:var(--softer);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:16px;font-size:13px;color:var(--teal-d)}
  .par-sec{margin:18px 0}
  .par-sec h3{font-family:var(--serif);font-size:17px;color:var(--ink);margin:0 0 10px;font-weight:600}
  .par-sec p.aj{color:var(--mut);font-size:13px;margin:-4px 0 12px}
  .par-tab-mat{border-collapse:separate;border-spacing:0;font-size:13.5px;background:var(--card);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh-1)}
  .par-tab-mat th{background:transparent;text-align:center;padding:10px 8px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:600;border-bottom:1px solid var(--line)}
  .par-tab-mat th:first-child,.par-tab-mat td:first-child{text-align:left;font-weight:600;color:var(--ink)}
  .par-tab-mat td{padding:6px 8px;border-top:1px solid var(--line-2);text-align:center}
  .par-in{width:64px;padding:7px 8px;border:1px solid var(--line);border-radius:8px;font-size:13.5px;text-align:right;background:var(--card);color:var(--ink)}
  .par-in:focus{border-color:var(--teal2);box-shadow:0 0 0 3px rgba(23,155,143,.15);outline:none}
  .par-mix{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;max-width:760px}
  .par-mix label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:600;display:block;margin-bottom:4px}
  .par-mixsum{font-size:13px;margin-top:8px}
  .par-fixos{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;max-width:760px}
  .par-fixos .campoF{background:var(--card);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 12px}
  .par-fixos .campoF label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--faint);font-weight:600;display:block;margin-bottom:6px}
  .par-acoes{display:flex;gap:10px;align-items:center;margin:22px 0 4px}
  .btn{background:var(--teal);color:#fff;border:none;border-radius:var(--r-sm);padding:11px 22px;font-weight:600;cursor:pointer}
  .btn:hover{background:var(--teal-d)} .btn:disabled{opacity:.55}
  .btn-sec{background:var(--card);color:var(--teal-d);border:1px solid var(--line);border-radius:var(--r-sm);padding:10px 16px;font-weight:600;cursor:pointer}
  `;
  document.head.append(el("style", { id: "par-css", html: css }));
}

const HSK_TAREFAS = ["Stayover", "Entrada", "Turndown", "Valet"];

export const moduloParametros = {
  id: "parametros",
  nome: "Parâmetros",
  icone: "parametros",

  async init() {
    garantirEstilos();
    const r = await carregarParametros();
    M.hsk = r.hsk; M.fb = r.fb; M.fonte = r.fonte; M.listaOk = r.listaOk;
    if (!M.hsk) M.erro = "Não consegui ler os parâmetros base (escala_base.json).";
  },

  render(core, alvo) {
    const self = this;
    if (M.erro) { alvo.replaceChildren(el("div", { class: "mod-cab" }, el("h2", {}, "Parâmetros")), el("div", { class: "mod-nota" }, M.erro)); return; }

    const tabBtn = (k, t) => el("button", { class: "par-tab" + (M.tab === k ? " ativo" : ""), onclick: () => { M.tab = k; self.render(core, alvo); } }, t);
    const fonte = el("div", { class: "par-fonte" },
      el("span", {}, "A editar a partir de: "), el("strong", {}, M.fonte),
      M.listaOk ? null : el("span", { class: "mut", style: "margin-left:auto;font-size:12px" }, "Lista \u201cParametros\u201d ainda não existe — ao guardar, crio os registos (precisas da lista criada)."));

    const corpo = el("div", {}, M.tab === "hsk" ? vistaHSK(self, core, alvo) : vistaFB(self, core, alvo));

    alvo.replaceChildren(
      el("div", { class: "mod-cab" }, el("h2", {}, "Parâmetros"),
        el("p", { class: "mut" }, "Afina os referenciais que calculam as necessidades nas Escalas a partir das room nights.")),
      el("div", { class: "par-tabs" }, tabBtn("hsk", "Housekeeping"), tabBtn("fb", "F&B")),
      fonte, corpo);
  }
};

// ----------------------------- HSK -----------------------------
function vistaHSK(self, core, alvo) {
  const h = M.hsk;
  const tipos = h.tipos || {};
  const tnomes = Object.keys(tipos);

  // matriz de minutos
  const head = el("tr", {}, el("th", {}, "Tipologia"), ...HSK_TAREFAS.map(t => el("th", {}, t)));
  const linhas = tnomes.map(tp => el("tr", {},
    el("td", {}, tp),
    ...HSK_TAREFAS.map(tarefa => el("td", {}, el("input", {
      class: "par-in", type: "number", min: "0", step: "1", value: "" + (tipos[tp][tarefa] ?? 0),
      onchange: e => { tipos[tp][tarefa] = Number(e.target.value) || 0; }
    })))));
  const matriz = el("table", { class: "par-tab-mat" }, el("thead", {}, head), el("tbody", {}, ...linhas));

  // mix de tipologias
  const mix = h.mix_tipologias || {};
  const somaMix = el("span", {});
  const atualizarSoma = () => { const s = Object.values(mix).reduce((a, b) => a + Number(b || 0), 0); somaMix.textContent = "Soma: " + (s * 100).toFixed(0) + "% " + (Math.abs(s - 1) < 0.005 ? "✓" : "(deve dar 100%)"); somaMix.style.color = Math.abs(s - 1) < 0.005 ? "var(--teal)" : "var(--amber)"; };
  const mixGrid = el("div", { class: "par-mix" }, ...tnomes.map(tp => el("div", {},
    el("label", {}, tp),
    el("input", { class: "par-in", style: "width:100%", type: "number", min: "0", max: "1", step: "0.01", value: "" + (mix[tp] ?? 0),
      onchange: e => { mix[tp] = Number(e.target.value) || 0; atualizarSoma(); } }))));
  atualizarSoma();

  // produtividade + fixos
  const fx = h.fixos || {};
  const campoNum = (obj, k, label, step = "1") => el("div", { class: "campoF" }, el("label", {}, label),
    el("input", { class: "par-in", style: "width:100%", type: "number", step, value: "" + (obj[k] ?? 0), onchange: e => { obj[k] = Number(e.target.value) || 0; } }));
  const fixos = el("div", { class: "par-fixos" },
    campoNum(h, "horas_produtivas", "Horas produtivas / turno", "0.1"),
    campoNum(fx, "areas", "Áreas comuns (fixo/dia)"),
    campoNum(fx, "lavandaria", "Lavandaria (fixo/dia)"),
    campoNum(fx, "turndown_cob", "Cobertura turndown (0–1)", "0.05"),
    campoNum(fx, "min_andares", "Mín. andares"),
    campoNum(fx, "min_valet", "Mín. valete"),
    campoNum(fx, "min_gov", "Mín. governanta"));

  const btn = el("button", { class: "btn", onclick: () => guardar("hsk", { tipos, mix_tipologias: mix, horas_produtivas: h.horas_produtivas, fixos: fx }, btn, self, core, alvo) }, "Guardar parâmetros HSK");

  return el("div", {},
    el("div", { class: "par-sec" }, el("h3", {}, "Minutos de limpeza por tipologia e tarefa"),
      el("p", { class: "aj" }, "Tempo (min) por unidade. Estadia = ocupado; Entrada = saída/check-in; Turndown = abertura de cama; Valet = serviço de valete."), matriz),
    el("div", { class: "par-sec" }, el("h3", {}, "Mix de tipologias"),
      el("p", { class: "aj" }, "Peso de cada tipologia no conjunto ocupado (afina a média de minutos por quarto). Mais tarde podes substituir pelo número real de casas por tipologia."), mixGrid, el("div", { class: "par-mixsum" }, somaMix)),
    el("div", { class: "par-sec" }, el("h3", {}, "Produtividade e mínimos"), fixos),
    el("div", { class: "par-acoes" }, btn, el("span", { class: "mut", style: "font-size:13px" }, "As Escalas (HSK) recalculam com estes valores.")));
}

// ----------------------------- F&B -----------------------------
function vistaFB(self, core, alvo) {
  if (!M.fb || !M.fb.ratios) return el("div", { class: "mod-nota" }, "Sem rácios F&B (falta o escala_fb.json).");
  const ratios = M.fb.ratios;
  const AREAS = ["FOH Serviço", "BOH Cozinha", "BOH Copa"];
  const head = el("tr", {}, el("th", {}, "Outlet (inclui horário)"), ...AREAS.map(a => el("th", {}, a)));
  const linhas = Object.keys(ratios).map(o => el("tr", {},
    el("td", {}, o),
    ...AREAS.map(a => el("td", {}, el("input", {
      class: "par-in", type: "number", min: "0", step: "1", value: "" + (ratios[o][a] ?? 0),
      onchange: e => { ratios[o][a] = Number(e.target.value) || 0; }
    })))));
  const matriz = el("table", { class: "par-tab-mat" }, el("thead", {}, head), el("tbody", {}, ...linhas));
  const btn = el("button", { class: "btn", onclick: () => guardar("fb", { ratios }, btn, self, core, alvo) }, "Guardar parâmetros F&B");
  return el("div", {},
    el("div", { class: "par-sec" }, el("h3", {}, "Covers por pessoa, por outlet e área"),
      el("p", { class: "aj" }, "Quantos covers/dia cobre uma pessoa em cada área. Valor mais baixo = mais pessoas. Cada linha é um outlet num horário (ex.: Salicórnia PA = pequeno-almoço). 0 = não aplicável."), matriz),
    el("div", { class: "par-acoes" }, btn, el("span", { class: "mut", style: "font-size:13px" }, "As Escalas (F&B) recalculam a cobertura com estes rácios.")));
}

// ----------------------------- guardar -----------------------------
async function guardar(chave, valorObj, btn, self, core, alvo) {
  btn.disabled = true; badge("syncing");
  try {
    let itens = [];
    try { itens = await graph.lerLista("Parametros"); }
    catch (e) { throw new Error("Não encontro a lista \u201cParametros\u201d no SharePoint. Cria a lista (colunas: Title e Valor de texto longo) e tenta de novo."); }
    const existente = itens.find(it => String(it.Title).toLowerCase() === chave);
    const valor = JSON.stringify(valorObj);
    if (existente) { await graph.atualizarItem("Parametros", existente._id, { Valor: valor }); }
    else { await graph.criarItem("Parametros", { Title: chave, Valor: valor }); }
    M.fonte = "lista Parametros"; M.listaOk = true;
    badge("connected"); toast("Parâmetros " + chave.toUpperCase() + " guardados.");
    self.render(core, alvo);
  } catch (e) {
    badge("error", e.message); btn.disabled = false;
    modal("Não consegui guardar", el("div", {}, el("p", {}, e.message),
      el("p", { class: "mut", style: "font-size:13px" }, "Os valores que editaste continuam aplicados nesta sessão; só não ficaram gravados para todos.")));
  }
}
