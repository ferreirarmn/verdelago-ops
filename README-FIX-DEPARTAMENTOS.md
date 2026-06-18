# Correspondências — departamentos com F&B-FOH/BOH (jun 2026)

## Problema
Nas correspondências de Departamentos, o "nome real" só oferecia o módulo
genérico (F&B, HSK), mas tu precisas de mapear ao departamento detalhado do
real — F&B-FOH, F&B-BOH — que está no campo Departamento da Lista Funções.
Ex.: plano "Restaurante" deve mapear para real "F&B-FOH".

## Correção (modules/mapeamento.js)
O nome real de Departamento passa a oferecer a UNIÃO de:
- campo Departamento das funções (F&B-FOH, F&B-BOH, Housekeeping…)
- campo Modulo das funções (F&B, HSK…)
Assim podes mapear ao nível que quiseres (Restaurante→F&B-FOH, Cozinha→F&B-BOH,
ou tudo→F&B). O campo "nome real (livre)" continua disponível para exceções.

## Ficheiro
- modules/mapeamento.js  (SUBSTITUIR)

## Depois
Ctrl+Shift+R → Correspondências → Departamentos. No "Mapear", o dropdown já
mostra F&B-FOH / F&B-BOH. Mapeia:
  RESTAURANTE → F&B-FOH ; BAR → F&B-FOH ; COZINHA → F&B-BOH ;
  COPA → F&B-BOH ; PASTELARIA → F&B-BOH  (ajusta ao que faz sentido)

## QA
Testado: dropdown de departamentos reais = F&B | F&B-BOH | F&B-FOH | HSK |
Housekeeping. Sintaxe validada.
