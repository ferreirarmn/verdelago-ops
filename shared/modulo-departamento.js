// ============================================================================
// modulo-departamento.js — Fábrica de módulos de departamento
// ----------------------------------------------------------------------------
// Cria um módulo com sub-separadores Equipa (CRUD de pessoas) e Presenças
// (grelha mensal partilhada). Usado por HSK, F&B, Recreativo e Serviços Centrais.
//
//   criarModuloDepartamento({
//     id, nome, icone,
//     selPessoas: (incluirInativas) => [...],   // quem pertence ao módulo
//     selFuncoes: () => [...],                   // funções para o dropdown
//   })
// ============================================================================

import { el, toast, modal, badge } from "../core/ui.js";
import { dados, funcaoDaPessoa, funcaoEhLookup, moduloDaPessoa } from "../core/store.js";
import * as graph from "../core/graph.js";
import { abrirImportarEquipa } from "./importar-equipa.js";
import { grelhaPresencas } from "./presencas.js";

function garantirEstilos() {
  // Estilos centralizados em estilo.css (design system v2) — nada a injetar.
}

function proximoPessoaId() {
  const ns = dados.pessoas.map(p => parseInt(String(p.Title).replace(/^P/, ""), 10)).filter(n => !isNaN(n));
  return "P" + String((ns.length ? Math.max(...ns) : 0) + 1).padStart(3, "0");
}

// cor da pill de empresa (tom suave por agência)
function classeEmpresa(emp) {
  const e = (emp || "").toLowerCase();
  if (e.includes("timing")) return "e-azul";
  if (e.includes("talenter")) return "e-verde";
  if (e.includes("serlima")) return "e-rosa";
  if (e.includes("verdelago") || e.includes("b&g") || e.includes("blue")) return "e-teal";
  if (!e) return "e-cinza";
  return "e-laranja";
}
function classeEstado(est) {
  const e = (est || "").toLowerCase();
  if (e.includes("inativ")) return "est-inativo";
  if (e.includes("cheg")) return "est-chegar";
  if (e.includes("teste")) return "est-teste";
  return "est-ativo";
}
// avatar: iniciais + cor estável a partir do nome
const PALETA = ["#2f7d4f", "#3667b0", "#b0436e", "#0d5450", "#b3702a", "#6a5fb0", "#1f8a8a"];
function avatar(nome) {
  const txt = String(nome || "?").trim();
  const ini = txt.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  let h = 0; for (const c of txt) h = (h * 31 + c.charCodeAt(0)) % 997;
  return el("span", { class: "avatar", style: "background:" + PALETA[h % PALETA.length] }, ini);
}

// Colunas extra da Lista Pessoas (descobertas no SharePoint) — partilhadas por
// todos os módulos de departamento e carregadas uma só vez.
let COLUNAS_EXTRA = null;
async function colunasExtraPessoas() {
  if (COLUNAS_EXTRA) return COLUNAS_EXTRA;
  const base = new Set(["Title", "Nome", "FuncaoID", "EmpresaAgencia", "Vinculo", "Estado"]);
  const sistema = /^(_|LinkTitle|DocIcon|FileLeafRef|FolderChildCount|ItemChildCount|ComplianceAssetId|AppAuthor|AppEditor|ContentType|Attachments|Edit|id)$/i;
  try {
    const todas = await graph.colunasDaLista("Pessoas");
    // só campos editáveis simples (texto/data/número) — lookups e sistema ficam de fora
    COLUNAS_EXTRA = todas.filter(c => !c.readOnly && !c.lookup && !base.has(c.name) && !sistema.test(c.name));
  } catch { COLUNAS_EXTRA = []; }
  return COLUNAS_EXTRA;
}
const isoParaData = v => { if (!v) return ""; const d = new Date(v); return isNaN(d) ? "" : d.toISOString().slice(0, 10); };

export function criarModuloDepartamento(cfg) {
  const M = { sub: "equipa", verInativas: false, busca: "" };

  function render(core, alvo) {
    garantirEstilos();
    if (cfg.geral) {
      const corpo = el("div", {});
      alvo.replaceChildren(
        el("div", { class: "mod-cab" },
          el("h2", {}, cfg.nome),
          el("p", { class: "mut" }, "Todos os colaboradores — pesquisar, filtrar, verificar e editar numa lista única.")),
        corpo);
      vistaEquipa(corpo, core, alvo);
      return;
    }
    const aba = (id, txt) => el("button", {
      class: "sub-tab" + (M.sub === id ? " ativo" : ""),
      onclick: () => { M.sub = id; render(core, alvo); }
    }, txt);

    const corpo = el("div", {});
    alvo.replaceChildren(
      el("div", { class: "mod-cab" },
        el("h2", {}, cfg.nome),
        el("p", { class: "mut" }, "Equipa e presenças.")),
      el("div", { class: "sub-tabs" }, aba("equipa", "Equipa"), aba("presencas", "Presenças")),
      corpo
    );
    if (M.sub === "equipa") vistaEquipa(corpo, core, alvo);
    else vistaPresencas(corpo);
  }

  // -------- EQUIPA --------
  function vistaEquipa(corpo, core, alvo) {
    const geral = !!cfg.geral;
    const pessoas = cfg.selPessoas(M.verInativas);
    const rotulo = geral ? "colaboradores" : "pessoas em " + cfg.nome;
    const contagem = el("span", { class: "esq" }, pessoas.length + " " + rotulo);
    const busca = el("input", { class: "campo", style: "max-width:280px", type: "search", placeholder: "Pesquisar por nome…", value: M.busca || "" });

    // filtros (só na vista geral)
    M.filtro = M.filtro || { dep: "", vinc: "", estado: "" };
    const opcoes = (lista, atual) => [el("option", { value: "" }, "Todos"), ...lista.map(v => el("option", { value: v, ...(v === atual ? { selected: "selected" } : {}) }, v))];
    const deps = [...new Set(pessoas.map(p => moduloDaPessoa(p) || "—"))].sort();
    const vincs = [...new Set(pessoas.map(p => p.Vinculo).filter(Boolean))].sort();
    const estados = [...new Set(pessoas.map(p => p.Estado || "Ativo"))].sort();
    const selDep = el("select", { class: "campo", style: "max-width:170px", onchange: e => { M.filtro.dep = e.target.value; render(core, alvo); } }, ...opcoes(deps, M.filtro.dep));
    const selVinc = el("select", { class: "campo", style: "max-width:140px", onchange: e => { M.filtro.vinc = e.target.value; render(core, alvo); } }, ...opcoes(vincs, M.filtro.vinc));
    const selEstado = el("select", { class: "campo", style: "max-width:150px", onchange: e => { M.filtro.estado = e.target.value; render(core, alvo); } }, ...opcoes(estados, M.filtro.estado));

    const acoes = [
      contagem, busca,
      el("label", { style: "font-size:13px;color:var(--mut)" },
        el("input", { type: "checkbox", ...(M.verInativas ? { checked: "checked" } : {}),
          onchange: () => { M.verInativas = !M.verInativas; render(core, alvo); } }),
        " mostrar inativas")
    ];
    if (geral) acoes.push(
      el("label", { style: "font-size:12px;color:var(--mut)" }, "Dept "), selDep,
      el("label", { style: "font-size:12px;color:var(--mut)" }, "Vínculo "), selVinc,
      el("label", { style: "font-size:12px;color:var(--mut)" }, "Estado "), selEstado);
    else acoes.push(el("button", { class: "btn-sec", onclick: () => abrirImportarEquipa(cfg, COLUNAS_EXTRA || [], () => render(core, alvo)) }, "Importar equipa (Excel)"));
    acoes.push(el("button", { class: "btn-sec", onclick: () => exportarPessoasExcel(cfg, geral, COLUNAS_EXTRA || []) }, "Exportar Excel"));
    acoes.push(el("button", { class: "btn", onclick: () => editorPessoa(null, core, alvo) }, "+ Acrescentar pessoa"));
    corpo.replaceChildren(el("div", { class: "barra-acoes" }, ...acoes));

    if (!pessoas.length) {
      corpo.append(el("div", { class: "mod-nota" },
        dados.pessoas.length
          ? "Há pessoas carregadas, mas nenhuma neste módulo. Confirma o FuncaoID/Departamento na Lista Pessoas/Funções."
          : "Ainda não há pessoas carregadas na Lista Pessoas."));
      return;
    }

    const norm = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    const linhas = pessoas
      .sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt"))
      .map(p => {
        const f = funcaoDaPessoa(p);
        const dep = moduloDaPessoa(p) || "—";
        const cels = [
          el("td", {}, el("div", { class: "pess-nome" }, avatar(p.Nome), el("span", { class: "n" }, p.Nome || "—"))),
          geral ? el("td", {}, el("span", { class: "mut" }, dep)) : null,
          el("td", {}, f ? f.Nome : "—"),
          el("td", {}, p.EmpresaAgencia ? el("span", { class: "pill-emp " + classeEmpresa(p.EmpresaAgencia) }, p.EmpresaAgencia) : el("span", { class: "mut" }, "—")),
          el("td", {}, p.Vinculo || el("span", { class: "mut" }, "—")),
          el("td", {}, el("span", { class: "pill " + classeEstado(p.Estado) }, p.Estado || "Ativo"))
        ].filter(Boolean);
        const tr = el("tr", { onclick: () => editorPessoa(p, core, alvo) }, ...cels);
        tr.dataset.nome = norm(p.Nome);
        tr.dataset.dep = dep; tr.dataset.vinc = p.Vinculo || ""; tr.dataset.estado = p.Estado || "Ativo";
        return tr;
      });

    const filtrar = () => {
      const q = norm(busca.value); M.busca = busca.value;
      const { dep, vinc, estado } = M.filtro;
      let visiveis = 0;
      for (const tr of linhas) {
        const ok = (!q || tr.dataset.nome.includes(q)) &&
          (!dep || tr.dataset.dep === dep) && (!vinc || tr.dataset.vinc === vinc) && (!estado || tr.dataset.estado === estado);
        tr.style.display = ok ? "" : "none"; if (ok) visiveis++;
      }
      const filtrado = q || dep || vinc || estado;
      contagem.textContent = (filtrado ? visiveis + " de " + pessoas.length : pessoas.length + " " + rotulo);
    };
    busca.addEventListener("input", filtrar);
    filtrar();

    const cabs = [el("th", {}, "Nome"), geral ? el("th", {}, "Departamento") : null, el("th", {}, "Função"), el("th", {}, "Empresa"), el("th", {}, "Vínculo"), el("th", {}, "Estado")].filter(Boolean);
    corpo.append(el("table", { class: "tab-pessoas" },
      el("thead", {}, el("tr", {}, ...cabs)),
      el("tbody", {}, ...linhas)));
  }

  function editorPessoa(p, core, alvo) {
    const novo = !p;
    const fAtual = p ? funcaoDaPessoa(p) : null;

    const inNome = el("input", { class: "campo", value: p?.Nome || "" });

    // Dropdown de função com TODAS as funções, agrupadas por departamento.
    // Escolher uma função de outro departamento move a pessoa (departamento
    // deriva sempre da função — fonte única).
    const porGrupo = {};
    dados.funcoes.forEach(f => {
      const g = (f.Departamento || f.Modulo || "Outros").trim() || "Outros";
      (porGrupo[g] ||= []).push(f);
    });
    const selFunc = el("select", { class: "campo" },
      el("option", { value: "" }, "— função —"),
      ...Object.keys(porGrupo).sort((a, b) => a.localeCompare(b, "pt")).map(g =>
        el("optgroup", { label: g },
          ...porGrupo[g].sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt")).map(f =>
            el("option", { value: f.Title, ...(fAtual && fAtual.Title === f.Title ? { selected: "selected" } : {}) }, f.Nome)))));
    // feedback do departamento resultante da função escolhida
    const fbDept = el("div", { class: "mut", style: "font-size:12px;margin-top:5px" });
    const mostraDept = () => {
      const f = dados.funcoes.find(x => x.Title === selFunc.value);
      const dep = f ? (f.Departamento || f.Modulo || "—") : "";
      fbDept.textContent = f ? ("→ Departamento: " + dep) : "";
      const movido = f && fAtual && (f.Modulo || "") !== (fAtual.Modulo || "");
      fbDept.style.color = movido ? "var(--amber)" : "var(--mut)";
      if (movido) fbDept.textContent += "  (move a pessoa de " + (fAtual.Departamento || fAtual.Modulo || "—") + ")";
    };
    selFunc.addEventListener("change", mostraDept); mostraDept();

    const inEmpresa = el("input", { class: "campo", value: p?.EmpresaAgencia || "" });
    const selVinculo = el("select", { class: "campo" },
      ...["", "Quadro", "Sazonal", "TT", "Estágio"].map(v =>
        el("option", { value: v, ...(p?.Vinculo === v ? { selected: "selected" } : {}) }, v || "— vínculo —")));
    const selEstado = el("select", { class: "campo" },
      ...["Ativo", "Por chegar", "Inativo"].map(v =>
        el("option", { value: v, ...((p?.Estado || "Ativo") === v ? { selected: "selected" } : {}) }, v)));

    // Campos extra descobertos na Lista Pessoas (custo real, datas, contactos…)
    const extras = COLUNAS_EXTRA || [];
    const inputsExtra = {};
    const camposExtraEls = extras.map(c => {
      const tipo = c.tipo || "text";
      const valAtual = p ? p[c.name] : "";
      let input;
      if (tipo === "date") input = el("input", { class: "campo", type: "date", value: isoParaData(valAtual) });
      else if (tipo === "number") input = el("input", { class: "campo", type: "number", step: "0.01", value: valAtual ?? "" });
      else input = el("input", { class: "campo", type: "text", value: valAtual ?? "" });
      inputsExtra[c.name] = { input, tipo };
      return el("div", {}, el("label", {}, c.displayName || c.name), input);
    });

    let fechar;
    const guardar = el("button", { class: "btn", onclick: async () => {
      const nome = inNome.value.trim();
      if (!nome) return toast("Indica o nome.", "error");
      const campos = { Nome: nome, EmpresaAgencia: inEmpresa.value.trim(), Vinculo: selVinculo.value, Estado: selEstado.value };
      const fId = selFunc.value;
      if (fId) {
        if (funcaoEhLookup()) {
          const fObj = dados.funcoes.find(f => f.Title === fId);
          if (fObj) campos.FuncaoIDLookupId = Number(fObj._id);
        } else campos.FuncaoID = fId;
      }
      // juntar campos extra conforme o tipo (número→Number, data→ISO, resto→texto)
      for (const [name, { input, tipo }] of Object.entries(inputsExtra)) {
        const v = (input.value ?? "").trim();
        if (tipo === "date") { if (v) campos[name] = new Date(v).toISOString(); }
        else if (tipo === "number") { if (v !== "") campos[name] = Number(v); }
        else campos[name] = v;
      }
      const fNova = dados.funcoes.find(x => x.Title === fId);
      const moveu = fNova && fAtual && (fNova.Modulo || "") !== (fAtual.Modulo || "");
      try {
        guardar.disabled = true; badge("syncing");
        if (novo) {
          const id = proximoPessoaId();
          const r = await graph.criarItem("Pessoas", { Title: id, ...campos });
          dados.pessoas.push({ _id: r.id, Title: id, ...campos, ...(fId && !funcaoEhLookup() ? { FuncaoID: fId } : {}) });
          toast("Pessoa criada: " + nome);
        } else {
          await graph.atualizarItem("Pessoas", p._id, campos);
          Object.assign(p, campos);
          if (fId && !funcaoEhLookup()) p.FuncaoID = fId;
          if (fId && funcaoEhLookup()) p.FuncaoIDLookupId = campos.FuncaoIDLookupId;
          toast(moveu ? ("Movida: " + (fAtual.Departamento || fAtual.Modulo || "—") + " → " + (fNova.Departamento || fNova.Modulo || "—")) : "Pessoa atualizada");
        }
        badge("connected"); fechar(); render(core, alvo);
      } catch (e) { badge("error", e.message); toast("Falhou: " + e.message, "error"); guardar.disabled = false; }
    }}, novo ? "Criar" : "Guardar");

    const acoes = el("div", { style: "display:flex;gap:8px;margin-top:6px;flex-wrap:wrap" }, guardar);
    if (!novo) {
      acoes.append(el("button", { class: "btn-sec", onclick: async () => {
        try { badge("syncing"); await graph.atualizarItem("Pessoas", p._id, { Estado: "Inativo" }); p.Estado = "Inativo"; badge("connected"); toast("Pessoa inativada"); fechar(); render(core, alvo); }
        catch (e) { badge("error"); toast("Falhou: " + e.message, "error"); }
      }}, "Inativar (retirar)"));
    }

    const form = el("div", {},
      el("div", { class: "form-grid" },
        el("div", {}, el("label", {}, "Nome"), inNome),
        el("div", {}, el("label", {}, "Função"), selFunc, fbDept),
        el("div", {}, el("label", {}, "Empresa / agência"), inEmpresa),
        el("div", {}, el("label", {}, "Vínculo"), selVinculo),
        el("div", {}, el("label", {}, "Estado"), selEstado)),
      camposExtraEls.length
        ? el("div", {},
            el("h3", { style: "font-size:14px;color:var(--teal);margin:16px 0 8px" }, "Outros dados"),
            el("div", { class: "form-grid" }, ...camposExtraEls))
        : null,
      acoes);
    fechar = modal(novo ? "Acrescentar pessoa — " + cfg.nome : "Editar — " + (p.Nome || ""), form);
  }

  // -------- PRESENÇAS --------
  async function vistaPresencas(corpo) {
    const pessoas = cfg.selPessoas(false).sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt"));
    if (!pessoas.length) {
      corpo.replaceChildren(el("div", { class: "mod-nota" }, "Sem pessoas neste módulo para marcar presenças."));
      return;
    }
    await grelhaPresencas(corpo, pessoas);
  }

  return { id: cfg.id, nome: cfg.nome, icone: cfg.icone, async init() { garantirEstilos(); await colunasExtraPessoas().catch(() => {}); }, render };
}

// ---- exportação para Excel (equipa geral e departamentos) -------------------
function carregarXLSXmd() {
  return new Promise((res, rej) => {
    if (window.XLSX) return res();
    const s = document.createElement("script"); s.src = "lib/xlsx.full.min.js";
    s.onload = () => res(); s.onerror = () => rej(new Error("Falha a carregar Excel"));
    document.head.append(s);
  });
}
async function exportarPessoasExcel(cfg, geral, extra, M) {
  try {
    badge("syncing"); await carregarXLSXmd(); const X = window.XLSX;
    // pessoas: respeita "mostrar inativas" e (no geral) os filtros dept/vínculo/estado
    let ps = cfg.selPessoas(M.verInativas);
    if (geral && M.filtro) {
      const { dep, vinc, estado } = M.filtro;
      ps = ps.filter(p => (!dep || (moduloDaPessoa(p) || "—") === dep) && (!vinc || (p.Vinculo || "") === vinc) && (!estado || (p.Estado || "Ativo") === estado));
    }
    ps = ps.slice().sort((a, b) => (a.Nome || "").localeCompare(b.Nome || "", "pt"));
    const cab = ["Nome", ...(geral ? ["Departamento"] : []), "Função", "Empresa/Agência", "Vínculo", "Estado", ...extra.map(c => c.displayName || c.name)];
    const linhas = [cab];
    ps.forEach(p => {
      const f = funcaoDaPessoa(p);
      linhas.push([
        p.Nome || "",
        ...(geral ? [moduloDaPessoa(p) || ""] : []),
        f ? f.Nome : "",
        p.EmpresaAgencia || "",
        p.Vinculo || "",
        p.Estado || "Ativo",
        ...extra.map(c => { const v = p[c.name]; return v == null ? "" : v; })
      ]);
    });
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(linhas), (geral ? "Equipa" : cfg.nome).slice(0, 28));
    const nome = "Verdelago_" + (geral ? "Equipa" : cfg.nome).replace(/[^\wÀ-ÿ]+/g, "_") + "_" + new Date().toISOString().slice(0, 10) + ".xlsx";
    X.writeFile(wb, nome);
    badge("connected"); toast("Exportadas " + ps.length + " pessoas (com função).");
  } catch (e) { badge("error", e.message); toast("Falhou a exportação: " + e.message, "error"); }
}
