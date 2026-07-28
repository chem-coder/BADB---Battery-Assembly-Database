// Unit tests for src/utils/nameFingerprint.js
//
// The fingerprint backs duplicate detection at material creation
// (materials_model_cleanup.md §6.3, decision D3): lowercase → trim →
// collapse whitespace → strip punctuation/hyphens → map confusable
// Cyrillic letters to Latin homoglyphs. It is comparison-only — the
// user's original spelling is what gets stored.

import { describe, it, expect } from 'vitest';
import { nameFingerprint } from '@/utils/nameFingerprint';

describe('nameFingerprint — basic normalization', () => {
  it('lowercases', () => {
    expect(nameFingerprint('PVDF')).toBe('pvdf');
    expect(nameFingerprint('NMC 811')).toBe('nmc811');
  });

  it('trims leading/trailing whitespace', () => {
    expect(nameFingerprint('  NMC 811  ')).toBe('nmc811');
    expect(nameFingerprint('\tLFP S19\n')).toBe('lfps19');
  });

  it('collapses internal whitespace runs to a single space', () => {
    expect(nameFingerprint('NMC    811')).toBe('nmc811');
    expect(nameFingerprint('NMC \t 811')).toBe('nmc811');
  });

  it('strips punctuation and hyphens', () => {
    expect(nameFingerprint('NMC-811')).toBe('nmc811');
    expect(nameFingerprint('NMC811')).toBe(nameFingerprint('NMC 811'));
    expect(nameFingerprint('N.M.C.')).toBe('nmc');
    expect(nameFingerprint('PVDF!')).toBe('pvdf');
    expect(nameFingerprint('«NMC 811»')).toBe('nmc811');
  });

  it('does not leave double spaces where punctuation was stripped', () => {
    // "a - b" → strip "-" → "a  b" → collapse → "a b"
    expect(nameFingerprint('LFP - S19')).toBe('lfps19');
  });

  it('keeps digits', () => {
    expect(nameFingerprint('LTO 2000')).toBe('lto2000');
  });

  it('returns "" for null/undefined/blank', () => {
    expect(nameFingerprint(null)).toBe('');
    expect(nameFingerprint(undefined)).toBe('');
    expect(nameFingerprint('')).toBe('');
    expect(nameFingerprint('   ')).toBe('');
  });
});

describe('nameFingerprint — Cyrillic/Latin homoglyphs', () => {
  it('maps the 12 confusable Cyrillic letters to Latin (lowercase)', () => {
    // а в е к м н о р с т у х → a b e k m h o p c t y x
    expect(nameFingerprint('авекмнорстух')).toBe('abekmhopctyx');
  });

  it('maps uppercase Cyrillic too (folded by the lowercase step)', () => {
    expect(nameFingerprint('АВЕКМНОРСТУХ')).toBe('abekmhopctyx');
  });

  it('makes visually identical Cyrillic/Latin names collide', () => {
    // «СМС» (Cyrillic) is pixel-identical to "CMC" (Latin)
    expect(nameFingerprint('СМС')).toBe(nameFingerprint('CMC'));
    // «НС» (Cyrillic) vs "HC" (hard carbon)
    expect(nameFingerprint('НС')).toBe(nameFingerprint('HC'));
    // Mixed-script: Cyrillic «Р» slipped into an otherwise Latin name
    expect(nameFingerprint('РVDF')).toBe(nameFingerprint('PVDF'));
    // Cyrillic «А» inside a model code
    expect(nameFingerprint('LFP S19-А')).toBe(nameFingerprint('LFP S19-A'));
  });

  it('leaves non-confusable Cyrillic letters untouched', () => {
    // б, л, ф, я … have no Latin homoglyph — must survive as-is
    expect(nameFingerprint('Графит')).toBe('гpaфиt');
    // 'Na' is Latin here; hyphen stripped; с→c, о→o, т→t, е→e map,
    // л/и/ы stay Cyrillic.
    expect(nameFingerprint('Na-слоистые')).toBe('nacлoиctыe');
  });

  it('combines all steps (case + spacing + punctuation + script)', () => {
    expect(nameFingerprint('  Смс,  водный !')).toBe(nameFingerprint('CMC водный'));
  });
});
