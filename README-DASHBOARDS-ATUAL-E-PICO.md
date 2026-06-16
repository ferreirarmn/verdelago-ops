# Dashboards PPT — mês atual + mês de maior necessidade (jun 2026)

Os decks F&B e HSK passam a analisar DOIS meses: o **atual** e o **mês de
maior necessidade (pico)**, determinado automaticamente a partir do plano
(com os dados reais dá Agosto).

## Novidades
- **Mês de pico automático**: o mês com maior HC no plano do departamento. O
  nome aparece dinamicamente (Ago) em todo o deck.
- **Slide novo "Sazonalidade — Necessidade ao longo do ano"**: barras de
  headcount do plano por mês (Jan–Dez), com o mês atual (verde) e o pico
  (latão) destacados, e a linha tracejada do efetivo atual como referência.
  Mostra de relance o salto até ao pico.
- **Capa e visão geral (F&B)**: Plano (mês atual), Pico (mês), e vagas de cada.
- **Plano vs efetivo por função (F&B)**: colunas Plano [mês atual] · Plano
  [pico] · Efetivo · Vagas [pico].
- **Carências (F&B)**: focadas no pico (mês mais exigente), com nota a comparar
  hoje vs pico.
- **Sumário executivo (HSK)**: o 4.º cartão passa a mostrar o pico e as vagas
  no pico.
- **Resumo (F&B)**: Em escala · Vagas hoje · Vagas no pico.

F&B: 10 slides · HSK: 8 slides.

## Ficheiro
- core/ppt.js  (SUBSTITUIR)

## QA
Gerados com plano sazonal sintético (pico em Agosto) e inspecionados: o pico é
detetado, o slide de sazonalidade destaca atual e pico, as tabelas e carências
usam ambos os meses. Sintaxe validada. Com dados reais, o pico será o mês de
maior HC no orçamento (Agosto).

## Exemplos
exemplo_FB_atual_e_pico.pptx e exemplo_HSK_atual_e_pico.pptx.
