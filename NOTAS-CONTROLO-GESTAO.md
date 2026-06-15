# Fase 1 (parcial) — Renomear Orçamento → Controlo de Gestão (jun 2026)

## Feito agora
- modules/orcamento.js  →  RENOMEADO para  modules/controlo-gestao.js
  (id "orcamento" → "controlo"; nome → "Controlo de Gestão"; export
  moduloOrcamento → moduloControloGestao). A função mantém-se idêntica:
  controlo de custos e headcount mês a mês a partir do budget_base.json.
- app.js: import e navegação atualizados (Planeamento → Parâmetros + Controlo de Gestão).
- core/icones.js: novo ícone "controlo" (mostrador). O ícone "orcamento"
  (nota/valor) fica reservado para o futuro módulo Orçamento.

## ATENÇÃO ao publicar
Como o ficheiro foi RENOMEADO (git mv), ao aplicares no teu repo tens de:
1. Apagar o antigo  modules/orcamento.js
2. Adicionar o novo  modules/controlo-gestao.js
3. Substituir  app.js  e  core/icones.js
(Se copiares o zip por cima sem apagar o orcamento.js antigo, ele fica órfão
mas inofensivo — já ninguém o importa. Mais limpo é apagá-lo.)

## A seguir (ainda por fazer)
- Fase 1 (resto): campo de CUSTO REAL editável → coluna nova na Lista Pessoas
  (aparece sozinha no editor dinâmico) + mostrar orçamentado vs real no
  Controlo de Gestão.
- Fase 2: módulo Orçamento → aba "Plano vs Real" (comparação). PRECISA do
  ficheiro de previsões de orçamento para definir o formato.
- Fase 3: módulo Orçamento → aba "Previsão" (motor room nights → pessoas/custo).
