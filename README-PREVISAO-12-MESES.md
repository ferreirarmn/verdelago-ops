# Previsão — 12 meses e alinhamento F&B com o simulador (jun 2026)

## O que muda
A aba Previsão (módulo Orçamento) deixa de estar limitada a Junho/Julho e passa
a cobrir os 12 meses, com o F&B alinhado ao teu simulador.

### Dados (do Simulador_Headcount_F_B_Outlets)
- escala_base.json → room_nights dos 12 meses (RN Budget). Junho e Julho
  mantêm os dados DIÁRIOS reais; os restantes meses usam a média diária
  (RN mensal ÷ dias do mês). Campo room_nights_fonte documenta a origem.
- escala_fb.json → covers por outlet nos 12 meses + dias_mes dos 12 meses.
- escala_fb.json → NOVO campo hc_mensal: o HC F&B já calculado pelo simulador
  (FOH/BOH/Ref por mês). É a fonte calibrada da previsão F&B.

### Motor (modules/orcamento.js)
- previsaoFB() passa a CONSUMIR o hc_mensal do simulador (FOH/BOH/Ref) quando
  existe — evita um terceiro conjunto de números e fica coerente com o Plano
  dos dashboards (81 Jun, 119 Ago). Mantém o cálculo por covers÷rácios como
  fallback se não houver hc_mensal.
- previsaoHSK() mantém-se: room nights × parâmetros × fator de folgas (não há
  simulador HSK; é a fonte para o HSK), agora nos 12 meses.

## Porquê consumir o simulador no F&B
O motor por covers÷rácios da app sobredimensionava muito (Ago dava ~230 vs 119
do simulador) e ignorava a equipa fixa de base nos meses de baixa. O teu
simulador é mais calibrado (FOH/BOH, equipa base, elasticidades). Usá-lo evita
repetir o problema dos "números diferentes entre apps".

## Ficheiros
- escala_base.json     (SUBSTITUIR)
- escala_fb.json       (SUBSTITUIR)
- modules/orcamento.js (SUBSTITUIR)

## QA
Motor testado nos 12 meses: F&B bate com o simulador em todos (✓), com
repartição FOH/BOH/Ref; HSK calcula o ano todo (pico Ago ~88). Sintaxe validada.

## Nota
Se atualizares o simulador, basta reexportar o hc_mensal (FOH/BOH/Ref por mês)
para o escala_fb.json — posso automatizar isso quando quiseres.
