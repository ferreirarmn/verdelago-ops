# Verdelago Operações — Dashboards PPT (jun 2026)

## O que muda
O `core/ppt.js` passa de UMA exportação genérica para TRÊS decks com
identidade visual Verdelago, replicando (e melhorando) os dois ficheiros
anexos produzidos noutra app:

- **exportarPPTGeral()** — Painel Geral da unidade (4 slides):
  capa escura com KPIs · visão geral (KPIs + 2 donuts) ·
  comparativo de departamentos (tabela + barras de custo) · resumo escuro.
- **exportarPPTFB()** — Food & Beverage (4 slides):
  capa · composição (KPIs + donut empresa + donut vínculo) ·
  distribuição por função (barras + 2 notas) · estrutura por empresa/vínculo.
- **exportarPPTHSK()** — Housekeeping (4 slides):
  capa · sumário executivo (4 leituras em cartões) ·
  distribuição por função (barras + notas) ·
  dependência de fornecedores (donut + caixa "Risco de concentração").

## Melhorias face aos anexos
- Look & feel Verdelago: paleta da app v2 (teal-lagoa, latão, mint), capa
  escura com monograma, tipografia Cambria/Calibri (seguras no PowerPoint).
- Gráficos **nativos do PptxGenJS** (donut + barras) — editáveis no PowerPoint,
  não imagens. Servidos do `lib/pptxgen.bundle.js` local (sem CDN).
- Dados **ao vivo** do núcleo (Pessoas/Funções) + Presenças/Camas (Graph) +
  budget_base.json. Quando falta um dado, o cartão mostra "—" em vez de quebrar.
- A caixa "Risco de concentração" (HSK) só aparece se um fornecedor ≥40% do TT.

## Onde aparece na app
Módulo **Gestão**, barra de ferramentas: três botões — "PPT Geral", "PPT F&B",
"PPT HSK" (+ "Exportar Excel", inalterado). `exportarPPT` antigo continua a
existir como alias do Geral (retrocompatível).

## Ficheiros alterados
- core/ppt.js            (reescrito — 3 exportações partilhando a mesma fábrica)
- modules/dashboard.js   (import + 3 botões)

## QA feito
3 decks gerados em Node com dados sintéticos (68 HSK, 91 F&B, etc.),
convertidos para imagem e inspecionados. Corrigida a largura da tabela
comparativa do Geral. Não foi possível testar aqui o login MSAL nem dados
SharePoint reais — revê com dados reais antes de divulgar.
