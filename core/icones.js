// ============================================================================
// icones.js — Ícones SVG de linha (estilizados, consistentes) para a navegação
// Traço fino, currentColor (herdam a cor do separador), 24px viewBox.
// ============================================================================
import { el } from "./ui.js";

const P = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

const SVG = {
  // Gestão — gráfico de barras
  gestao: `<svg viewBox="0 0 24 24" ${P}><path d="M4 20h16M7 20v-6M12 20V8M17 20v-9"/></svg>`,
  // Housekeeping — brilho/limpeza
  hsk: `<svg viewBox="0 0 24 24" ${P}><path d="M11 3l1.5 4L17 8.5 12.5 10 11 14.5 9.5 10 5 8.5 9.5 7 11 3z"/><path d="M18 14l.8 2.2 2.2.8-2.2.8L18 20l-.8-2.2-2.2-.8 2.2-.8L18 14z"/></svg>`,
  // F&B — garfo e faca
  fb: `<svg viewBox="0 0 24 24" ${P}><path d="M6 3v6a2 2 0 002 2M8 3v18M8 11v0M6 3v4M10 3v4"/><path d="M16 3c-1.4 1.4-2 3.6-2 6h3"/><path d="M17 3v18"/></svg>`,
  // Recreativo — sol
  nautico: `<svg viewBox="0 0 24 24" ${P}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19"/></svg>`,
  // Serviços Centrais — edifício
  servicos: `<svg viewBox="0 0 24 24" ${P}><path d="M4 21V4a1 1 0 011-1h8a1 1 0 011 1v17M14 21V9h5a1 1 0 011 1v11M3 21h18M7 7h3M7 11h3M7 15h3"/></svg>`,
  // Alojamento — cama
  alojamento: `<svg viewBox="0 0 24 24" ${P}><path d="M3 18V7M3 13h15a3 3 0 013 3v2M3 18h18M21 18v-2M7 10h3"/></svg>`,
  // Escalas — calendário
  escalas: `<svg viewBox="0 0 24 24" ${P}><rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3.5 9.5h17"/></svg>`,
  // Atualizações — sincronizar
  atualizacoes: `<svg viewBox="0 0 24 24" ${P}><path d="M20 11a8 8 0 00-13.7-4.5L4 8M4 4v4h4M4 13a8 8 0 0013.7 4.5L20 16M20 20v-4h-4"/></svg>`,
  // Zonas — pin de mapa
  zonas: `<svg viewBox="0 0 24 24" ${P}><path d="M12 21s-6-5.2-6-10a6 6 0 1112 0c0 4.8-6 10-6 10z"/><circle cx="12" cy="11" r="2"/></svg>`,
  // Orçamento — nota/valor
  orcamento: `<svg viewBox="0 0 24 24" ${P}><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5h.01M18 14.5h.01"/></svg>`,
  // Controlo de Gestão — mostrador/medidor
  controlo: `<svg viewBox="0 0 24 24" ${P}><path d="M4 13a8 8 0 0116 0"/><path d="M12 13l4-3"/><path d="M4 13h2M18 13h2M12 5v0"/></svg>`,
  // Parâmetros — sliders de afinação
  parametros: `<svg viewBox="0 0 24 24" ${P}><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/></svg>`,
};

/** Devolve um <span class="ic"> com o ícone SVG do id (ou vazio se não existir). */
export function icone(id) {
  return el("span", { class: "ic", html: SVG[id] || "" });
}
