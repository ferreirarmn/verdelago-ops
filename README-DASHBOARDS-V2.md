# Dashboards PPT — análise de gestão completa (jun 2026)

Reescrita dos decks F&B e HSK para espelharem os ficheiros de referência:
deixam de ser descritivos da equipa atual e passam a CRUZAR o Plano (Lista
Orçamento) com o efetivo real — vagas, carências, pipeline, entradas.

## Deck F&B — 9 slides (como o anexo)
1. Capa — Plano (mês) · Pessoas · Em escala · Vagas
2. Visão geral — 6 KPIs (Plano, Pessoas c/ repartição por vínculo, Em escala,
   A chegar, Alojados, Assiduidade)
3. Entradas por semana — barras das próximas 8 semanas
4. Próximas entradas — lista nominal por semana
5. Pipeline — Em escala / A chegar / Vagas por preencher
6. Distribuição — donuts por empresa e por vínculo + nota
7. Plano vs efetivo por função — tabela Plano · Efetivo · Vagas
8. Funções com maior carência — barras de gap (plano − efetivo) + notas
9. Resumo escuro "Onde estamos hoje"

## Deck HSK — 7 slides (como o anexo)
1. Capa · 2. Sumário executivo (4 cartões, inc. Plano do mês) ·
3. Composição interno vs externo (donut + barras + nota) ·
4. Distribuição por função (barras + cartões de leitura) ·
5. Dependência de fornecedores (donut + risco) ·
6. Estrutura operacional (cartões Interna/Externa com funções) ·
7. Próximas entradas.

## Integração com o Plano
Lê a Lista "Orçamento" (resolve nomes internos das colunas em runtime, à prova
do _x005f_). Vagas = plano(mês) − pessoas; carências por função = plano − efetivo.
Se a Lista Orçamento não existir, os decks funcionam à mesma (Plano/Vagas = "—").

## "Pessoas a chegar"
Estado "Por chegar" ou data de entrada futura (coluna detetada automaticamente).

## Ficheiro
- core/ppt.js  (SUBSTITUIR)

## QA
Ambos os decks gerados com Plano + equipa sintéticos e inspecionados slide a
slide. Sintaxe validada. Com dados reais, confirmar que os nomes a mostrar das
colunas da Lista Orçamento são HC_Jan…Custo_Dez e que os nomes de departamento
do plano (RESTAURANTE, COZINHA, BAR, COPA, PASTELARIA / HOUSEKEEPING) batem.

## Exemplos juntos
exemplo_FB_completo.pptx e exemplo_HSK_completo.pptx (dados sintéticos).
