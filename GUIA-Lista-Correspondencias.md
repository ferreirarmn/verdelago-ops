# Criar a Lista SharePoint "Correspondencias"

No site do Verdelago Ops, cria uma Lista nova chamada **Correspondencias** com:

| Coluna   | Tipo                 | Notas |
|----------|----------------------|-------|
| Title    | (já existe)          | Nome tal como aparece no ORÇAMENTO (plano). Ex.: "Cozinheiro de 2ª", "RESTAURANTE" |
| Tipo     | Escolha (Choice)     | Opções: **Função**, **Departamento** |
| NomeReal | Texto (linha única)  | Nome canónico no REAL. Ex.: "Cozinheiro 2ª", "F&B" |

Não é preciso mais nada. A app escreve/edita item a item (escritas individuais,
que passam na rede — não é bulk).
