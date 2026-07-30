// Unit tests for src/utils/recipeDuplicate.js
//
// Client-side duplicate guard for recipe save: the backend/DB do not
// enforce uniqueness of name+variant_label, so RecipesPage blocks the
// save when another loaded recipe (different id) carries the same
// pair. Matching is fingerprint-based (nameFingerprint), so trim,
// case, spacing/punctuation and Cyrillic/Latin homoglyph variants all
// collide; blank and null variant labels compare equal.

import { describe, it, expect } from 'vitest';
import { findDuplicateRecipe } from '@/utils/recipeDuplicate';

const recipes = [
  { tape_recipe_id: 1, name: 'Катод базовый', variant_label: 'A' },
  { tape_recipe_id: 2, name: 'Катод базовый', variant_label: 'B' },
  { tape_recipe_id: 3, name: 'Анод LTO', variant_label: null },
  { tape_recipe_id: 4, name: 'Анод HC', variant_label: '' },
];

describe('findDuplicateRecipe — collision detection', () => {
  it('finds another recipe with the same name and variant', () => {
    const dup = findDuplicateRecipe(recipes, {
      name: 'Катод базовый', variantLabel: 'A', currentId: null,
    });
    expect(dup?.tape_recipe_id).toBe(1);
  });

  it('is trim- and case-insensitive on both fields', () => {
    const dup = findDuplicateRecipe(recipes, {
      name: '  катод БАЗОВЫЙ ', variantLabel: ' a ', currentId: null,
    });
    expect(dup?.tape_recipe_id).toBe(1);
  });

  it('catches Cyrillic/Latin homoglyph variants (via nameFingerprint)', () => {
    // «А» (Cyrillic) vs "A" (Latin) are pixel-identical variant labels.
    const dup = findDuplicateRecipe(recipes, {
      name: 'Катод базовый', variantLabel: 'А', currentId: null,
    });
    expect(dup?.tape_recipe_id).toBe(1);
  });

  it('treats null and blank variant labels as equal', () => {
    expect(findDuplicateRecipe(recipes, {
      name: 'Анод LTO', variantLabel: '', currentId: null,
    })?.tape_recipe_id).toBe(3);
    expect(findDuplicateRecipe(recipes, {
      name: 'Анод HC', variantLabel: null, currentId: null,
    })?.tape_recipe_id).toBe(4);
  });
});

describe('findDuplicateRecipe — non-collisions', () => {
  it('same name but different variant is not a duplicate', () => {
    expect(findDuplicateRecipe(recipes, {
      name: 'Катод базовый', variantLabel: 'C', currentId: null,
    })).toBeNull();
  });

  it('excludes the record being edited (same currentId)', () => {
    expect(findDuplicateRecipe(recipes, {
      name: 'Катод базовый', variantLabel: 'A', currentId: 1,
    })).toBeNull();
    // …but still flags a DIFFERENT record with the colliding pair.
    expect(findDuplicateRecipe(recipes, {
      name: 'Катод базовый', variantLabel: 'B', currentId: 1,
    })?.tape_recipe_id).toBe(2);
  });

  it('returns null for blank name or empty/missing list', () => {
    expect(findDuplicateRecipe(recipes, {
      name: '   ', variantLabel: 'A', currentId: null,
    })).toBeNull();
    expect(findDuplicateRecipe([], {
      name: 'Катод базовый', variantLabel: 'A', currentId: null,
    })).toBeNull();
    expect(findDuplicateRecipe(null, {
      name: 'Катод базовый', variantLabel: 'A', currentId: null,
    })).toBeNull();
  });
});
