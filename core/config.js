// ============================================================================
// config.js — Configuração central da aplicação Verdelago Operações
// ----------------------------------------------------------------------------
// É o ÚNICO ficheiro que muda de instalação para instalação.
// Preenche os valores marcados com <...> a partir da Fase 2 (Entra ID).
// ============================================================================

export const CONFIG = {
  // --- Entra ID / login (Fase 2) ---
  clientId: "30c0f872-f99b-40e8-9aef-0eed499dd8eb",
  tenantId: "3fbca4e7-1ecd-4c14-a323-4cbdfef6aea3",

  // Onde a app corre. No GitHub Pages será algo como:
  //   https://ferreirarmn.github.io/verdelago-ops/
  // Tem de ser EXATAMENTE igual ao redirectUri registado no Entra ID.
  redirectUri: window.location.origin + window.location.pathname,

  // --- SharePoint (Fase 1) ---
  siteHostname: "blueandgreencorp.sharepoint.com",
  sitePath: "/sites/VerdelagoOps",

  // Permissões pedidas ao login
  scopes: ["User.Read", "Sites.ReadWrite.All"],

  // --- Nomes das Listas (Fase 3), exatamente como aparecem no SharePoint ---
  listas: {
    pessoas:   "Pessoas",
    funcoes:   "Funções",
    zonas:     "Zonas",
    camas:     "Camas",
    turnos:    "Turnos",
    escalas:   "Escalas",
    presencas: "Presenças"
  }
};

// Nota: a coluna de tipo de zona chama-se "Tipologia" (não "Tipo"),
// porque "Tipo" é uma coluna de sistema do SharePoint. Ver shared/zonas.js.
