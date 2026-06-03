// ============================================================================
// auth.js — Autenticação Microsoft 365 (MSAL), mesmo padrão das apps atuais
// ----------------------------------------------------------------------------
// Requer que o MSAL esteja carregado no index.html (window.msal).
// ============================================================================

import { CONFIG } from "./config.js";

let msalApp = null;

/** Inicia o MSAL e processa o regresso de um redireccionamento (uma vez). */
async function garantirMsal() {
  if (msalApp) return;
  if (!window.msal) {
    throw new Error("Biblioteca MSAL não carregada. Confirma o <script> no index.html.");
  }
  msalApp = new window.msal.PublicClientApplication({
    auth: {
      clientId: CONFIG.clientId,
      authority: "https://login.microsoftonline.com/" + CONFIG.tenantId,
      redirectUri: CONFIG.redirectUri
    },
    cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false }
  });
  await msalApp.initialize();
  await msalApp.handleRedirectPromise();   // resolve o retorno do login, se houver
}

/**
 * Verifica em silêncio se já há sessão (sem redirecionar).
 * Chamar no arranque: se devolver null, mostra-se a porta de entrada.
 * @returns {Promise<{nome:string, email:string}|null>}
 */
export async function sessaoAtual() {
  await garantirMsal();
  const conta = msalApp.getAllAccounts()[0];
  if (!conta) return null;
  msalApp.setActiveAccount(conta);
  return { nome: conta.name, email: conta.username };
}

/**
 * Faz o login interativo (redireciona para a Microsoft). Chamar ao clicar "Entrar".
 * A página recarrega ao voltar; aí sessaoAtual() já devolve a conta.
 */
export async function entrar() {
  await garantirMsal();
  await msalApp.loginRedirect({ scopes: CONFIG.scopes });
  return null; // o fluxo continua após o redireccionamento
}

/**
 * Obtém um token de acesso válido para o Microsoft Graph.
 * Renova em silêncio; se precisar de interação, reencaminha para o login.
 */
export async function obterToken() {
  const conta = msalApp.getActiveAccount();
  if (!conta) throw new Error("Sem sessão ativa.");
  try {
    const r = await msalApp.acquireTokenSilent({ scopes: CONFIG.scopes, account: conta });
    return r.accessToken;
  } catch (e) {
    if (e instanceof window.msal.InteractionRequiredAuthError) {
      await msalApp.acquireTokenRedirect({ scopes: CONFIG.scopes, account: conta });
      throw new Error("A reautenticar…");
    }
    throw e;
  }
}

/** Termina a sessão. */
export async function sair() {
  if (msalApp) await msalApp.logoutRedirect();
}
