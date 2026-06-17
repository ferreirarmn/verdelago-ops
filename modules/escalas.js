// ============================================================================
// escalas.js — Motor de Escala (HSK) — alocação por necessidades
// ----------------------------------------------------------------------------
// Replica o simulador: pessoas ativas com capacidades (Andares/Áreas/Turndown/
// Valet), padrão rotativo de 2 folgas seguidas (= 5 dias de trabalho), alocação
// às necessidades por função/turno, com deteção de GAPS (necessidade por cobrir)
// e EXCESSO (pessoas a mais nesse dia).
//
// Necessidades: por agora vêm do perfil por dia-da-semana do simulador
// (escala_base.json). Quando ligarmos as room nights, substituem este perfil.
// ============================================================================

import { el, toast, modal, badge } from "../core/ui.js";
import { pessoasDoModulo } from "../core/store.js";
import { carregarParametros } from "./parametros.js";
const M = { base: null, fb: null, erro: null, dept: "HSK", fonte: "Junho", fbMes: "Junho", semana: null, ajustes: {} };

// ---- ajustes manuais à escala (overrides por cima do cálculo automático) ----
const LS_AJUSTES = "verdelago-escala-ajustes";
function carregarAjustes() { try { M.ajustes = JSON.parse(localStorage.getItem(LS_AJUSTES) || "{}"); } catch { M.ajustes = {}; } }
function guardarAjustes() { try { localStorage.setItem(LS_AJUSTES, JSON.stringify(M.ajustes)); } catch {} }
function definirAjuste(chave, valor) {
  if (valor === "__auto" || valor == null) delete M.ajustes[chave];
  else M.ajustes[chave] = valor;
  guardarAjustes();
}
function reporAjustes(prefixo) {
  let n = 0;
  for (const k of Object.keys(M.ajustes)) if (k.startsWith(prefixo)) { delete M.ajustes[k]; n++; }
  guardarAjustes(); return n;
}
const chaveHSK = (data, nome) => "HSK|" + isoData(data) + "|" + nome;
const chaveFB = (mes, dow, nome) => "FB|" + mes + "|" + dow + "|" + nome;

// célula editável da grelha: mostra a abreviatura; ao clicar, abre um seletor
// (Automático / Folga / funções aplicáveis / Excesso). marcada = tem override.
function celulaEditavel({ valor, opcoes, marcada, ab, cls, aoEscolher }) {
  const td = el("td", { class: "cel-" + cls, style: "cursor:pointer;position:relative" + (marcada ? ";outline:2px solid var(--gold);outline-offset:-2px" : ""), title: marcada ? "Ajustado manualmente — clicar para mudar" : "Clicar para ajustar" }, ab);
  td.addEventListener("click", () => {
    const sel = el("select", { class: "campo", style: "min-width:96px;font-size:12px" },
      ...opcoes.map(o => el("option", { value: o.val, ...(o.val === valor ? { selected: "selected" } : {}) }, o.txt)));
    const fechar = () => aoEscolher(sel.value);
    sel.addEventListener("change", fechar);
    sel.addEventListener("blur", () => aoEscolher(null)); // null = re-render sem alterar
    td.replaceChildren(sel); sel.focus();
  });
  return td;
}

const ROLES = [
  { key: "Áreas", cap: "Áreas", shift: "07:30", ab: "Ár", need: "Áreas" },
  { key: "Lavandaria", cap: null, shift: "07:30", ab: "L", need: "Lavandaria" },
  { key: "Turndown", cap: "Turndown", shift: "14:30", ab: "T", need: "Turndown" },
  { key: "Valet_t", cap: "Valet", shift: "14:30", ab: "V", need: "Valet_t", rotulo: "Valet" },
  { key: "Andares", cap: "Andares", shift: "07:30", ab: "A", need: "Andares" },
];
// funções atribuíveis manualmente no HSK (seletor da grelha) — todas disponíveis
// independentemente das competências registadas. Inclui Governanta (chefia),
// Valete manhã/tarde e Áreas, além das que o automático dimensiona.
const FUNCOES_HSK = [
  { key: "Andares", ab: "A", rotulo: "Andares", cls: "A" },
  { key: "Áreas", ab: "Ár", rotulo: "Áreas", cls: "Ár" },
  { key: "Lavandaria", ab: "L", rotulo: "Lavandaria", cls: "A" },
  { key: "Turndown", ab: "T", rotulo: "Turndown", cls: "T" },
  { key: "Valet_m", ab: "Vm", rotulo: "Valete (manhã)", cls: "Vt" },
  { key: "Valet_t", ab: "Vt", rotulo: "Valete (tarde)", cls: "Vt" },
  { key: "Governanta", ab: "G", rotulo: "Governanta", cls: "G" },
];
const fnHSK = k => FUNCOES_HSK.find(f => f.key === k);
const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

function inicioSemana(d) { const x = new Date(d); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); x.setHours(0, 0, 0, 0); return x; }
function primeiraSemanaDoMes(fonte) { const m = fonte === "Julho" ? 6 : 5; return inicioSemana(new Date(2026, m, 1)); }
const isoData = d => { const x = new Date(d); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
// necessidade de um dia: calculada a partir das room nights × parâmetros (config_hsk)
function needDoDia(data) {
  const rn = rnDoDia(data);
  const cfg = M.base.config_hsk || {};
  if (rn != null && cfg.tipos && cfg.mix_tipologias) {
    const mix = cfg.mix_tipologias, tipos = cfg.tipos;
    const pond = tarefa => Object.keys(mix).reduce((s, t) => s + (Number(mix[t]) || 0) * (Number((tipos[t] || {})[tarefa]) || 0), 0);
    const prod = (Number(cfg.horas_produtivas) || 6.8) * 60;
    const fx = cfg.fixos || {};
    const estadia = pond("Stayover"), turndown = pond("Turndown"), valet = pond("Valet");
    const cob = fx.turndown_cob != null ? Number(fx.turndown_cob) : 1;
    return {
      Andares: Math.max(Number(fx.min_andares) || 1, Math.ceil(rn * estadia / prod)),
      "Áreas": Number(fx.areas) || 0,
      Turndown: Math.max(1, Math.ceil(rn * cob * turndown / prod)),
      Valet_m: 0,
      Valet_t: Math.max(Number(fx.min_valet) || 1, Math.ceil(rn * valet / prod)),
      Lavandaria: Number(fx.lavandaria) || 1,
    };
  }
  // fallback: valores pré-calculados ou perfil por dia-da-semana
  const porData = M.base.necessidades_data?.[M.fonte]?.[isoData(data)];
  if (porData) return porData;
  const dow = (data.getDay() + 6) % 7;
  const p = M.base.perfil_necessidades_dow?.[dow] || {};
  return { Andares: p.Andares || 0, "Áreas": p["Áreas"] || 0, Turndown: p.Turndown || 0, Valet_m: p.Valet_m || 0, Valet_t: p.Valet_t || 0, Lavandaria: 1 };
}
function rnDoDia(data) { return M.base.room_nights?.[M.fonte]?.[isoData(data)]; }
function norm(s) { return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }

function garantirEstilos() {
  if (document.getElementById("esc-edit-css")) return;
  const s = document.createElement("style"); s.id = "esc-edit-css";
  s.textContent = `
.esc-edit{display:flex;flex-direction:column;gap:14px;min-width:300px}
.esc-edit-grid{display:grid;grid-template-columns:1fr;gap:10px}
.campo-bloco{display:flex;flex-direction:column;gap:4px}
.campo-lbl{font-size:12px;color:var(--mut);font-weight:600}
.esc-edit .form-acoes{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.esc td.cel-G{background:#A6824A22;color:#84693B;font-weight:600}`;
  document.head.appendChild(s);
}

export const moduloEscalas = {
  id: "escalas", nome: "Escalas", icone: "🗓️",

  async init() {
    garantirEstilos();
    carregarAjustes();
    if (M.base || M.erro) return;
    try { const r = await fetch("escala_base.json?" + Date.now()); if (!r.ok) throw new Error("HTTP " + r.status); M.base = await r.json(); }
    catch (e) { M.erro = e.message; }
    try { const r = await fetch("escala_fb.json?" + Date.now()); if (r.ok) M.fb = await r.json(); } catch {}
    // sobrepor com os parâmetros editáveis (lista SharePoint "Parametros", se existir)
    try {
      const par = await carregarParametros();
      if (par.hsk && M.base) M.base.config_hsk = { ...M.base.config_hsk, ...par.hsk };
      if (par.fb && par.fb.ratios && M.fb) M.fb.ratios = par.fb.ratios;
    } catch { /* mantém os valores base */ }
    if (!M.semana) M.semana = primeiraSemanaDoMes(M.fonte);
  },

  render(core, alvo) {
    const self = this;
    if (M.erro) { alvo.replaceChildren(el("div", { class: "mod-cab" }, el("h2", {}, "Escalas")), el("div", { class: "mod-nota" }, "Falta o escala_base.json na raiz. Detalhe: " + M.erro)); return; }

    const deptBtn = (d, txt) => el("button", { class: "esc-mes" + (M.dept === d ? " ativo" : ""), onclick: () => { M.dept = d; self.render(core, alvo); } }, txt);
    const cab = el("div", { class: "mod-cab" }, el("h2", {}, "Escalas"),
      el("p", { class: "mut" }, "Dimensionamento de pessoal a partir das room nights do forecast."));
    const toggle = el("div", { class: "esc-meses", style: "margin-bottom:14px" }, deptBtn("HSK", "Housekeeping"), deptBtn("F&B", "F&B"));

    if (M.dept === "F&B") { alvo.replaceChildren(cab, toggle, renderFB(self, core, alvo)); return; }

    const pessoas = prepararPessoas();
    const datas = Array.from({ length: 7 }, (_, i) => { const d = new Date(M.semana); d.setDate(d.getDate() + i); return d; });
    const esc = gerar(datas, pessoas);

    const fim = datas[6];
    const mesBtn = (f) => el("button", { class: "esc-mes" + (M.fonte === f ? " ativo" : ""), onclick: () => { M.fonte = f; M.semana = primeiraSemanaDoMes(f); self.render(core, alvo); } }, f);
    const semIso = datas.map(isoData);
    const temAj = semIso.some(d => Object.keys(M.ajustes).some(k => k.startsWith("HSK|" + d + "|")));
    const bar = el("div", { class: "esc-bar" },
      el("div", { class: "esc-meses" }, mesBtn("Junho"), mesBtn("Julho")),
      el("div", { class: "esc-nav" },
        el("button", { onclick: () => { M.semana = new Date(M.semana.getFullYear(), M.semana.getMonth(), M.semana.getDate() - 7); self.render(core, alvo); } }, "‹"),
        el("span", { class: "esc-sem" }, M.semana.toLocaleDateString("pt-PT") + " a " + fim.toLocaleDateString("pt-PT")),
        el("button", { onclick: () => { M.semana = new Date(M.semana.getFullYear(), M.semana.getMonth(), M.semana.getDate() + 7); self.render(core, alvo); } }, "›")),
      ...(temAj ? [el("button", { class: "esc-mes", onclick: () => { datas.forEach(d => reporAjustes("HSK|" + isoData(d) + "|")); self.render(core, alvo); } }, "Repor automática")] : []),
      el("button", { class: "esc-exp", onclick: () => exportar(esc, pessoas, datas) }, "Exportar Excel"));

    const onEdit = (data, nome, val) => { if (val !== null) definirAjuste(chaveHSK(data, nome), val); self.render(core, alvo); };

    alvo.replaceChildren(
      cab, toggle,
      bar,
      kpis(esc),
      secaoCobertura(esc, datas),
      secaoGrelha(esc, pessoas, datas, onEdit),
      el("div", { class: "leg" }, "Legenda: ",
        el("span", { class: "cel-A" }, "A Andares"), el("span", { class: "cel-Ár" }, "Ár Áreas"),
        el("span", { class: "cel-T" }, "T Turndown"), el("span", { class: "cel-Vt" }, "V Valet"),
        el("span", { class: "cel-A" }, "L Lavandaria"),
        el("span", { class: "cel-F" }, "F Folga"), el("span", { class: "cel-EX" }, "· Excesso")));
  }
};

function prepararPessoas() {
  const capIdx = {};
  (M.base.capacidades || []).forEach(c => { capIdx[norm(c.Nome)] = c; });
  return pessoasDoModulo("HSK").map(p => {
    const c = capIdx[norm(p.Nome)];
    const caps = c ? { "Andares": c.Andares, "Áreas": c.Áreas, "Turndown": c.Turndown, "Valet": c.Valet }
                   : { "Andares": true, "Áreas": false, "Turndown": false, "Valet": false }; // sem dados: assume Andares
    return { nome: p.Nome, empresa: p.EmpresaAgencia || "", caps };
  });
}

// algoritmo de alocação (do simulador), necessidades por data
function gerar(datas, pessoas) {
  const patterns = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]];
  const off = pessoas.map((_, i) => new Set(patterns[i % 7]));
  const dias = [];
  const grelha = pessoas.map(() => Array(7).fill("F"));

  datas.forEach((data, col) => {
    const dow = (data.getDay() + 6) % 7;
    const need = needDoDia(data);
    const disp = [];
    pessoas.forEach((p, i) => { if (!off[i].has(dow)) disp.push(i); else grelha[i][col] = "F"; });
    const usados = new Set();
    const assign = {}, gap = {};
    for (const role of ROLES) {
      const n = Number(need[role.need] || 0);
      let cnt = 0;
      for (const i of disp) {
        if (cnt >= n) break;
        if (usados.has(i)) continue;
        if (role.cap && !pessoas[i].caps[role.cap]) continue;  // cap null = qualquer pessoa
        usados.add(i); grelha[i][col] = role.key; cnt++;
      }
      assign[role.key] = cnt; gap[role.key] = Math.max(0, n - cnt);
    }
    const excesso = disp.filter(i => !usados.has(i));
    excesso.forEach(i => grelha[i][col] = "EX");
    dias.push({ data, dow, need, assign, gap, excesso: excesso.length, disp: disp.length, rn: rnDoDia(data) });
  });

  // aplicar ajustes manuais (overrides) e recalcular a cobertura a partir da grelha final
  let temAjuste = false;
  datas.forEach((data, col) => {
    pessoas.forEach((p, i) => {
      const ov = M.ajustes[chaveHSK(data, p.nome)];
      if (ov !== undefined) { grelha[i][col] = ov; temAjuste = true; }
    });
    const need = dias[col].need, assign = {}, gap = {};
    for (const role of ROLES) {
      const cnt = pessoas.reduce((s, _, i) => s + (grelha[i][col] === role.key ? 1 : 0), 0);
      assign[role.key] = cnt; gap[role.key] = Math.max(0, Number(need[role.need] || 0) - cnt);
    }
    dias[col].assign = assign; dias[col].gap = gap;
    dias[col].excesso = pessoas.reduce((s, _, i) => s + (grelha[i][col] === "EX" ? 1 : 0), 0);
  });
  return { dias, grelha, temAjuste };
}

function kpis(esc) {
  const totalGap = esc.dias.reduce((s, x) => s + Object.values(x.gap).reduce((a, b) => a + b, 0), 0);
  const totalExc = esc.dias.reduce((s, x) => s + x.excesso, 0);
  const totalNeed = esc.dias.reduce((s, x) => s + Object.values(x.need).reduce((a, b) => a + Number(b || 0), 0), 0);
  return el("div", { class: "esc-kpis" },
    el("div", { class: "kpi" }, el("b", {}, "" + totalNeed), el("span", {}, "necessidades (semana)")),
    el("div", { class: "kpi " + (totalGap ? "gap" : "ok") }, el("b", {}, "" + totalGap), el("span", {}, "gaps por cobrir")),
    el("div", { class: "kpi exc" }, el("b", {}, "" + totalExc), el("span", {}, "excesso (pessoa·dia)")));
}

function cabDatas(datas) {
  return datas.map(d => el("th", {}, DIAS[(d.getDay() + 6) % 7], el("div", { style: "font-weight:400;font-size:10px;color:var(--mut)" }, d.getDate() + "/" + (d.getMonth() + 1))));
}

function secaoCobertura(esc, datas) {
  const head = el("tr", {}, el("th", { class: "rot" }, "Função / dia"), ...cabDatas(datas));
  const rnRow = el("tr", { class: "cobre" }, el("td", { class: "rot" }, "Room nights (forecast)"),
    ...esc.dias.map(d => el("td", { style: "color:var(--teal-d);font-weight:600" }, d.rn == null ? "—" : "" + Math.round(d.rn))));
  const linhas = ROLES.map(role => el("tr", { class: "cobre" },
    el("td", { class: "rot" }, role.rotulo || role.key),
    ...esc.dias.map(dia => {
      const n = Number(dia.need[role.need] || 0); const a = dia.assign[role.key] || 0; const g = dia.gap[role.key] || 0;
      return el("td", { class: g ? "gap" : (n ? "ok" : "") }, n ? (a + "/" + n) : "—");
    })));
  const exc = el("tr", { class: "cobre" }, el("td", { class: "rot" }, "Excesso"), ...esc.dias.map(d => el("td", { class: d.excesso ? "exc" : "" }, "" + d.excesso)));
  return el("div", { class: "esc-sec" }, el("h3", {}, "Cobertura por função (alocado / necessário)"),
    el("table", { class: "esc" }, el("thead", {}, head), el("tbody", {}, rnRow, ...linhas, exc)));
}

function secaoGrelha(esc, pessoas, datas, onEdit) {
  const head = el("tr", {}, el("th", { class: "rot" }, "Pessoa"), ...cabDatas(datas));
  const opcoesDe = () => [
    { val: "__auto", txt: "Automático" }, { val: "F", txt: "Folga" },
    ...FUNCOES_HSK.map(r => ({ val: r.key, txt: r.rotulo })),
    { val: "EX", txt: "Excesso" }
  ];
  const linhas = pessoas.map((p, i) => el("tr", {},
    el("td", { class: "rot" }, p.nome),
    ...esc.grelha[i].map((v, col) => {
      const data = datas[col];
      const marcada = M.ajustes[chaveHSK(data, p.nome)] !== undefined;
      const ab = v === "F" ? "F" : v === "EX" ? "·" : (fnHSK(v)?.ab || v);
      const cls = v === "F" ? "F" : v === "EX" ? "EX" : (fnHSK(v)?.cls || v);
      return celulaEditavel({ valor: v, opcoes: opcoesDe(), marcada, ab, cls, aoEscolher: val => onEdit(data, p.nome, val) });
    })));
  return el("div", { class: "esc-sec" }, el("h3", {}, "Escala por pessoa"),
    el("p", { class: "mut", style: "font-size:12.5px;margin-top:-4px" }, "Clica numa célula para ajustar (Folga, função ou excesso). As células com contorno dourado foram ajustadas manualmente; a cobertura recalcula automaticamente."),
    el("table", { class: "esc" }, el("thead", {}, head), el("tbody", {}, ...linhas)));
}

function carregarXLSX() {
  return new Promise((res, rej) => { if (window.XLSX) return res(); const s = document.createElement("script"); s.src = "lib/xlsx.full.min.js"; s.onload = () => res(); s.onerror = () => rej(new Error("Falha a carregar Excel")); document.head.append(s); });
}
async function exportar(esc, pessoas, datas) {
  try {
    badge("syncing"); await carregarXLSX(); const X = window.XLSX; const wb = X.utils.book_new();
    const rotDias = datas.map(d => DIAS[(d.getDay() + 6) % 7] + " " + d.getDate() + "/" + (d.getMonth() + 1));
    const cob = [["", ...rotDias], ["Room nights", ...esc.dias.map(d => d.rn == null ? "" : Math.round(d.rn))]];
    ROLES.forEach(role => { cob.push([role.rotulo || role.key, ...esc.dias.map(d => { const n = Number(d.need[role.need] || 0); return n ? (d.assign[role.key] || 0) + "/" + n : "—"; })]); });
    cob.push(["Excesso", ...esc.dias.map(d => d.excesso)]);
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(cob), "Cobertura");
    const gr = [["Pessoa", ...rotDias]];
    pessoas.forEach((p, i) => gr.push([p.nome, ...esc.grelha[i].map(v => v === "F" ? "Folga" : v === "EX" ? "Excesso" : (ROLES.find(r => r.key === v)?.rotulo || v))]));
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(gr), "Escala");
    X.writeFile(wb, "Verdelago_Escala_" + M.fonte + "_" + isoData(M.semana) + ".xlsx");
    badge("connected"); toast("Escala exportada.");
  } catch (e) { badge("error", e.message); toast("Falha: " + e.message, "error"); }
}

// ============================ VISTA F&B (cobertura, como o HSK) ============================
const FB_AREAS = [
  { key: "FOH Serviço", ab: "S" },
  { key: "BOH Cozinha", ab: "C" },
  { key: "BOH Copa", ab: "Cp" },
];
const PERIODOS = ["Manhã", "Tarde"];
// valor composto de uma célula F&B de trabalho: "Área|Outlet|Período"
// (Folga="F", Excesso="EX", automático=sem override). Outlet/Período opcionais.
const fbOutlets = () => Object.keys((M.fb && M.fb.covers) || {});
const fbArea = v => (typeof v === "string" && v.includes("|")) ? v.split("|")[0] : v;
const fbParse = v => { const [a, o, p] = String(v || "").split("|"); return { area: a || "", outlet: o || "", periodo: p || "" }; };
const abrevOutlet = o => o ? o.split(/\s+/).map(w => w[0]).join("").toUpperCase() : "";
const periodoAb = p => p === "Manhã" ? "M" : p === "Tarde" ? "T" : "";
function fbAbrev(v) {
  if (v === "F") return "F"; if (v === "EX") return "·";
  const { area, outlet, periodo } = fbParse(v);
  const a = FB_AREAS.find(x => x.key === area)?.ab || area;
  const extra = [abrevOutlet(outlet), periodoAb(periodo)].filter(Boolean).join("·");
  return extra ? a + "·" + extra : a;
}
function fbCls(v) { const a = fbArea(v); return v === "F" ? "F" : v === "EX" ? "EX" : (a === "FOH Serviço" ? "A" : a === "BOH Cozinha" ? "T" : "Ár"); }
function fbTexto(v) {
  if (v === "F") return "Folga"; if (v === "EX") return "Excesso";
  const { area, outlet, periodo } = fbParse(v);
  return [area, outlet, periodo].filter(Boolean).join(" · ") || area;
}
// editor de célula F&B: Estado + (se Trabalho) Área, Outlet, Período
function abrirEditorCelulaFB(nomePessoa, diaIdx, valorAtual, aoGuardar) {
  const base = (valorAtual === "F" || valorAtual === "EX") ? "" : valorAtual;
  const { area, outlet, periodo } = fbParse(base);
  const estadoInit = valorAtual === "F" ? "F" : valorAtual === "EX" ? "EX" : "trab";
  const opt = (v, txt, sel) => el("option", { value: v, ...(sel ? { selected: "selected" } : {}) }, txt);
  const selEstado = el("select", { class: "campo" },
    opt("__auto", "Automático (calculado)", false), opt("F", "Folga", estadoInit === "F"),
    opt("trab", "Trabalho", estadoInit === "trab"), opt("EX", "Excesso", estadoInit === "EX"));
  const selArea = el("select", { class: "campo" }, ...FB_AREAS.map(a => opt(a.key, a.key, a.key === area || (!area && a.key === "FOH Serviço"))));
  const selOutlet = el("select", { class: "campo" }, opt("", "— sem outlet —", !outlet), ...fbOutlets().map(o => opt(o, o, o === outlet)));
  const selPeriodo = el("select", { class: "campo" }, opt("", "— sem período —", !periodo), ...PERIODOS.map(p => opt(p, p, p === periodo)));
  const campo = (lbl, inp) => el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, lbl), inp);
  const blocoTrab = el("div", { class: "esc-edit-grid" }, campo("Área", selArea), campo("Outlet", selOutlet), campo("Período", selPeriodo));
  const atualizar = () => { blocoTrab.style.display = selEstado.value === "trab" ? "grid" : "none"; };
  selEstado.addEventListener("change", atualizar); atualizar();
  let fechar;
  const guardar = () => {
    const e = selEstado.value;
    let valor = e;
    if (e === "trab") valor = [selArea.value, selOutlet.value, selPeriodo.value].join("|").replace(/\|+$/, "");
    aoGuardar(valor); fechar && fechar();
  };
  const form = el("div", { class: "esc-edit" },
    campo("Estado", selEstado), blocoTrab,
    el("div", { class: "form-acoes" },
      el("button", { class: "btn", onclick: guardar }, "Guardar"),
      el("button", { class: "btn-sec", onclick: () => fechar && fechar() }, "Cancelar")));
  fechar = modal("Escala — " + nomePessoa + " · " + DIAS[diaIdx], form);
}

// necessidades DIÁRIAS por área (posições/dia), a partir dos covers ÷ rácio (sem ×1,4)
function fbNecessidades(mes) {
  const { ratios, covers, dias_mes } = M.fb;
  const dm = dias_mes[mes];
  const need = { "FOH Serviço": 0, "BOH Cozinha": 0, "BOH Copa": 0 };
  const porOutlet = [];
  for (const o in ratios) {
    if (!covers[o]) continue;
    const covdia = (covers[o][mes] || 0) / dm;
    const det = {};
    for (const area in ratios[o]) {
      const ratio = ratios[o][area];
      const pos = ratio > 0 ? Math.ceil(covdia / ratio) : (covdia > 0 ? 1 : 0);
      det[area] = pos; need[area] = (need[area] || 0) + pos;
    }
    porOutlet.push({ o, covdia, det });
  }
  return { need, porOutlet };
}

// aloca as pessoas reais do F&B às necessidades, com padrão 5/2 e distribuição homogénea
function fbGerar(pessoas, need, mes) {
  const patterns = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]];
  const off = pessoas.map((_, i) => new Set(patterns[i % 7]));
  const grelha = pessoas.map(() => Array(7).fill("F"));
  const dias = [];
  for (let d = 0; d < 7; d++) {
    const disp = [];
    pessoas.forEach((p, i) => { if (!off[i].has(d)) disp.push(i); else grelha[i][d] = "F"; });
    let ptr = 0; const assign = {}, gap = {};
    for (const area of FB_AREAS) {
      const n = Number(need[area.key] || 0); let cnt = 0;
      while (cnt < n && ptr < disp.length) { grelha[disp[ptr]][d] = area.key; ptr++; cnt++; }
      assign[area.key] = cnt; gap[area.key] = Math.max(0, n - cnt);
    }
    for (let k = ptr; k < disp.length; k++) grelha[disp[k]][d] = "EX";
    dias.push({ assign, gap, excesso: disp.length - ptr, disp: disp.length });
  }
  // ajustes manuais (overrides) + recálculo da cobertura
  for (let d = 0; d < 7; d++) {
    pessoas.forEach((p, i) => {
      const ov = M.ajustes[chaveFB(mes, d, p.Nome)];
      if (ov !== undefined) grelha[i][d] = ov;
    });
    const assign = {}, gap = {};
    for (const area of FB_AREAS) {
      const cnt = pessoas.reduce((s, _, i) => s + (fbArea(grelha[i][d]) === area.key ? 1 : 0), 0);
      assign[area.key] = cnt; gap[area.key] = Math.max(0, Number(need[area.key] || 0) - cnt);
    }
    dias[d].assign = assign; dias[d].gap = gap;
    dias[d].excesso = pessoas.reduce((s, _, i) => s + (grelha[i][d] === "EX" ? 1 : 0), 0);
  }
  return { dias, grelha };
}

function renderFB(self, core, alvo) {
  if (!M.fb) return el("div", { class: "mod-nota" }, "Falta o escala_fb.json na raiz da app.");
  const mes = M.fbMes;
  const { need, porOutlet } = fbNecessidades(mes);
  const pessoas = pessoasDoModulo("F&B").sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt"));
  const esc = fbGerar(pessoas, need, mes);
  const orc = M.fb.orcamento[mes] || { Total: 0 };

  const mesBtn = f => el("button", { class: "esc-mes" + (mes === f ? " ativo" : ""), onclick: () => { M.fbMes = f; self.render(core, alvo); } }, f);
  const temAjFB = Object.keys(M.ajustes).some(k => k.startsWith("FB|" + mes + "|"));
  const bar = el("div", { class: "esc-bar" },
    el("div", { class: "esc-meses" }, mesBtn("Junho"), mesBtn("Julho")),
    ...(temAjFB ? [el("button", { class: "esc-mes", onclick: () => { reporAjustes("FB|" + mes + "|"); self.render(core, alvo); } }, "Repor automática")] : []),
    el("button", { class: "esc-exp", onclick: () => exportarFB(mes, need, porOutlet, esc, pessoas) }, "Exportar Excel"));

  const totalNeedDia = FB_AREAS.reduce((s, a) => s + (need[a.key] || 0), 0);
  const totalGap = esc.dias.reduce((s, x) => s + Object.values(x.gap).reduce((a, b) => a + b, 0), 0);
  const totalExc = esc.dias.reduce((s, x) => s + x.excesso, 0);
  const kpi = (v, l, cls) => el("div", { class: "kpi " + (cls || "") }, el("b", {}, "" + v), el("span", {}, l));
  const kpisFB = el("div", { class: "esc-kpis" },
    kpi(totalNeedDia, "posições/dia necessárias"),
    kpi(pessoas.length, "pessoas F&B (escala 5/2)"),
    kpi(totalGap, "gaps na semana", totalGap ? "gap" : "ok"),
    kpi(totalExc, "excesso (pessoa·dia)", "exc"));

  // cobertura por área (alocado/necessário) — 7 dias
  const head = el("tr", {}, el("th", { class: "rot" }, "Área / dia"), ...DIAS.map(d => el("th", {}, d)));
  const linhasCob = FB_AREAS.map(a => el("tr", { class: "cobre" },
    el("td", { class: "rot" }, a.key),
    ...esc.dias.map(dia => { const n = need[a.key] || 0; const al = dia.assign[a.key] || 0; const g = dia.gap[a.key] || 0; return el("td", { class: g ? "gap" : (n ? "ok" : "") }, n ? (al + "/" + n) : "—"); })));
  const excRow = el("tr", { class: "cobre" }, el("td", { class: "rot" }, "Excesso"), ...esc.dias.map(d => el("td", { class: d.excesso ? "exc" : "" }, "" + d.excesso)));
  const tabCob = el("table", { class: "esc" }, el("thead", {}, head), el("tbody", {}, ...linhasCob, excRow));

  // necessidade por outlet (origem das posições)
  const headO = el("tr", {}, el("th", { class: "rot" }, "Outlet"), el("th", {}, "Covers/dia"), ...FB_AREAS.map(a => el("th", {}, a.key)));
  const linhasO = porOutlet.map(L => el("tr", {},
    el("td", { class: "rot" }, L.o), el("td", {}, "" + Math.round(L.covdia)),
    ...FB_AREAS.map(a => el("td", {}, L.det[a.key] != null ? "" + L.det[a.key] : "—"))));
  const tabO = el("table", { class: "esc" }, el("thead", {}, headO), el("tbody", {}, ...linhasO));

  // escala por pessoa (editável: estado, área, outlet, período)
  const headP = el("tr", {}, el("th", { class: "rot" }, "Pessoa"), ...DIAS.map(d => el("th", {}, d)));
  const linhasP = pessoas.map((p, i) => el("tr", {},
    el("td", { class: "rot" }, p.Nome),
    ...esc.grelha[i].map((v, d) => {
      const marcada = M.ajustes[chaveFB(mes, d, p.Nome)] !== undefined;
      const td = el("td", { class: "cel-" + fbCls(v), style: "cursor:pointer" + (marcada ? ";outline:2px solid var(--gold);outline-offset:-2px" : ""), title: fbTexto(v) + " — clicar para ajustar" }, fbAbrev(v));
      td.addEventListener("click", () => abrirEditorCelulaFB(p.Nome, d, v, val => { if (val !== null) definirAjuste(chaveFB(mes, d, p.Nome), val); self.render(core, alvo); }));
      return td;
    })));
  const tabP = el("table", { class: "esc" }, el("thead", {}, headP), el("tbody", {}, ...linhasP));

  return el("div", {},
    bar, kpisFB,
    el("div", { class: "esc-sec" }, el("h3", {}, "Cobertura por área (alocado / necessário)"), tabCob,
      el("p", { class: "mut", style: "font-size:12.5px" }, "Posições/dia = covers ÷ rácio (rácios 'low'). Distribuição homogénea das pessoas pelas posições, com padrão 5 dias / 2 folgas. Orçamento " + mes + ": " + Math.round(orc.Total) + " · pessoas atuais: " + pessoas.length + ".")),
    el("div", { class: "esc-sec" }, el("h3", {}, "Necessidade por outlet"), tabO,
      el("p", { class: "leg" }, "Legenda: ", el("span", { class: "cel-A" }, "S Serviço"), el("span", { class: "cel-T" }, "C Cozinha"), el("span", { class: "cel-Ár" }, "Cp Copa"), el("span", { class: "cel-F" }, "F Folga"), el("span", { class: "cel-EX" }, "· Excesso"))),
    el("div", { class: "esc-sec" }, el("h3", {}, "Escala por pessoa"), tabP));
}

function exportarFB(mes, need, porOutlet, esc, pessoas) {
  (async () => {
    try {
      badge("syncing"); await carregarXLSX(); const X = window.XLSX; const wb = X.utils.book_new();
      const cob = [["Área / dia", ...DIAS]];
      FB_AREAS.forEach(a => cob.push([a.key, ...esc.dias.map(d => { const n = need[a.key] || 0; return n ? (d.assign[a.key] || 0) + "/" + n : "—"; })]));
      cob.push(["Excesso", ...esc.dias.map(d => d.excesso)]);
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(cob), "Cobertura");
      const out = [["Outlet", "Covers/dia", ...FB_AREAS.map(a => a.key)]];
      porOutlet.forEach(L => out.push([L.o, Math.round(L.covdia), ...FB_AREAS.map(a => L.det[a.key] ?? "")]));
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(out), "Por Outlet");
      const gr = [["Pessoa", ...DIAS]];
      pessoas.forEach((p, i) => gr.push([p.Nome, ...esc.grelha[i].map(v => fbTexto(v))]));
      X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(gr), "Escala");
      X.writeFile(wb, "Verdelago_FB_" + mes + ".xlsx");
      badge("connected"); toast("F&B exportado.");
    } catch (e) { badge("error", e.message); toast("Falha: " + e.message, "error"); }
  })();
}
