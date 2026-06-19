// mapeamento.js — módulo "Correspondências"
// Liga os nomes do PLANO (orçamento) aos nomes do REAL (funções/departamentos),
// para que as comparações plano vs real fiquem exatas em toda a app.
import { el, toast, badge, modal } from "../core/ui.js";
import * as graph from "../core/graph.js";
import { dados, funcaoDaPessoa } from "../core/store.js";
import { carregarCorrespondencias, itensCorrespondencia, normCorr } from "../core/correspondencias.js";

const M = { itens: [], erro: null, tipo: "Função", plano: null, planoCol: null };

// distância simples para sugerir correspondências automáticas
function semelhanca(a, b) {
  a = normCorr(a); b = normCorr(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const A = new Set(a.split(" ")), B = new Set(b.split(" "));
  const inter = [...A].filter(x => B.has(x)).length;
  return inter / Math.max(A.size, B.size);
}

// nomes distintos no PLANO (Lista Orçamento): departamentos e categorias
function nomesPlano(tipo) {
  if (!M.plano) return [];
  const cm = M.planoCol, col = tipo === "Departamento" ? cm.departamento : cm.categoria;
  return [...new Set(M.plano.map(l => (l[col] || "").trim()).filter(Boolean))].sort();
}
// nomes distintos no REAL: para Departamento, junta o campo Departamento das
// funções (ex.: F&B-FOH, F&B-BOH) e o Módulo (ex.: F&B) — para se poder mapear
// ao nível que se quiser. Para Função, os nomes das funções (Lista Funções).
function nomesReal(tipo) {
  if (tipo === "Departamento") {
    const deps = dados.funcoes.map(f => (f.Departamento || "").trim());
    const mods = dados.funcoes.map(f => (f.Modulo || "").trim());
    return [...new Set([...deps, ...mods].filter(Boolean))].sort();
  }
  return [...new Set(dados.funcoes.map(f => (f.Nome || "").trim()).filter(Boolean))].sort();
}

export const moduloMapeamento = {
  id: "mapeamento", nome: "Correspondências", icone: "mapeamento",

  async init() {
    try { M.itens = await carregarCorrespondencias(); } catch (e) { M.erro = e.message; }
    try {
      const [linhas, colunas] = await Promise.all([graph.lerLista("Orçamento"), graph.colunasDaLista("Orçamento")]);
      const by = {}; colunas.forEach(c => by[normCorr(c.displayName)] = c.name);
      const get = d => by[normCorr(d)] || d;
      M.planoCol = { departamento: get("Departamento"), categoria: get("Categoria") };
      M.plano = linhas;
    } catch { M.plano = null; }
  },

  render(core, alvo) {
    const self = this;
    if (M.erro) {
      alvo.replaceChildren(
        el("div", { class: "mod-cab" }, el("h2", {}, "Correspondências")),
        el("div", { class: "mod-nota" },
          "Não foi possível ler a Lista \"Correspondencias\". Confirma que existe no site (colunas: Title, Tipo, NomeReal). Detalhe: " + M.erro));
      return;
    }
    const aba = (id, txt) => el("button", { class: "sub-tab" + (M.tipo === id ? " ativo" : ""), onclick: () => { M.tipo = id; self.render(core, alvo); } }, txt);
    const corpo = el("div", {});
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, "Correspondências"),
        el("p", { class: "mut" }, "Liga os nomes do orçamento aos nomes reais (funções e departamentos). As comparações plano vs real passam a usar esta tabela.")),
      el("div", { class: "sub-tabs" }, aba("Função", "Funções"), aba("Departamento", "Departamentos")),
      corpo);
    vista(corpo, self, core, alvo);
  }
};

function vista(corpo, self, core, alvo) {
  const tipo = M.tipo;
  const plano = nomesPlano(tipo), real = nomesReal(tipo);
  const itens = itensCorrespondencia().filter(it => (it.TipoCorr || "Função") === tipo);
  const mapPlano = {}; itens.forEach(it => mapPlano[normCorr(it.Title)] = it);
  // nomes que já são destino canónico (NomeReal de alguma correspondência) — não precisam de mapear
  const destinos = new Set(itens.map(it => normCorr(it.NomeReal)));

  // por mapear = nomes "órfãos" (existem só de um lado: plano sem par no real, ou
  // real sem par no plano) e ainda sem correspondência. Os que coincidem nos dois
  // lados já casam sozinhos; os que já são destino canónico ficam como estão.
  const normPlano = new Set(plano.map(normCorr)), normReal = new Set(real.map(normCorr));
  const candidatos = [...new Set([...plano, ...real])];
  const porMapear = candidatos.filter(nm => {
    const n = normCorr(nm);
    if (mapPlano[n] || destinos.has(n)) return false;
    return !(normPlano.has(n) && normReal.has(n));
  });

  const aviso = el("div", { class: "mod-nota", style: porMapear.length ? "border-left:3px solid var(--gold)" : "" },
    porMapear.length
      ? (porMapear.length + " nome(s) sem correspondência. Mapeia os que são o mesmo (ex.: 'Empregada de Andares' → 'Empregado de Andares/Quartos') ou que devem agregar noutro (ex.: 'Valete' → 'Empregado de Limpeza').")
      : "Todos os nomes têm correspondência. ✓");

  const barra = el("div", { class: "barra-acoes" },
    el("span", { class: "esq" }, itens.length + " correspondências · " + tipo),
    el("button", { class: "btn", onclick: () => editar(null, self, core, alvo) }, "+ Nova correspondência"));

  // tabela de correspondências existentes
  const linhas = itens.slice().sort((a, b) => (a.Title || "").localeCompare(b.Title || "", "pt")).map(it =>
    el("tr", { onclick: () => editar(it, self, core, alvo), style: "cursor:pointer" },
      el("td", {}, it.Title || "—"),
      el("td", {}, el("span", { class: "mut" }, "→")),
      el("td", {}, it.NomeReal || "—")));
  const tabela = el("table", { class: "tab-pessoas" },
    el("thead", {}, el("tr", {}, el("th", {}, "Nome no orçamento (plano)"), el("th", {}, ""), el("th", {}, "Nome real (canónico)"))),
    el("tbody", {}, ...(linhas.length ? linhas : [el("tr", {}, el("td", { colspan: 3, class: "mut" }, "Sem correspondências ainda."))])));

  // por mapear, com sugestão automática
  const sugestoes = porMapear.map(nm => {
    let melhor = null, sc = 0;
    real.forEach(r => { if (normCorr(r) === normCorr(nm)) return; const s = semelhanca(nm, r); if (s > sc) { sc = s; melhor = r; } });
    return el("tr", {},
      el("td", {}, nm),
      el("td", {}, melhor && sc >= 0.5 ? el("span", {}, "sugestão: ", el("b", {}, melhor)) : el("span", { class: "mut" }, "sem sugestão")),
      el("td", {}, el("button", { class: "btn-sec", onclick: () => editar({ Title: nm, TipoCorr: tipo, NomeReal: (sc >= 0.5 ? melhor : "") }, self, core, alvo) }, "Mapear")));
  });
  const tabelaPorMapear = porMapear.length ? el("div", { class: "esc-sec" },
    el("h3", {}, "Por mapear (" + porMapear.length + ")"),
    el("table", { class: "tab-pessoas" },
      el("thead", {}, el("tr", {}, el("th", {}, "Nome no orçamento"), el("th", {}, "Sugestão automática"), el("th", {}, ""))),
      el("tbody", {}, ...sugestoes))) : null;

  corpo.replaceChildren(aviso, barra, tabela, ...(tabelaPorMapear ? [tabelaPorMapear] : []));
}

function editar(item, self, core, alvo) {
  const tipo = item?.TipoCorr || M.tipo;
  const real = nomesReal(tipo);
  const novo = !item || !item._id;
  const inPlano = el("input", { class: "campo", value: item?.Title || "", placeholder: "Nome tal como aparece no orçamento" });
  const selReal = el("select", { class: "campo" },
    el("option", { value: "" }, "— escolher nome real —"),
    ...real.map(r => el("option", { value: r, ...(r === item?.NomeReal ? { selected: "selected" } : {}) }, r)));
  // permite também escrever um real que não esteja na lista
  const inRealLivre = el("input", { class: "campo", value: (item?.NomeReal && !real.includes(item.NomeReal)) ? item.NomeReal : "", placeholder: "ou escrever à mão (opcional)" });

  const guardar = async () => {
    const plano = inPlano.value.trim();
    const realNome = (inRealLivre.value.trim() || selReal.value || "").trim();
    if (!plano || !realNome) { toast("Preenche o nome do plano e o nome real.", "error"); return; }
    try {
      badge("syncing");
      const campos = { Title: plano, TipoCorr: tipo, NomeReal: realNome };
      if (novo) await graph.criarItem("Correspondencias", campos);
      else await graph.atualizarItem("Correspondencias", item._id, campos);
      await carregarCorrespondencias();
      badge("connected"); toast("Correspondência guardada."); fechar(); self.render(core, alvo);
    } catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); }
  };
  const apagar = async () => {
    if (!item?._id) return;
    try { badge("syncing"); await graph.apagarItem("Correspondencias", item._id); await carregarCorrespondencias(); badge("connected"); toast("Correspondência apagada."); fechar(); self.render(core, alvo); }
    catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); }
  };

  const form = el("div", { class: "esc-edit" },
    el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, "Tipo"), el("span", {}, tipo)),
    el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, "Nome no orçamento (plano)"), inPlano),
    el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, "Nome real (da lista)"), selReal),
    el("label", { class: "campo-bloco" }, el("span", { class: "campo-lbl" }, "Nome real (livre)"), inRealLivre),
    el("div", { class: "form-acoes" },
      ...(novo ? [] : [el("button", { class: "btn-perigo", onclick: apagar }, "Apagar")]),
      el("button", { class: "btn-sec", onclick: () => fechar() }, "Cancelar"),
      el("button", { class: "btn", onclick: guardar }, "Guardar")));
  const fechar = modal((novo ? "Nova correspondência" : "Editar correspondência") + " · " + tipo, form);
}
