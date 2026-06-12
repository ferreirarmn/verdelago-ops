// ============================================================================
// presencas.js — Grelha mensal de presenças (componente partilhado)
// ----------------------------------------------------------------------------
// Pessoas em linhas, dias do mês em colunas. Clique numa célula alterna o
// estado: vazio → Presente → Falta → Folga → vazio. Resumo por pessoa à direita.
// Usado pelo HSK, F&B e Náutico — cada módulo passa a sua lista de pessoas.
//
// Lê/escreve a Lista "Presenças" (PessoaID texto, Data, Estado).
// ============================================================================

import { el, toast, badge } from "../core/ui.js";
import { funcaoDaPessoa } from "../core/store.js";
import * as graph from "../core/graph.js";

// ciclo de estados: clicar avança; a partir de Folga volta a vazio
const CICLO = ["", "Presente", "Falta", "Folga"];
const SIGLA = { "Presente": "P", "Falta": "F", "Folga": "D" };  // D = Dispensa/foLga
const CLASSE = { "Presente": "presente", "Falta": "falta", "Folga": "folga" };

let CACHE = null;   // presenças carregadas (partilhadas entre módulos)

function garantirEstilos() {
  // Estilos centralizados em estilo.css (design system v2) — nada a injetar.
}

function diasDoMes(ano, mes) { // mes 0-11
  const n = new Date(ano, mes + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => new Date(ano, mes, i + 1));
}
const iso = d => d.toISOString().slice(0, 10);
const ehFds = d => [0, 6].includes(d.getDay());

/**
 * Desenha a grelha mensal num elemento alvo.
 * @param {HTMLElement} alvo
 * @param {Array} pessoas  lista de pessoas (objetos com Title e Nome)
 * @param {Object} opts    { mes?:Date }  mês inicial
 */
export async function grelhaPresencas(alvo, pessoas, opts = {}) {
  garantirEstilos();
  let ref = opts.mes || new Date();
  let filtro = "";

  alvo.replaceChildren(el("p", { class: "carregar" }, "A carregar presenças…"));
  if (!CACHE) CACHE = await graph.lerLista("Presenças");

  const hojeIso = iso(new Date());

  function presDe(pessoaId, dataIso) {
    return CACHE.find(x => x.PessoaID === pessoaId && String(x.Data || "").slice(0, 10) === dataIso);
  }

  async function alternar(pessoa, dataIso, celB) {
    const atual = presDe(pessoa.Title, dataIso);
    const estAtual = atual ? (atual.Estado || "") : "";
    const prox = CICLO[(CICLO.indexOf(estAtual) + 1) % CICLO.length];
    try {
      badge("syncing");
      if (!atual && prox) {
        const r = await graph.criarItem("Presenças", {
          Title: "PR" + Date.now(), PessoaID: pessoa.Title, Data: dataIso, Estado: prox
        });
        CACHE.push({ _id: r.id, PessoaID: pessoa.Title, Data: dataIso, Estado: prox });
      } else if (atual && prox) {
        await graph.atualizarItem("Presenças", atual._id, { Estado: prox });
        atual.Estado = prox;
      } else if (atual && !prox) {
        await graph.apagarItem("Presenças", atual._id);
        CACHE = CACHE.filter(x => x !== atual);
      }
      badge("connected");
      pintarCelula(celB, prox);
      atualizarResumo(pessoa);
    } catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); }
  }

  function pintarCelula(b, estado) {
    b.className = "b" + (CLASSE[estado] ? " " + CLASSE[estado] : "");
    b.textContent = SIGLA[estado] || "";
  }

  const resumoRefs = {}; // pessoaId -> td

  function calcResumo(pessoaId, dias) {
    let p = 0, f = 0;
    for (const d of dias) {
      const r = presDe(pessoaId, iso(d));
      if (!r) continue;
      if (r.Estado === "Presente") p++;
      else if (r.Estado === "Falta") f++;
    }
    const base = p + f;
    const pct = base ? Math.round((p / base) * 100) : 100;
    return { p, f, pct };
  }
  function atualizarResumo(pessoa) {
    const td = resumoRefs[pessoa.Title];
    if (!td) return;
    const dias = diasDoMes(ref.getFullYear(), ref.getMonth());
    const { p, f, pct } = calcResumo(pessoa.Title, dias);
    td.replaceChildren(el("span", {}, p + "P · " + f + "F · "), el("span", { class: "pc" }, pct + "%"));
  }

  function desenhar() {
    const ano = ref.getFullYear(), mes = ref.getMonth();
    const dias = diasDoMes(ano, mes);
    const nomeMes = ref.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
    const lista = pessoas.filter(p => !filtro || (p.Nome || "").toLowerCase().includes(filtro));

    // cabeçalho
    const thsDias = dias.map(d => {
      const cls = "dia" + (ehFds(d) ? " fds" : "") + (iso(d) === hojeIso ? " hoje" : "");
      const dn = d.toLocaleDateString("pt-PT", { weekday: "short" }).slice(0, 3);
      return el("th", { class: cls }, "" + d.getDate(), el("span", { class: "dn" }, dn));
    });
    const thead = el("thead", {}, el("tr", {},
      el("th", { class: "pessoa" }, "Pessoa"), ...thsDias, el("th", { class: "resumo" }, "Resumo")));

    // linhas
    const linhas = lista.map(p => {
      const f = funcaoDaPessoa(p);
      const tdResumo = el("td", { class: "resumo" });
      resumoRefs[p.Title] = tdResumo;
      const cels = dias.map(d => {
        const di = iso(d);
        const r = presDe(p.Title, di);
        const b = el("div", { class: "b" });
        pintarCelula(b, r ? r.Estado : "");
        const td = el("td", {
          class: "cel" + (ehFds(d) ? " fds" : "") + (di === hojeIso ? " hoje" : ""),
          onclick: () => alternar(p, di, b)
        }, b);
        return td;
      });
      const tr = el("tr", {},
        el("td", { class: "pessoa" },
          el("div", { class: "nm" }, p.Nome || "—"),
          el("div", { class: "fn" }, f ? f.Nome : "")),
        ...cels, tdResumo);
      return tr;
    });

    alvo.replaceChildren(
      el("div", { class: "pg-topo" },
        el("div", { class: "pg-nav" },
          el("button", { onclick: () => { ref = new Date(ano, mes - 1, 1); desenhar(); } }, "‹"),
          el("span", { class: "pg-mes" }, nomeMes),
          el("button", { onclick: () => { ref = new Date(ano, mes + 1, 1); desenhar(); } }, "›")),
        el("input", { class: "pg-busca", placeholder: "Procurar pessoa…", value: filtro,
          oninput: e => { filtro = e.target.value.trim().toLowerCase(); desenhar(); } }),
        el("div", { class: "pg-legenda" },
          el("span", { class: "s presente" }, "P"), "Presente ",
          el("span", { class: "s falta" }, "F"), "Falta ",
          el("span", { class: "s folga" }, "D"), "Folga — clica para alternar")),
      el("div", { class: "pg-wrap" }, el("table", { class: "pg" }, thead, el("tbody", {}, ...linhas)))
    );
    lista.forEach(p => atualizarResumo(p));
  }

  desenhar();
}

/** Força recarregar as presenças do servidor na próxima abertura. */
export function limparCachePresencas() { CACHE = null; }
