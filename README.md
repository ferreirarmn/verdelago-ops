# Verdelago Operações — esqueleto (Fase 4 + núcleo da Fase 5/6)

Aplicação web modular, para correr no GitHub Pages, que autentica via Microsoft 365
e lê/escreve as Listas do SharePoint. Já arranca, faz login, mostra os três módulos
e permite criar zonas.

## Estrutura

```
verdelago-ops/
├── index.html          casca: porta de login + barra + navegação
├── app.js              arranque, registo de módulos, separadores
├── estilo.css          aspeto
├── manifest.json       PWA (faltam os ícones icon-192.png / icon-512.png)
├── core/
│   ├── config.js       ← PREENCHER: clientId, tenantId, site, listas
│   ├── auth.js         login Microsoft (MSAL)
│   ├── graph.js        ler/escrever Listas (genérico)
│   ├── store.js        dados em memória + atalhos (pessoaPorId, zonasDoModulo…)
│   └── ui.js           el(), toast(), modal(), badge()
├── shared/
│   ├── zonas.js        criar/gerir zonas  (usa a coluna "Tipologia")
│   └── escalas.js      escalas + deteção de conflitos
└── modules/
    ├── hsk.js          Housekeeping (stub a mostrar zonas)
    ├── fb.js           F&B (stub)
    └── nautico.js      Recreativo/Náutico (stub)
```

## Para pôr a correr

1. Abre `core/config.js` e preenche `clientId` e `tenantId` (Fase 2) e confirma
   `siteHostname` / `sitePath` (Fase 1) e os nomes das `listas` (Fase 3).
2. No Entra ID, acrescenta o URL do GitHub Pages aos *redirect URIs* da app
   (ex.: `https://<utilizador>.github.io/verdelago-ops/`).
3. Publica a pasta no GitHub Pages (ou abre via um servidor local — os módulos ES
   não correm com `file://`, precisam de http).
4. Abre a app, clica em **Entrar**, e confirma a lista de verificação da Fase 10.

## Notas importantes

- A coluna de tipo de zona chama-se **Tipologia** (não "Tipo"), porque "Tipo" é
  uma coluna de sistema do SharePoint. Está assim em todo o código.
- Os módulos são *stubs* funcionais: arrancam e mostram as suas zonas. As vistas
  próprias (mapa de camas no HSK, grelha de escalas, painéis de cobertura) entram
  na Fase 8 — o terreno já está preparado em `shared/escalas.js` e no contrato
  dos módulos.
- O ecrã **Zonas** já cria zonas reais na Lista do SharePoint.
