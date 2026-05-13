# Materials And Capacity Future Work

Created: 2026-05-06
Edited: 2026-05-13
Status: future idea

This file preserves useful future ideas extracted during Batch 2. It is not
current behavior and should not be used as release evidence.

## Materials

Possible later work:

- dynamic material property definitions with typed units;
- stock accounting and quantity-on-hand;
- supplier/order lifecycle fields such as order date, arrival date, analysis
  date, expiration date, quantity, and price;
- automatic inventory consumption from tape/battery/module workflows;
- storage location, opened date, expiry date, and certificate/passport workflow
  if the current file tables are not enough;
- explicit good-for-reorder / do-not-reorder labels if source quality history
  becomes useful to purchasing decisions;
- source/supplier analytics after enough real outcome data exists;
- quality indicator on the main material tree if it proves useful.

Before adding required inventory fields, ask the scientists who use the records
which properties they actually need to sort, filter, compare, or report.

## Composition

Possible later work:

- transitive recursive composition expansion for nested material instances;
- cycle detection for deep composition graphs;
- shared backend helper for direct and recursive component expansion;
- clearer UI visualization for nested compositions if actual lab usage needs
  more than one direct component level.

## Capacity

Possible later work:

- advanced electrode matching beyond the current N/P helper: combinatorial
  optimization for unusual capacity distributions, saved/default N/P presets by
  tape or project, and optional sorting modes after real lab usage proves the
  need;
- frozen historical capacity snapshots;
- min, max, spread, and standard deviation for electrode batch capacity;
- energy calculations in Wh after voltage model decisions;
- supplier-declared vs measured capacity comparison;
- cycling-based degradation and capacity retention links.
