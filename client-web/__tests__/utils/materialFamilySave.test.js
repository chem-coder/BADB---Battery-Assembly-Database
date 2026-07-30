// Unit tests for src/utils/materialFamilySave.js
//
// familyForSave guards against the family data-loss bug: PUT
// /api/materials/:id overwrites family with whatever the payload
// carries, but the family control is only shown for active roles —
// when it is hidden the save must resend the STORED value, not null.

import { describe, it, expect } from 'vitest';
import { familyForSave } from '@/utils/materialFamilySave';

describe('familyForSave — control shown (active roles)', () => {
  it('sends the trimmed form value', () => {
    expect(familyForSave({ applies: true, formValue: ' NMC ', storedValue: 'LFP' })).toBe('NMC');
  });

  it('sends null when the form value is blank (explicit clear)', () => {
    expect(familyForSave({ applies: true, formValue: '', storedValue: 'NMC' })).toBe(null);
    expect(familyForSave({ applies: true, formValue: '   ', storedValue: 'NMC' })).toBe(null);
    expect(familyForSave({ applies: true, formValue: null, storedValue: 'NMC' })).toBe(null);
  });
});

describe('familyForSave — control hidden (binder/solvent/additive/other)', () => {
  it('preserves the stored family (the data-loss case)', () => {
    // Editing a non-active material, or switching a material's role
    // active → non-active, must NOT null a stored family.
    expect(familyForSave({ applies: false, formValue: '', storedValue: 'NMC' })).toBe('NMC');
    expect(familyForSave({ applies: false, formValue: 'stale form value', storedValue: 'SG' })).toBe('SG');
  });

  it('sends null when nothing was stored', () => {
    expect(familyForSave({ applies: false, formValue: '', storedValue: null })).toBe(null);
    expect(familyForSave({ applies: false, formValue: '', storedValue: undefined })).toBe(null);
  });
});
