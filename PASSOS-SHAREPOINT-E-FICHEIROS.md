# Correspondências — passos finais

## 1) Lista SharePoint "Correspondencias" (já criaste)
Colunas a ter (o "Tipo" é reservado pelo SharePoint, por isso usamos TipoCorr):
- **Título** (Title) — já existe. Nome no ORÇAMENTO (plano).
- **TipoCorr** — Escolha, opções: Função, Departamento.
  (renomeia a coluna que estavas a criar de "Tipo" para "TipoCorr")
- **NomeReal** — Texto (linha única). Nome canónico no REAL.

## 2) Ficheiros (substituir no GitHub)
- core/correspondencias.js  (usa TipoCorr)
- modules/mapeamento.js      (usa TipoCorr)
- core/graph.js              (resolução de listas tolerante a acentos)

## 3) Depois
Ctrl+Shift+R → Planeamento → Correspondências → Mapear/Guardar. Deve gravar.

## Nota
"Tipo" é coluna de sistema do SharePoint (como o "Tipo" nas Zonas, onde usámos
"Tipologia"). Por isso a coluna chama-se TipoCorr e a app já grava/lê de lá.
