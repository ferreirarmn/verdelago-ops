// ============================================================================
// ui.js — Componentes visuais comuns: separadores, toast, modal, badge
// ----------------------------------------------------------------------------
// Sem dependências externas. Tudo DOM puro para correr no GitHub Pages.
// ============================================================================

/** Cria um elemento com atributos e filhos de forma compacta. */
export function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const f of filhos) {
    if (f == null) continue;
    n.append(f.nodeType ? f : document.createTextNode(f));
  }
  return n;
}

/** Mensagem temporária no canto. */
let toastTimer = null;
export function toast(msg, tipo = "info") {
  let t = document.getElementById("toast");
  if (!t) {
    t = el("div", { id: "toast" });
    document.body.append(t);
  }
  t.textContent = msg;
  t.className = "toast toast-" + tipo + " show";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}

/** Janela modal simples. Devolve uma função para a fechar. */
export function modal(titulo, conteudo) {
  const fundo = el("div", { class: "modal-fundo" });
  const fechar = () => fundo.remove();
  const caixa = el("div", { class: "modal-caixa" },
    el("div", { class: "modal-cab" },
      el("h3", {}, titulo),
      el("button", { class: "modal-x", onclick: fechar }, "✕")
    ),
    el("div", { class: "modal-corpo" }, conteudo)
  );
  fundo.append(caixa);
  fundo.addEventListener("click", e => { if (e.target === fundo) fechar(); });
  document.body.append(fundo);
  return fechar;
}

/** Atualiza o indicador de estado de sincronização. */
export function badge(estado, detalhe = "") {
  const el2 = document.getElementById("sync-badge");
  if (!el2) return;
  const mapa = {
    loading: "🟡 a ligar", connected: "🟢 ligado",
    syncing: "🔵 a sincronizar", error: "🔴 erro", offline: "⚪ offline"
  };
  el2.textContent = mapa[estado] || estado;
  el2.title = detalhe;
}
