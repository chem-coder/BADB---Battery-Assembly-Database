import { describe, expect, it } from 'vitest';
import { computeTapeMixtureRows } from '../../services/tapeWorkflowService.js';

describe('computeTapeMixtureRows', () => {
  it('subtracts minor dry-material sources before calculating the top-up line, even through nested instances', () => {
    const tape = {
      calc_mode: 'from_active_mass',
      target_mass_g: 200
    };

    const recipeLines = [
      {
        recipe_line_id: 13,
        recipe_role: 'cathode_active',
        include_in_pct: true,
        slurry_percent: 96.8,
        material_id: 11,
        material_instance_id: 12,
        instance_name: 'LFP S19 (чистый)'
      },
      {
        recipe_line_id: 16,
        recipe_role: 'binder',
        include_in_pct: true,
        slurry_percent: 2,
        material_id: 13,
        material_instance_id: 24,
        instance_name: '5% PVDF в NMP'
      },
      {
        recipe_line_id: 14,
        recipe_role: 'additive',
        include_in_pct: true,
        slurry_percent: 1,
        material_id: 15,
        material_instance_id: 16,
        instance_name: 'Super P (чистый)'
      },
      {
        recipe_line_id: 15,
        recipe_role: 'additive',
        include_in_pct: true,
        slurry_percent: 0.2,
        material_id: 17,
        material_instance_id: 28,
        instance_name: '0.4% ОУНТ в NMP'
      },
      {
        recipe_line_id: 17,
        recipe_role: 'solvent',
        include_in_pct: false,
        slurry_percent: null,
        material_id: 12,
        material_instance_id: 13,
        instance_name: 'NMP (чистый)'
      }
    ];

    const componentsByInstanceId = new Map([
      [
        24,
        [
          {
            component_material_instance_id: 14,
            material_id: 13,
            material_role: 'binder',
            mass_fraction: 0.05
          },
          {
            component_material_instance_id: 13,
            material_id: 12,
            material_role: 'solvent',
            mass_fraction: 0.95
          }
        ]
      ],
      [
        28,
        [
          {
            component_material_instance_id: 18,
            material_id: 17,
            material_role: 'conductive_additive',
            mass_fraction: 0.004
          },
          {
            component_material_instance_id: 24,
            material_id: 13,
            material_role: 'binder',
            mass_fraction: 0.4
          },
          {
            component_material_instance_id: 13,
            material_id: 12,
            material_role: 'solvent',
            mass_fraction: 0.596
          }
        ]
      ]
    ]);

    const rows = computeTapeMixtureRows({
      tape,
      recipeLines,
      componentsByInstanceId
    });

    const byLineId = new Map(rows.map((row) => [row.recipe_line_id, row]));

    expect(byLineId.get(15).target_quantity_g).toBeCloseTo(103.305785, 6);
    expect(byLineId.get(16).target_quantity_g).toBeCloseTo(41.322314, 6);
  });
});
