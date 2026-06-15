# Verdelago Operações — Design System v2 (jun 2026)

## O que muda
1. **Barra lateral** (substitui os 11 separadores em pílula): navegação agrupada
   em Operação / Planeamento / Sistema, marca "lagoa" no topo, drawer no telemóvel.
2. **Topbar contextual**: nome do módulo ativo, chip da unidade ("Verdelago"),
   utilizador e estado de sincronização com ponto colorido (fim dos emojis 🟢🔴).
3. **CSS 100% centralizado**: os 8 módulos deixaram de injetar `<style>` próprio.
   Todas as classes (.kpi, .dtab, .orc-*, .atz-*, .esc-*, .par-*, .aloj-*, .pg-*)
   estão harmonizadas em estilo.css — 1 estilo de KPI, 1 estilo de tabela.
4. **Paleta afinada**: fundo mais fresco (#f2f4f0), teal de ação #11857a,
   latão como acento único, novo token --danger. Os nomes das variáveis CSS
   mantêm-se, por isso estilos inline antigos continuam a funcionar.
5. **Tipografia de dados**: tabular-nums em todos os números; rótulos uppercase
   uniformes (10.5px/.08em) em tabelas e KPIs.

## Ficheiros alterados
- index.html            (novo shell: sidebar + coluna de conteúdo)
- estilo.css            (reescrito — única fonte de estilos)
- app.js                (navegação agrupada, drawer, título contextual)
- core/ui.js            (badge sem emoji)
- modules/dashboard.js, orcamento.js, alojamento.js, atualizacoes.js,
  escalas.js, parametros.js        (garantirEstilos esvaziado; "⬇" removido)
- shared/modulo-departamento.js, shared/presencas.js  (idem)

## Depois de publicar
GitHub Pages + Ctrl+Shift+R. Se o service worker segurar o CSS antigo,
incrementar a versão de cache no sw.js.
