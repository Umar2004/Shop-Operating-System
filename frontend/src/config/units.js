// Product units: the one list every screen uses, in the groups the Unit dropdown shows.
// These exact strings are what a product STORES (products.unit is free text), so never rename or re-case one:
// products saved with it would no longer match. Add new units; don't change existing ones.
// The original five are Kg, L, pcs, cm² and inch. The ² is U+00B2 (written as ² so it can't be mistyped).
export const UNIT_GROUPS = [
  { label: 'Count', units: ['pcs', 'dozen', 'pack', 'box', 'set', 'pair'] },
  { label: 'Weight', units: ['mg', 'g', 'Kg'] },
  { label: 'Volume', units: ['ml', 'L'] },
  { label: 'Length', units: ['mm', 'cm', 'm', 'inch', 'ft'] },
  { label: 'Area', units: ['cm²', 'm²', 'sq ft'] },
];

export const UNITS = UNIT_GROUPS.flatMap((g) => g.units);

export const DEFAULT_UNIT = 'pcs';
