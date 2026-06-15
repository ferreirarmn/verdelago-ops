// ============================================================================
// orcamento.js — Módulo Orçamento
// ----------------------------------------------------------------------------
// Aba "Plano vs Real": compara o orçamento congelado (Lista Orçamento) com a
// execução real (Lista Pessoas) em HC e custo, por mês, em quatro níveis —
// geral, departamento, função e pessoa. O nível de pessoa é aproximado
// (casamento de nomes normalizado); o que não casa fica em "Por conciliar".
//
// Princípio "Tipologia vs Tipo": os nomes INTERNOS das colunas da Lista
// Orçamento são resolvidos em tempo de execução a partir dos nomes a mostrar
// (HC_Jan, Custo_Ago, …), nunca hardcoded.
//
// A aba "Previsão" (motor room nights → pessoas/custo) entra na Fase 3.
// ============================================================================

import { el, toast, badge } from "../core/ui.js";
import { dados, funcaoDaPessoa } from "../core/store.js";
import * as graph from "../core/graph.js";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const eur = n => "€ " + Math.round(n).toLocaleString("pt-PT");
const eurK = n => "€ " + Math.round(n / 1000).toLocaleString("pt-PT") + "k";
const norm = s => String(s || "").toUpperCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
const sinal = n => (n > 0 ? "+" : "") + Math.round(n).toLocaleString("pt-PT");

function garantirEstilos() { /* estilos centralizados em estilo.css */ }

const M = {
  plano: null, colMap: null, erro: null,
  versao: null, versoes: [],
  nivel: "departamento",      // geral | departamento | funcao | pessoa
  mesIdx: new Date().getMonth()
};

// Resolve { displayName -> nome interno } para uma lista, e devolve um getter
// que aceita o nome a mostrar e dá o valor do item (tolerante a _x005f_ etc.).
function fazerGetter(colunas) {
  const porDisplay = {}; const porNome = {};
  colunas.forEach(c => { porDisplay[norm(c.displayName)] = c.name; porNome[c.name] = c.name; });
  return display => porDisplay[norm(display)] || display;
}

export const moduloOrcamento = {
  id: "orcamento",
  nome: "Orçamento",
  icone: "orcamento",

  async init() {
    garantirEstilos();
    if (M.plano || M.erro) return;
    try {
      const [linhas, colunas] = await Promise.all([
        graph.lerLista("Orçamento"),
        graph.colunasDaLista("Orçamento")
      ]);
      const get = fazerGetter(colunas);
      // mapa de campos que nos interessam (nome a mostrar -> nome interno real)
      M.colMap = {
        versao: get("Versao"), tipo: get("TipoLinha"), nome: get("Nome"),
        categoria: get("Categoria"), departamento: get("Departamento"), vinculo: get("Vinculo"),
        hc: MESES.map(m => get("HC_" + m)), custo: MESES.map(m => get("Custo_" + m))
      };
      M.plano = linhas;
      M.versoes = [...new Set(linhas.map(l => l[M.colMap.versao]).filter(Boolean))].sort();
      M.versao = M.versoes[M.versoes.length - 1] || null;
    } catch (e) { M.erro = e.message; }
  },

  render(core, alvo) {
    const self = this;
    if (M.erro) {
      alvo.replaceChildren(
        el("div", { class: "mod-cab" }, el("h2", {}, "Orçamento")),
        el("div", { class: "mod-nota" }, "Não foi possível ler a Lista \"Orçamento\". Confirma que existe no site. Detalhe: " + M.erro));
      return;
    }

    const aba = (id, txt, ativo) => el("button", { class: "sub-tab" + (ativo ? " ativo" : ""), onclick: () => { if (id === "previsao") toast("A aba Previsão chega na próxima fase."); } }, txt);

    const corpo = el("div", {});
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "Orçamento"),
        el("p", { class: "mut" }, "Plano congelado vs execução real — HC e custo por mês, departamento, função e pessoa.")),
      el("div", { class: "sub-tabs" }, aba("pvr", "Plano vs Real", true), aba("previsao", "Previsão")),
      corpo
    );
    vistaPlanoVsReal(corpo, self, core, alvo);
  }
};

// ---------------------------------------------------------------------------
function vistaPlanoVsReal(corpo, self, core, alvo) {
  const cm = M.colMap;
  const linhas = M.plano.filter(l => !M.versao || l[cm.versao] === M.versao);

  // ---- PLANO: agregação por mês e por chave de nível ----
  const planoMes = i => linhas.reduce((s, l) => s + (Number(l[cm.hc[i]]) || 0), 0);
  const planoCustoMes = i => linhas.reduce((s, l) => s + (Number(l[cm.custo[i]]) || 0), 0);

  // ---- REAL: descobrir campos na Lista Pessoas (defensivo) ----
  const amostra = dados.pessoas[0] || {};
  const chave = re => Object.keys(amostra).find(k => re.test(k)) || null;
  const cCustoReal = chave(/custo.*real|custoreal|custo.*mens/i);
  const cDataEnt = chave(/data.*(entrad|admiss|inici)/i);
  const cDataSai = chave(/data.*(said|fim|termo|sa) /i) || chave(/data.*(said|fim|termo)/i);
  const temDatas = !!cDataEnt;
  const temCustoReal = !!cCustoReal;

  const ativaPessoa = p => !String(p.Estado || "").toLowerCase().includes("inativ");
  const ymd = v => { if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d; };
  function realAtivaNoMes(p, i) {
    if (!ativaPessoa(p)) return false;
    if (!temDatas) return true; // sem datas: fotografia atual aplicada a todos os meses (aproximação)
    const ini = new Date(new Date().getFullYear(), i, 1);
    const fim = new Date(new Date().getFullYear(), i + 1, 0);
    const de = ymd(p[cDataEnt]); const ds = cDataSai ? ymd(p[cDataSai]) : null;
    if (de && de > fim) return false;
    if (ds && ds < ini) return false;
    return true;
  }
  const realCustoPessoaMes = p => temCustoReal ? (Number(p[cCustoReal]) || 0) : 0;

  // chave de agregação de uma pessoa real, por nível
  function chaveRealPessoa(p, nivel) {
    const f = funcaoDaPessoa(p);
    if (nivel === "geral") return "TOTAL";
    if (nivel === "departamento") return norm(f?.Departamento || f?.Modulo || "—");
    if (nivel === "funcao") return norm(f?.Nome || "—");
    return norm(p.Nome || "—");
  }
  // chave de agregação de uma linha de plano, por nível
  function chavePlanoLinha(l, nivel) {
    if (nivel === "geral") return "TOTAL";
    if (nivel === "departamento") return norm(l[cm.departamento] || "—");
    if (nivel === "funcao") return norm(l[cm.categoria] || "—");
    return norm(l[cm.nome] || "(vaga)");
  }
  // rótulo legível para uma chave (usa a 1ª ocorrência no plano ou real)
  function rotulo(chave, nivel) {
    if (nivel === "geral") return "Total";
    const lp = linhas.find(l => chavePlanoLinha(l, nivel) === chave);
    if (lp) return (nivel === "departamento" ? lp[cm.departamento] : nivel === "funcao" ? lp[cm.categoria] : (lp[cm.nome] || "(vaga)"));
    const pr = dados.pessoas.find(p => chaveRealPessoa(p, nivel) === chave);
    if (pr) { const f = funcaoDaPessoa(pr); return nivel === "departamento" ? (f?.Departamento || f?.Modulo || "—") : nivel === "funcao" ? (f?.Nome || "—") : (pr.Nome || "—"); }
    return chave;
  }

  const i = M.mesIdx;
  const nivel = M.nivel;

  // construir agregados do mês i, por chave
  const agg = {}; // chave -> {pHC,pC,rHC,rC}
  const garante = k => (agg[k] ||= { pHC: 0, pC: 0, rHC: 0, rC: 0 });
  linhas.forEach(l => { const k = chavePlanoLinha(l, nivel); const a = garante(k); a.pHC += Number(l[cm.hc[i]]) || 0; a.pC += Number(l[cm.custo[i]]) || 0; });
  dados.pessoas.forEach(p => { if (!realAtivaNoMes(p, i)) return; const k = chaveRealPessoa(p, nivel); const a = garante(k); a.rHC += 1; a.rC += realCustoPessoaMes(p); });

  // totais do mês
  const tot = Object.values(agg).reduce((s, a) => ({ pHC: s.pHC + a.pHC, pC: s.pC + a.pC, rHC: s.rHC + a.rHC, rC: s.rC + a.rC }), { pHC: 0, pC: 0, rHC: 0, rC: 0 });
  const totAnoPlanoC = MESES.reduce((s, _, k) => s + planoCustoMes(k), 0);

  // ---- UI ----
  // barra: versão + nível + mês
  const selVersao = el("select", { class: "campo", style: "max-width:160px", onchange: e => { M.versao = e.target.value; self.render(core, alvo); } },
    ...M.versoes.map(v => el("option", { value: v, ...(v === M.versao ? { selected: "selected" } : {}) }, v)));
  const segNivel = el("div", { class: "orc-seg" },
    ...[["geral", "Geral"], ["departamento", "Departamento"], ["funcao", "Função"], ["pessoa", "Pessoa"]].map(([id, t]) =>
      el("button", { class: M.nivel === id ? "ativo" : "", onclick: () => { M.nivel = id; self.render(core, alvo); } }, t)));
  const navMes = el("div", { class: "mesnav" },
    el("button", { onclick: () => { M.mesIdx = (M.mesIdx + 11) % 12; self.render(core, alvo); } }, "‹"),
    el("span", { class: "mes" }, MESES[i]),
    el("button", { onclick: () => { M.mesIdx = (M.mesIdx + 1) % 12; self.render(core, alvo); } }, "›"));

  // KPIs do mês
  const kpi = (v, l, s, cls) => el("div", { class: "kpi " + (cls || "") }, el("div", { class: "v" }, v), el("div", { class: "l" }, l), s ? el("div", { class: "s" }, s) : null);
  const dHC = tot.rHC - tot.pHC, dC = tot.rC - tot.pC;
  const kpis = el("div", { class: "kpis" },
    kpi(Math.round(tot.pHC) + " / " + tot.rHC, "HC plano / real", "Δ " + sinal(dHC) + " pessoas", dHC > 0 ? "" : "livres"),
    kpi(temCustoReal ? (eurK(tot.pC) + " / " + eurK(tot.rC)) : (eurK(tot.pC) + " / —"), "Custo plano / real", temCustoReal ? ("Δ " + (dC >= 0 ? "+" : "") + eurK(dC)) : "falta custo real", "fixo"),
    kpi(eurK(totAnoPlanoC), "Plano anual (custo)", linhas.length + " posições · versão " + (M.versao || "—")));

  // tabela comparativa (ordenada por desvio absoluto de HC)
  const chaves = Object.keys(agg).filter(k => agg[k].pHC > 0 || agg[k].rHC > 0)
    .sort((a, b) => Math.abs(agg[b].rHC - agg[b].pHC) - Math.abs(agg[a].rHC - agg[a].pHC));
  const head = ["", "Plano HC", "Real HC", "Δ HC", "Plano €", "Real €", "Δ €"];
  const trCab = el("tr", {}, ...head.map((h, j) => el("th", { class: j ? "num" : "" }, h)));
  const corpoTab = chaves.map(k => {
    const a = agg[k]; const dh = a.rHC - a.pHC; const dc = a.rC - a.pC;
    const corDh = Math.abs(dh) < 0.5 ? "var(--mut)" : dh > 0 ? "var(--amber)" : "var(--danger)";
    return el("tr", {},
      el("td", {}, rotulo(k, nivel)),
      el("td", { class: "num" }, "" + Math.round(a.pHC)),
      el("td", { class: "num" }, "" + a.rHC),
      el("td", { class: "num", style: "color:" + corDh + ";font-weight:600" }, sinal(dh)),
      el("td", { class: "num" }, a.pC ? eur(a.pC) : "—"),
      el("td", { class: "num" }, temCustoReal ? (a.rC ? eur(a.rC) : "—") : "—"),
      el("td", { class: "num" }, (temCustoReal && (a.pC || a.rC)) ? (dc >= 0 ? "+" : "") + eur(dc) : "—"));
  });
  const tabela = nivel === "geral"
    ? null
    : el("table", { class: "orc-tab" }, el("thead", {}, trCab), el("tbody", {}, ...corpoTab),
        el("tfoot", {}, el("tr", {},
          el("td", {}, "Total"),
          el("td", { class: "num" }, "" + Math.round(tot.pHC)),
          el("td", { class: "num" }, "" + tot.rHC),
          el("td", { class: "num", style: "font-weight:600" }, sinal(dHC)),
          el("td", { class: "num" }, eur(tot.pC)),
          el("td", { class: "num" }, temCustoReal ? eur(tot.rC) : "—"),
          el("td", { class: "num" }, temCustoReal ? ((dC >= 0 ? "+" : "") + eur(dC)) : "—"))));

  // "Por conciliar": chaves que só existem num dos lados (exceto vagas planeadas, que são esperadas)
  const soPlano = chaves.filter(k => agg[k].pHC > 0 && agg[k].rHC === 0);
  const soReal = chaves.filter(k => agg[k].rHC > 0 && agg[k].pHC === 0);
  const conciliar = (nivel === "pessoa")
    ? el("div", { class: "orc-sec" },
        el("h3", {}, "Por conciliar"),
        el("p", { class: "mut", style: "font-size:13px;margin-top:-4px" },
          soPlano.length + " no plano sem correspondência no real (vagas por preencher ou nomes que não casaram) · " +
          soReal.length + " no real fora do plano (entradas não orçamentadas ou nomes diferentes)."))
    : null;

  // avisos de dados em falta
  const avisos = [];
  if (!temCustoReal) avisos.push("Falta a coluna de custo real na Lista Pessoas (ex.: \"CustoMensalReal\") — o lado de custo do real fica vazio.");
  if (!temDatas) avisos.push("Sem datas de entrada/saída na Lista Pessoas — o HC real é a fotografia atual aplicada a todos os meses (aproximação).");
  const nota = avisos.length ? el("div", { class: "mod-nota" }, avisos.join(" ")) : null;

  corpo.replaceChildren(
    el("div", { class: "orc-bar" },
      el("label", { style: "font-size:12px;color:var(--mut)" }, "Versão "), selVersao,
      segNivel,
      navMes),
    kpis,
    nota,
    tabela,
    conciliar
  );
}
