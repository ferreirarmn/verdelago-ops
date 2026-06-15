// ============================================================================
// app.js — Arranque da aplicação: login, núcleo, registo de módulos, navegação
// ============================================================================

import { entrar, sessaoAtual } from "./core/auth.js";
import * as graph from "./core/graph.js";
import { carregarNucleo, dados } from "./core/store.js";
import { el, toast, badge } from "./core/ui.js";
import { icone } from "./core/icones.js";

import { moduloDashboard } from "./modules/dashboard.js";
import { moduloHSK } from "./modules/hsk.js";
import { moduloFB } from "./modules/fb.js";
import { moduloNautico } from "./modules/nautico.js";
import { moduloServicos } from "./modules/servicos.js";
import { moduloAlojamento } from "./modules/alojamento.js";
import { moduloEscalas } from "./modules/escalas.js";
import { moduloControloGestao } from "./modules/controlo-gestao.js";
import { moduloParametros } from "./modules/parametros.js";
import { moduloAtualizacoes } from "./modules/atualizacoes.js";

// "core" é o objeto que passamos aos módulos — dá-lhes acesso ao essencial
const core = { graph, dados, el, toast, badge };

// Separador especial (não-módulo) para gerir zonas
import { criarZona, arvoreDeZonas } from "./shared/zonas.js";

const MODULOS = [moduloDashboard, moduloHSK, moduloFB, moduloNautico, moduloServicos, moduloAlojamento, moduloEscalas, moduloParametros, moduloControloGestao, moduloAtualizacoes];

let ativo = null;

// ---------------------------------------------------------------------------
// Arranque ao carregar a página: processa regresso do login e, se já houver
// sessão, entra direto; caso contrário mostra a porta de entrada.
async function aoCarregar() {
  badge("loading");
  const status = document.getElementById("login-status");
  try {
    const conta = await sessaoAtual();
    if (conta) return iniciarApp(conta);   // já tem sessão (ou voltou do login)
    badge("offline");                        // sem sessão: espera o clique em "Entrar"
  } catch (e) {
    badge("error", e.message);
    status.innerHTML = '<b>Erro:</b> ' + e.message;
  }
}

// Clique em "Entrar": dispara o login interativo (redireciona para a Microsoft)
async function aoClicarEntrar() {
  document.getElementById("login-status").textContent = "A redirecionar para o login Microsoft…";
  try { await entrar(); }
  catch (e) { document.getElementById("login-status").innerHTML = '<b>Erro:</b> ' + e.message; }
}

// Carrega site, núcleo e monta a interface (com sessão já garantida)
async function iniciarApp(conta) {
  const gate = document.getElementById("login-gate");
  const status = document.getElementById("login-status");
  try {
    status.textContent = "A carregar dados…";
    await graph.arrancar();             // resolve site + listas
    await carregarNucleo();             // Pessoas, Funções, Zonas, Turnos
    gate.style.display = "none";
    document.getElementById("app").style.display = "";
    montarNavegacao(conta);
    badge("connected", conta.nome);
    abrir(MODULOS[0].id);
  } catch (e) {
    badge("error", e.message);
    status.innerHTML = '<b>Erro:</b> ' + e.message +
      '<br><br><button id="retry">Tentar novamente</button>';
    document.getElementById("retry")?.addEventListener("click", () => location.reload());
  }
}

// ---------------------------------------------------------------------------
// Navegação agrupada na barra lateral
const GRUPOS_NAV = [
  { titulo: null,           ids: ["gestao"] },
  { titulo: "Operação",     ids: ["hsk", "fb", "nautico", "servicos", "alojamento", "escalas"] },
  { titulo: "Planeamento",  ids: ["parametros", "controlo"] },
  { titulo: "Sistema",      ids: ["atualizacoes", "zonas"] }
];

function fecharMenu() { document.body.classList.remove("nav-aberta"); }

function montarNavegacao(conta) {
  const nav = document.getElementById("nav");
  nav.replaceChildren();

  const botao = (id, nome, onclick) =>
    el("button", { class: "tab", "data-id": id, onclick: () => { fecharMenu(); onclick(); } },
      icone(id), el("span", {}, nome));

  GRUPOS_NAV.forEach(g => {
    if (g.titulo) nav.append(el("div", { class: "nav-grupo" }, g.titulo));
    g.ids.forEach(id => {
      if (id === "zonas") return nav.append(botao("zonas", "Zonas", abrirZonas));
      const m = MODULOS.find(x => x.id === id);
      if (m) nav.append(botao(m.id, m.nome, () => abrir(m.id)));
    });
  });

  document.getElementById("utilizador").textContent = conta.nome;

  // drawer no telemóvel
  document.getElementById("btn-menu")?.addEventListener("click", () =>
    document.body.classList.toggle("nav-aberta"));
  document.getElementById("backdrop")?.addEventListener("click", fecharMenu);
}

function marcarAtivo(id, titulo) {
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("ativo", t.dataset.id === id));
  const ctx = document.getElementById("contexto");
  if (ctx) ctx.textContent = titulo || "";
  ativo = id;
}

// ---------------------------------------------------------------------------
async function abrir(idModulo) {
  const m = MODULOS.find(x => x.id === idModulo);
  marcarAtivo(idModulo, m?.nome);
  const alvo = document.getElementById("conteudo");
  alvo.replaceChildren(el("p", { class: "carregar" }, "A carregar…"));
  if (m.init) await m.init(core);
  m.render(core, alvo);
}

// Ecrã transversal de gestão de zonas (criar outlets / agrupamentos)
function abrirZonas() {
  marcarAtivo("zonas", "Zonas");
  const alvo = document.getElementById("conteudo");

  const inputNome = el("input", { class: "campo", placeholder: "Nome da zona" });
  const selMod = el("select", { class: "campo" },
    el("option", { value: "HSK" }, "HSK"),
    el("option", { value: "F&B" }, "F&B"),
    el("option", { value: "Náutico" }, "Náutico"));
  const selTip = el("select", { class: "campo" },
    el("option", { value: "Outlet" }, "Outlet"),
    el("option", { value: "Alojamento" }, "Alojamento"),
    el("option", { value: "Recreativo" }, "Recreativo"));

  const botao = el("button", { class: "btn", onclick: async () => {
    const nome = inputNome.value.trim();
    if (!nome) return toast("Dá um nome à zona.", "error");
    try {
      botao.disabled = true;
      await criarZona({ nome, modulo: selMod.value, tipologia: selTip.value });
      toast("Zona criada: " + nome, "info");
      abrirZonas(); // recarrega o ecrã com a nova zona
    } catch (e) {
      toast("Falhou: " + e.message, "error");
    } finally { botao.disabled = false; }
  }}, "+ Criar zona");

  const listas = ["HSK", "F&B", "Náutico"].map(mod => {
    const arv = arvoreDeZonas(mod);
    return el("div", { class: "bloco-zonas" },
      el("h4", {}, mod),
      arv.length
        ? el("ul", { class: "lista-zonas" },
            ...arv.map(z => el("li", {},
              el("strong", {}, z.Nome),
              el("span", { class: "tag" }, z.Tipologia || "—"),
              z.filhas.length ? el("span", { class: "mut" }, " · " + z.filhas.length + " sub-zona(s)") : null)))
        : el("p", { class: "vazio" }, "Sem zonas."));
  });

  alvo.replaceChildren(
    el("div", { class: "mod-cab" },
      el("h2", {}, "Zonas de trabalho"),
      el("p", { class: "mut" }, "Outlets (F&B), agrupamentos de alojamento (HSK) e zonas recreativas (Náutico).")),
    el("div", { class: "form-linha" }, inputNome, selMod, selTip, botao),
    el("div", { class: "grelha-zonas" }, ...listas)
  );
}

// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-entrar")?.addEventListener("click", aoClicarEntrar);
  aoCarregar();   // processa regresso do login / sessão existente
});
