// ============================================================================
// atualizacoes.js — Aplicador de atualizações em massa (revisto antes de aplicar)
// ----------------------------------------------------------------------------
// Lê um ficheiro de alterações já reconciliado (atualizacoes.json), mostra o
// que vai mudar, e ao confirmar aplica cada alteração à Lista Pessoas PELO
// PessoaID (nunca por posição). Atualiza fichas existentes e cria as novas.
// Para futuras atualizações, basta substituir o atualizacoes.json.
// ============================================================================

import { el, toast, badge } from "../core/ui.js";
import { dados, funcaoPorId, funcaoEhLookup } from "../core/store.js";
import * as graph from "../core/graph.js";

const M = { patch: null, erro: null, aplicado: false, presIndex: null, camasAtuais: null, funcIndex: null, fonte: "json", ficheiro: null, avisos: [] };

// normaliza um nome para comparação (minúsculas, sem acentos)
function norm(s) {
  return String(s || "").trim().toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
// resolve um nome para uma pessoa viva (exato; depois primeiro+último)
function pessoaPorNome(nome) {
  if (!M.presIndex) {
    M.presIndex = new Map();
    for (const p of dados.pessoas) {
      const n = norm(p.Nome);
      if (!M.presIndex.has(n)) M.presIndex.set(n, p);
      const t = n.split(" ");
      if (t.length >= 2) {
        const alt = t[0] + " " + t[t.length - 1];
        if (!M.presIndex.has(alt)) M.presIndex.set(alt, p);
      }
    }
  }
  const n = norm(nome);
  if (M.presIndex.has(n)) return M.presIndex.get(n);
  const t = n.split(" ");
  if (t.length >= 2) { const alt = t[0] + " " + t[t.length - 1]; if (M.presIndex.has(alt)) return M.presIndex.get(alt); }
  return null;
}

function garantirEstilos() {
  if (document.getElementById("atz-css")) return;
  const css = `
  .atz-kpis{display:flex;gap:10px;flex-wrap:wrap;margin:6px 0 18px}
  .atz-kpis .kpi{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:12px 16px;min-width:130px;box-shadow:var(--sh-1)}
  .atz-kpis .kpi b{font-family:var(--serif);font-size:26px;color:var(--ink);display:block;line-height:1}
  .atz-kpis .kpi span{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);font-weight:600}
  .atz-import{display:flex;gap:16px;align-items:center;background:var(--softer);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;margin-bottom:18px}
  .atz-import .btn{margin-left:auto;white-space:nowrap}
  .atz-fonte{display:flex;align-items:center;gap:8px;background:#eef6f4;border:1px solid var(--line);border-left:3px solid var(--teal);border-radius:var(--r-sm);padding:10px 14px;margin-bottom:12px;font-size:14px}
  .atz-sec{margin:18px 0}
  .atz-sec h3{font-size:16px;color:var(--teal);margin:0 0 8px}
  .atz-tab{width:100%;border-collapse:separate;border-spacing:0;font-size:13.5px;background:var(--card);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;box-shadow:var(--sh-1)}
  .atz-tab th{background:transparent;text-align:left;padding:11px 14px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);font-weight:600;border-bottom:1px solid var(--line)}
  .atz-tab td{padding:10px 14px;border-top:1px solid var(--line-2);vertical-align:top}
  .atz-tab .mud{color:var(--teal-d)}
  .atz-warn{color:var(--amber);font-size:12.5px;margin:4px 0}
  .atz-barra{display:flex;gap:10px;align-items:center;margin:18px 0 4px}
  .btn{background:var(--teal);color:#fff;border:none;border-radius:var(--r-sm);padding:10px 20px;font-weight:600;cursor:pointer}
  .btn:hover{background:var(--teal-d)} .btn:disabled{opacity:.55}
  .btn-sec{background:var(--card);color:var(--teal-d);border:1px solid var(--line);border-radius:var(--r-sm);padding:8px 14px;font-weight:600;cursor:pointer}
  .atz-log{margin-top:14px;font-size:13px;background:var(--softer);border:1px solid var(--line);border-radius:var(--r-sm);padding:12px 14px;max-height:240px;overflow:auto}
  .atz-log .ok{color:var(--teal)} .atz-log .ko{color:#b34b4b}
  `;
  document.head.append(el("style", { id: "atz-css", html: css }));
}

function proximoPessoaId(extra = 0) {
  const ns = dados.pessoas.map(p => parseInt(String(p.Title).replace(/^P/, ""), 10)).filter(n => !isNaN(n));
  return "P" + String((ns.length ? Math.max(...ns) : 0) + 1 + extra).padStart(3, "0");
}
const labelCampo = { EmpresaAgencia: "Empresa", Vinculo: "Vínculo", Estado: "Estado", FuncaoID: "Função" };

// ---- SheetJS local (rede bloqueia CDN) ----
function carregarXLSX() {
  return new Promise((res, rej) => {
    if (window.XLSX) return res();
    const s = document.createElement("script"); s.src = "lib/xlsx.full.min.js";
    s.onload = () => res(); s.onerror = () => rej(new Error("Falha a carregar o leitor de Excel."));
    document.head.append(s);
  });
}

// resolve um texto de função para um FuncaoID vivo (normalizado + contém)
function funcaoIdPorTexto(txt) {
  if (!M.funcIndex) {
    M.funcIndex = new Map();
    for (const f of dados.funcoes) M.funcIndex.set(norm(f.Nome), f.Title);
  }
  const n = norm(txt); if (!n) return null;
  if (M.funcIndex.has(n)) return M.funcIndex.get(n);
  for (const [nome, id] of M.funcIndex) if (nome && (nome.includes(n) || n.includes(nome))) return id;
  return null;
}
const nomeFuncao = id => (dados.funcoes.find(f => f.Title === id) || {}).Nome || id;

// distância simples para sinalizar possíveis duplicados (typos)
function pareceExistir(nome) {
  const n = norm(nome); if (!n || !M.presIndex) return null;
  for (const k of M.presIndex.keys()) {
    if (k === n) continue;
    const a = n, b = k; if (Math.abs(a.length - b.length) > 2) continue;
    let dist = 0, i = 0, j = 0;
    // Levenshtein curto
    const m = a.length, q = b.length, dp = Array.from({ length: m + 1 }, (_, x) => [x, ...Array(q).fill(0)]);
    for (let y = 0; y <= q; y++) dp[0][y] = y;
    for (i = 1; i <= m; i++) for (j = 1; j <= q; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    dist = dp[m][q];
    if (dist <= 2 && dist / Math.max(m, q) <= 0.18) return M.presIndex.get(k).Nome;
  }
  return null;
}

// ---- ler ficheiro escolhido e construir o patch ----
async function importarFicheiro(file, core, alvo) {
  M.avisos = [];
  try {
    badge("syncing");
    await carregarXLSX();
    const buf = await file.arrayBuffer();
    const wb = window.XLSX.read(buf, { type: "array" });
    const folhas = wb.SheetNames;
    M.presIndex = null; M.funcIndex = null; // reconstrói índices contra dados atuais

    if (folhas.includes("Camas")) {
      M.patch = parseAlojamento(wb);
      if (M.patch.camas_reload) { try { M.camasAtuais = await graph.lerLista("Camas"); } catch { M.camasAtuais = []; } }
    } else if (folhas.includes("Pessoas") || folhas.includes("Presenças")) {
      M.patch = parseHSK(wb);
    } else {
      throw new Error("Não reconheço as folhas (" + folhas.join(", ") + "). Esperava 'Pessoas'/'Presenças' ou 'Camas'.");
    }
    M.fonte = "import"; M.ficheiro = file.name; M.aplicado = false; M.erro = null;
    badge("connected");
    toast("Ficheiro lido: " + file.name);
  } catch (e) {
    badge("error", e.message);
    toast("Falha a ler: " + e.message, "error");
  }
  moduloAtualizacoes.render(core, alvo);
}

function linhasDaFolha(wb, nome) {
  const ws = wb.Sheets[nome]; if (!ws) return [];
  return window.XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });
}

// HSK: folhas "Pessoas" (updates/creates) e "Presenças" (marcações)
function parseHSK(wb) {
  const updates = [], creates = [], presencas = [];
  const mapEstado = v => { const e = norm(v); if (e.includes("inativ") || e.includes("dispens") || e.includes("saiu") || e.includes("saida")) return "Inativo"; return String(v || "Ativo").trim(); };

  for (const r of linhasDaFolha(wb, "Pessoas")) {
    const nome = String(r["Nome"] || "").trim(); if (!nome) continue;
    const empresa = String(r["Empresa"] || "").trim();
    const estado = mapEstado(r["Estado"]);
    const funcTxt = String(r["Função"] || "").trim();
    const fid = funcTxt ? funcaoIdPorTexto(funcTxt) : null;
    const viva = pessoaPorNome(nome);
    if (viva) {
      const campos = {};
      if (empresa && empresa !== (viva.EmpresaAgencia || "")) campos.EmpresaAgencia = empresa;
      if (estado && estado !== (viva.Estado || "")) campos.Estado = estado;
      if (fid && fid !== (viva.FuncaoID || (viva.FuncaoIDLookupId ? null : ""))) { /* função muda */ campos.FuncaoID = fid; }
      if (Object.keys(campos).length) updates.push({ PessoaID: viva.Title, Nome: viva.Nome, campos });
    } else {
      const dup = pareceExistir(nome);
      creates.push({ Nome: nome, EmpresaAgencia: empresa, Estado: estado, FuncaoID: fid, FuncaoNome: fid ? nomeFuncao(fid) : null, rever: dup });
      if (dup) M.avisos.push("“" + nome + "” parece-se com “" + dup + "” — confirma se não é a mesma pessoa.");
    }
  }

  // Presenças: colunas "MM-DD ddd" -> data; células P/F/D
  const linhasP = linhasDaFolha(wb, "Presenças");
  const estadoCel = { P: "Presente", F: "Falta", D: "Folga" };
  if (linhasP.length) {
    const cols = Object.keys(linhasP[0]).filter(k => /^\d{2}-\d{2}/.test(k.trim()));
    for (const r of linhasP) {
      const nome = String(r["Nome"] || "").trim(); if (!nome) continue;
      for (const c of cols) {
        const v = String(r[c] || "").trim().toUpperCase(); if (!v || !estadoCel[v]) continue;
        const mmdd = c.trim().slice(0, 5); // MM-DD
        presencas.push({ Nome: nome, Data: "2026-" + mmdd, Estado: estadoCel[v] });
      }
    }
  }
  return { updates, creates, presencas };
}

// Alojamento: folha "Camas" (cabeçalho na linha com 'ID'/'Edifício')
function parseAlojamento(wb) {
  const ws = wb.Sheets["Camas"];
  const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
  let hr = aoa.findIndex(row => row.map(x => String(x).trim()).includes("ID") && row.map(x => String(x).trim()).includes("Edifício"));
  if (hr < 0) hr = 3;
  const head = aoa[hr].map(x => String(x).trim());
  const idx = nome => head.indexOf(nome);
  const camas = [];
  const zonasNomes = new Set();
  for (let i = hr + 1; i < aoa.length; i++) {
    const row = aoa[i]; if (!row || !row.length) continue;
    const ed = String(row[idx("Edifício")] || "").trim(); if (!ed) continue;
    const seccao = String(row[idx("Secção")] || "").trim();
    const quarto = String(row[idx("Quarto")] || "").trim();
    const cama = String(row[idx("Cama")] || "").trim();
    const estado = String(row[idx("Estado")] || "Livre").trim() || "Livre";
    const nome = String(row[idx("Nome")] || "").trim();
    const dataC = String(row[idx("Data Chegada")] || "").trim();
    zonasNomes.add(ed);
    camas.push({
      Edificio: ed,
      Quarto: [seccao, quarto].filter(Boolean).join(" · "),
      Numero: cama,
      Estado: estado,
      Nome: nome || "",
      DataChegada: dataC ? dataC.slice(0, 10) : "",
    });
  }
  // zonas em falta -> propor criação (Tipologia Alojamento)
  const zonas_novas = [];
  for (const nome of zonasNomes) if (!dados.zonas.find(z => z.Nome === nome)) zonas_novas.push({ Nome: nome, Modulo: "HSK", Tipologia: "Alojamento" });
  return { camas_reload: { camas, zonas_novas } };
}

export const moduloAtualizacoes = {
  id: "atualizacoes",
  nome: "Atualizações",
  icone: "🔄",

  async init() {
    garantirEstilos();
    if (M.patch || M.fonte === "import") return;
    try {
      const r = await fetch("atualizacoes.json?" + Date.now());
      if (r.ok) {
        M.patch = await r.json();
        if (M.patch.camas_reload) { try { M.camasAtuais = await graph.lerLista("Camas"); } catch { M.camasAtuais = []; } }
      }
    } catch { /* sem ficheiro pré-feito: usa-se a importação */ }
  },

  render(core, alvo) {
    const self = this;
    // ---- barra de importação (sempre disponível) ----
    const inputFich = el("input", { type: "file", accept: ".xlsx,.xls", style: "display:none",
      onchange: e => { const f = e.target.files[0]; if (f) importarFicheiro(f, core, alvo); } });
    const barImport = el("div", { class: "atz-import" },
      el("div", {},
        el("strong", {}, "Importar ficheiro Excel"),
        el("p", { class: "mut", style: "margin:4px 0 0;font-size:13px" }, "HSK (folhas Pessoas/Presenças) ou Alojamento (folha Camas). A app lê, faz a correspondência por nome e mostra o que vai mudar antes de gravar.")),
      el("button", { class: "btn", onclick: () => inputFich.click() }, "Escolher ficheiro…"),
      inputFich);

    if (M.erro) {
      alvo.replaceChildren(el("div", { class: "mod-cab" }, el("h2", {}, "Atualizações"),
        el("p", { class: "mut" }, "Importa um ficheiro para atualizar pessoas, presenças ou alojamento.")),
        barImport, el("div", { class: "mod-nota" }, "Detalhe: " + M.erro));
      return;
    }

    const cab = el("div", { class: "mod-cab" }, el("h2", {}, "Atualizações"),
      el("p", { class: "mut" }, "Importa um ficheiro para atualizar pessoas, presenças ou alojamento. Revê e aplica."));

    if (!M.patch) {
      alvo.replaceChildren(cab, barImport,
        el("div", { class: "mod-nota" }, "Sem nada por aplicar de momento. Escolhe um ficheiro Excel acima para começar."));
      return;
    }

    const p = M.patch || { updates: [], creates: [], presencas: [] };
    const corpo = el("div", {});
    corpo.append(barImport);
    if (M.fonte === "import") {
      const banner = el("div", { class: "atz-fonte" },
        el("span", {}, "A rever importação de "), el("strong", {}, M.ficheiro || "ficheiro"),
        el("button", { class: "btn-sec", style: "margin-left:auto", onclick: () => { M.patch = null; M.fonte = "json"; M.ficheiro = null; M.camasAtuais = null; self.render(core, alvo); } }, "Limpar"));
      corpo.append(banner);
      for (const a of M.avisos) corpo.append(el("p", { class: "atz-warn" }, "⚠ " + a));
    }

    // ---- resolver presenças (por nome -> pessoa viva) ----
    const pres = p.presencas || [];
    const presOk = [], presNok = new Set();
    for (const m of pres) {
      const pessoa = pessoaPorNome(m.Nome);
      if (pessoa) presOk.push({ ...m, pid: pessoa.Title });
      else presNok.add(m.Nome);
    }
    const presPessoas = new Set(presOk.map(x => x.pid)).size;
    const presDatas = new Set(presOk.map(x => x.Data));

    // updates
    const tabUpd = el("table", { class: "atz-tab" },
      el("thead", {}, el("tr", {}, el("th", {}, "Pessoa"), el("th", {}, "PessoaID"), el("th", {}, "Alterações"))),
      el("tbody", {}, ...p.updates.map(u => {
        const existe = dados.pessoas.find(x => x.Title === u.PessoaID);
        const mud = Object.entries(u.campos).map(([k, v]) => (labelCampo[k] || k) + ": " + v).join(" · ");
        return el("tr", {},
          el("td", {}, u.Nome || "—", existe ? null : el("span", { class: "atz-warn" }, " (não encontrada!)")),
          el("td", {}, u.PessoaID),
          el("td", { class: "mud" }, mud));
      })));

    // creates
    const tabNov = el("table", { class: "atz-tab" },
      el("thead", {}, el("tr", {}, el("th", {}, "Nome"), el("th", {}, "Função"), el("th", {}, "Empresa"), el("th", {}, "Vínculo"), el("th", {}, "Estado"))),
      el("tbody", {}, ...p.creates.map(c =>
        el("tr", {},
          el("td", {}, c.Nome),
          el("td", {}, c.FuncaoID ? (c.FuncaoNome || c.FuncaoID) : el("span", { class: "atz-warn" }, "sem função — definir depois")),
          el("td", {}, c.EmpresaAgencia || "—"),
          el("td", {}, c.Vinculo || "—"),
          el("td", {}, c.Estado || "Ativo")))));

    const log = el("div", { class: "atz-log", style: "display:none" });
    const btn = el("button", { class: "btn", onclick: () => aplicar(core, alvo, btn, log, presOk) },
      "Aplicar tudo ao SharePoint");

    const kpis = el("div", { class: "atz-kpis" });
    if (p.updates.length) kpis.append(el("div", { class: "kpi" }, el("b", {}, "" + p.updates.length), el("span", {}, "fichas a atualizar")));
    if (p.creates.length) kpis.append(el("div", { class: "kpi" }, el("b", {}, "" + p.creates.length), el("span", {}, "pessoas a criar")));
    if (pres.length) {
      kpis.append(el("div", { class: "kpi" }, el("b", {}, "" + presOk.length), el("span", {}, "marcações de presença")));
      kpis.append(el("div", { class: "kpi" }, el("b", {}, "" + presPessoas), el("span", {}, "pessoas · " + presDatas.size + " dias")));
    }
    corpo.append(kpis);

    if (p.updates.length) corpo.append(el("div", { class: "atz-sec" }, el("h3", {}, "Atualizar fichas existentes"), tabUpd));
    if (p.creates.length) corpo.append(el("div", { class: "atz-sec" }, el("h3", {}, "Acrescentar pessoas novas"), tabNov));
    if (pres.length) {
      const datas = [...presDatas].sort();
      const resumoPres = el("div", {},
        el("p", { class: "mut" }, "Período: " + (datas[0] || "—") + " a " + (datas[datas.length - 1] || "—") +
          " · " + presOk.length + " marcações para " + presPessoas + " pessoas."));
      if (presNok.size) resumoPres.append(
        el("p", { class: "atz-warn" }, "Sem correspondência (não aplico): " + [...presNok].join(", ")));
      corpo.append(el("div", { class: "atz-sec" }, el("h3", {}, "Carregar presenças"), resumoPres));
    }

    // ---- recarga de camas ----
    const cr = p.camas_reload;
    let crResolvido = null;
    if (cr) {
      const occ = cr.camas.filter(c => c.Nome);
      const semMatch = new Set();
      for (const c of occ) if (!pessoaPorNome(c.Nome)) semMatch.add(c.Nome);
      crResolvido = { semMatch };
      const porEd = {};
      cr.camas.forEach(c => { porEd[c.Edificio] = (porEd[c.Edificio] || 0) + 1; });
      kpis.append(el("div", { class: "kpi" }, el("b", {}, "" + cr.camas.length), el("span", {}, "camas a recarregar")));
      const resumo = el("div", {},
        el("p", { class: "atz-warn" }, "⚠ Isto SUBSTITUI todas as camas: apaga as " + (M.camasAtuais?.length || 0) + " atuais e cria " + cr.camas.length + " novas."),
        el("p", { class: "mut" }, "Casas: " + Object.entries(porEd).map(([k, v]) => k + " (" + v + ")").join(" · ")),
        cr.zonas_novas?.length ? el("p", { class: "mut" }, "Cria a casa em falta: " + cr.zonas_novas.map(z => z.Nome).join(", ")) : null,
        el("p", { class: "mut" }, occ.length + " camas com ocupante (" + (occ.length - semMatch.size) + " casados por nome).") );
      if (semMatch.size) resumo.append(el("p", { class: "atz-warn" }, "Ocupantes sem correspondência (cama fica sem nome): " + [...semMatch].join(", ")));
      corpo.append(el("div", { class: "atz-sec" }, el("h3", {}, "Recarregar alojamento (camas)"), resumo));
    }

    corpo.append(
      el("div", { class: "atz-barra" }, btn,
        el("span", { class: "mut", style: "font-size:13px" }, M.aplicado ? "Já aplicado nesta sessão." : "Revê acima; só grava quando clicares.")),
      log);

    alvo.replaceChildren(cab, corpo);
  }
};

async function aplicar(core, alvo, btn, log, presOk) {
  const p = M.patch; if (!p) return;
  btn.disabled = true; log.style.display = ""; log.replaceChildren();
  const linha = (txt, ok = true) => log.append(el("div", { class: ok ? "ok" : "ko" }, (ok ? "✓ " : "✗ ") + txt));
  let nOk = 0, nErr = 0;
  badge("syncing");

  // 1) updates por PessoaID
  for (const u of p.updates) {
    const alvoP = dados.pessoas.find(x => x.Title === u.PessoaID);
    if (!alvoP) { linha("Update ignorado (não encontrei " + u.PessoaID + " — " + (u.Nome || "") + ")", false); nErr++; continue; }
    try {
      await graph.atualizarItem("Pessoas", alvoP._id, u.campos);
      Object.assign(alvoP, u.campos);
      linha("Atualizado: " + (u.Nome || u.PessoaID)); nOk++;
    } catch (e) { linha("Falha ao atualizar " + (u.Nome || u.PessoaID) + ": " + e.message, false); nErr++; }
  }

  // 2) creates
  let i = 0;
  for (const c of p.creates) {
    const id = proximoPessoaId(i);
    const campos = { Title: id, Nome: c.Nome, EmpresaAgencia: c.EmpresaAgencia || "", Vinculo: c.Vinculo || "", Estado: c.Estado || "Ativo" };
    if (c.FuncaoID) {
      if (funcaoEhLookup()) {
        const fObj = dados.funcoes.find(f => f.Title === c.FuncaoID);
        if (fObj) campos.FuncaoIDLookupId = Number(fObj._id);
      } else campos.FuncaoID = c.FuncaoID;
    }
    try {
      const r = await graph.criarItem("Pessoas", campos);
      dados.pessoas.push({ _id: r.id, ...campos, ...(c.FuncaoID && !funcaoEhLookup() ? { FuncaoID: c.FuncaoID } : {}) });
      linha("Criado: " + c.Nome + " (" + id + ")"); nOk++; i++;
    } catch (e) { linha("Falha ao criar " + c.Nome + ": " + e.message, false); nErr++; }
  }

  // 3) presenças (dedup contra as existentes: PessoaID+Data)
  if (presOk && presOk.length) {
    linha("A carregar presenças existentes para evitar duplicados…");
    let existentes = [];
    try { existentes = await graph.lerLista("Presenças"); }
    catch (e) { linha("Não consegui ler presenças existentes: " + e.message, false); }
    const chave = (pid, d) => pid + "|" + String(d).slice(0, 10);
    const idx = new Map();
    for (const x of existentes) idx.set(chave(x.PessoaID, x.Data), x);

    let pCriadas = 0, pAtualizadas = 0, pIguais = 0;
    for (const m of presOk) {
      const k = chave(m.pid, m.Data);
      const ex = idx.get(k);
      try {
        if (!ex) {
          await graph.criarItem("Presenças", { Title: "PR" + Date.now() + Math.floor(Math.random() * 999), PessoaID: m.pid, Data: m.Data, Estado: m.Estado });
          pCriadas++;
        } else if ((ex.Estado || "") !== m.Estado) {
          await graph.atualizarItem("Presenças", ex._id, { Estado: m.Estado });
          ex.Estado = m.Estado; pAtualizadas++;
        } else pIguais++;
      } catch (e) { linha("Falha numa marcação (" + m.Nome + " " + m.Data + "): " + e.message, false); nErr++; }
    }
    linha("Presenças: " + pCriadas + " criadas, " + pAtualizadas + " atualizadas, " + pIguais + " já iguais.");
    nOk += pCriadas + pAtualizadas;
  }

  // 4) recarga de camas (cria zona em falta, apaga todas, recria)
  const cr = p.camas_reload;
  if (cr) {
    // 4a) garantir zonas novas
    for (const zn of (cr.zonas_novas || [])) {
      const existe = dados.zonas.find(z => z.Nome === zn.Nome);
      if (!existe) {
        try {
          const ns = dados.zonas.map(z => parseInt(String(z.Title).replace(/^Z/, ""), 10)).filter(n => !isNaN(n));
          const zid = "Z" + String((ns.length ? Math.max(...ns) : 0) + 1).padStart(2, "0");
          const r = await graph.criarItem("Zonas", { Title: zid, Nome: zn.Nome, Modulo: zn.Modulo, Tipologia: zn.Tipologia, Ativa: true });
          dados.zonas.push({ _id: r.id, Title: zid, Nome: zn.Nome, Modulo: zn.Modulo, Tipologia: zn.Tipologia, Ativa: true });
          linha("Zona criada: " + zn.Nome + " (" + zid + ")"); nOk++;
        } catch (e) { linha("Falha ao criar zona " + zn.Nome + ": " + e.message, false); nErr++; }
      }
    }
    // detetar nomes internos reais das colunas da Lista Camas
    let cols = [];
    try { cols = await graph.colunasDaLista("Camas"); }
    catch (e) { linha("Não consegui ler as colunas da Lista Camas: " + e.message, false); nErr++; }
    const normc = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const porNome = {};
    cols.forEach(c => { porNome[normc(c.displayName)] = c; porNome[normc(c.name)] = c; });
    const col = logico => porNome[normc(logico)] || null;
    const colZona = col("ZonaID");
    const zonaLookup = colZona ? colZona.lookup : (M.camasAtuais || []).some(c => "ZonaIDLookupId" in c);
    const zonaPorNome = nome => dados.zonas.find(z => z.Nome === nome);

    // 4b) reconciliar: reutiliza as camas existentes (atualiza em vez de apagar+criar)
    const zonaPid = col("PessoaID");
    function payload(c, idTitle, excl) {
      const campos = { Title: idTitle };
      const set = (logico, valor) => {
        if (excl.has(logico)) return;
        const cc = col(logico); if (!cc || valor === "" || valor == null) return;
        campos[cc.name] = valor;
      };
      set("Quarto", c.Quarto);
      let num = c.Numero;
      if (typeof num === "string" && /^\d+$/.test(num.trim())) num = Number(num.trim());
      if (!excl.has("Numero")) { const cc = col("Numero"); if (cc && num !== "" && num != null) campos[cc.name] = num; }
      set("Estado", c.Estado || "Livre");
      if (!excl.has("DataChegada") && c.DataChegada) {
        const cc = col("DataChegada"); if (cc) campos[cc.name] = String(c.DataChegada).slice(0, 10) + "T00:00:00Z";
      }
      if (!excl.has("Zona") && colZona) {
        const zona = zonaPorNome(c.Edificio);
        if (zona) { if (zonaLookup) campos[colZona.name + "LookupId"] = Number(zona._id); else campos[colZona.name] = zona.Title; }
      }
      if (!excl.has("PessoaID") && c.Nome && zonaPid) {
        const pe = pessoaPorNome(c.Nome); if (pe) campos[zonaPid.name] = pe.Title;
      }
      return campos;
    }

    const ordemRemover = ["DataChegada", "Numero", "Zona", "PessoaID"];
    let excluir = new Set();
    let calibrado = false;

    async function escrever(payloadObj, existingId) {
      return existingId
        ? graph.atualizarItem("Camas", existingId, payloadObj)
        : graph.criarItem("Camas", payloadObj);
    }

    const novas = cr.camas.filter(c => zonaPorNome(c.Edificio));
    const semZona = cr.camas.length - novas.length;
    const existentes = M.camasAtuais || [];
    const total = Math.max(novas.length, existentes.length);
    linha("A gravar " + novas.length + " camas em lotes" + (semZona ? (" (" + semZona + " sem zona, ignoradas)") : "") + "…");

    // 1) calibrar numa cama (descobre campos recusados pelo SharePoint), sem lote
    let arranque = 0, criadas = 0, atualizadas = 0, apagadas = 0;
    if (novas.length) {
      let tentativa = new Set(), feito = false;
      for (let k = 0; k <= ordemRemover.length && !feito; k++) {
        try {
          const existingId = existentes.length ? existentes[0]._id : null;
          await escrever(payload(novas[0], "C001", tentativa), existingId);
          excluir = new Set(tentativa); calibrado = true; feito = true;
          if (existingId) atualizadas++; else criadas++;
          linha(excluir.size ? ("Aviso: ignorei o(s) campo(s) " + [...excluir].join(", ") + " (recusados).") : "Calibração ok — todos os campos aceites.", !excluir.size);
        } catch (e) {
          if (k < ordemRemover.length) tentativa.add(ordemRemover[k]);
          else { linha("Não consegui gravar nem a 1ª cama: " + e.message, false); nErr++; }
        }
      }
      arranque = 1;
    }

    // 2) construir as operações restantes e gravar em lotes
    const ops = [];
    for (let idx = arranque; idx < total; idx++) {
      const idTitle = "C" + String(idx + 1).padStart(3, "0");
      if (idx < novas.length) {
        const fields = payload(novas[idx], idTitle, excluir);
        if (idx < existentes.length) ops.push({ op: "update", id: existentes[idx]._id, fields });
        else ops.push({ op: "create", fields });
      } else {
        ops.push({ op: "delete", id: existentes[idx]._id });
      }
    }
    if (ops.length) {
      const res = await graph.escreverEmLote("Camas", ops, (feitos, tot) => {
        linha("Progresso: " + Math.min(feitos + arranque, total) + "/" + total + "…");
      });
      ops.forEach((o, k) => { /* contagem aproximada por tipo nos que correram bem é feita abaixo */ });
      // contar por resultado
      const okSet = new Set();
      res.erros.forEach(er => { er.op && okSet.add(er.op); });
      ops.forEach(o => {
        const falhou = res.erros.find(e => e.op === o);
        if (falhou) return;
        if (o.op === "create") criadas++;
        else if (o.op === "update") atualizadas++;
        else apagadas++;
      });
      if (res.erros.length) {
        nErr += res.erros.length;
        const amostra = res.erros.slice(0, 3).map(e => "(" + e.status + ") " + e.msg).join(" · ");
        linha(res.erros.length + " operações falharam. Ex.: " + amostra, false);
      }
    }
    linha("Camas concluídas: " + criadas + " criadas, " + atualizadas + " atualizadas, " + apagadas + " apagadas" + (semZona ? (" · " + semZona + " sem zona") : ""));
    nOk += criadas + atualizadas;
  }

  badge(nErr ? "error" : "connected");
  M.aplicado = true;
  log.append(el("div", { style: "margin-top:8px;font-weight:600" }, "Concluído: " + nOk + " aplicadas, " + nErr + " com erro."));
  toast(nErr ? ("Aplicado com " + nErr + " erros") : "Atualizações aplicadas", nErr ? "error" : "info");
}
