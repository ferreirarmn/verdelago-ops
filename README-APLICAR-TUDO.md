# F&B — revisão de headcount: dashboard + previsão alinhados (jun 2026)

Aplica os 3 ficheiros de uma vez. Depois disto, o dashboard E a previsão usam
os mesmos números (revisão), e o dashboard mostra original vs revisto.

## Números (necessidade F&B)
| Mês    | Original | Revisto |
|--------|---------:|--------:|
| Junho  |       81 |      98 |
| Julho  |      109 |   125,5 |
| Agosto |      119 | 135,5 (≈136) |  ← pico
Restantes meses = orçamento base (sem revisão).

## O que cada ficheiro faz
- **revisao_fb.json** (raiz) — NOVO/ATUALIZADO. Duas versões (original e revisto),
  necessidade por função e por mês. Alimenta o dashboard F&B.
- **core/ppt.js** — dashboard F&B mostra as duas versões:
  · Visão geral: Plano e Pico com "revisto · original N".
  · Sazonalidade: barras = revisto, contorno tracejado = original.
  · Plano vs efetivo por função (pico Ago): Função · Orig. · Revisto · Efetivo · Vagas.
  · Carências: vagas por função face ao revisto.
- **escala_fb.json** (raiz) — hc_mensal de Jun/Jul/Ago atualizado para a revisão
  (98 / 125,5 / 135,5). É o que a PREVISÃO (módulo Orçamento) consome, por isso
  previsão e dashboard passam a dar o mesmo. Restantes meses inalterados.

## Resultado
- Dashboard F&B: original vs revisto vs efetivo, vagas face ao revisto.
- Previsão (Orçamento → Previsão): F&B = 98 (Jun) / 126 (Jul) / 136 (Ago),
  alinhada com o dashboard. HSK sem alteração.

## Aplicar
1. revisao_fb.json  → raiz da app (junto ao escala_fb.json)
2. escala_fb.json   → raiz da app (substitui)
3. core/ppt.js      → substitui
Commit + push + Ctrl+Shift+R.

## QA
Previsão testada: Jun 98, Jul 126, Ago 136 (alinha com dashboard). Dashboard
render conferido (KPIs, sazonalidade com original, tabela por função). Sintaxe ok.
