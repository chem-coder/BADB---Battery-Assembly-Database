## Capacity calculations

[[Capacity Calculations]]

  - material-level specific capacity field
  - electrode-level calculated capacity
  - battery-level limiting capacity
  - estimated energy values
### Decide what belongs where
- Decide what should be stored as reference data in `materials`
- Decide what should be computed from tape / electrode data
- Decide what should be computed only at battery level
### Materials
- Consider adding `specific_capacity_mAh_g` to materials
- Decide whether nominal voltage or other reference electrochemical values should also live in materials
### Electrodes
- Decide whether to calculate `areal_capacity_mAh_cm2`
- Decide whether to calculate `total_capacity_mAh`
- Decide which upstream values those calculations should depend on:
  - loading
  - active mass
  - cut area
  - material reference values
### Batteries
- Decide whether battery capacity should be estimated from the limiting electrode
- Decide whether that value should be shown on the batteries page
- Decide whether unnecessary volume calculations on the batteries page should be removed or replaced with more meaningful capacity-related values
### Backend / API
- Decide whether these values should be stored in the database or computed on demand
- If computed, define the formulas clearly in backend code
- Return calculated capacity values through the API in a consistent structure
### UI
- Decide where scientists actually need to see these values:
  - materials page
  - electrodes page
  - batteries page
- Add display fields only after the data meaning is clearly defined

### Working assumption
- Most likely useful path:
  - store material-level specific capacity as reference data
  - compute electrode-level areal / total capacity from process data
  - derive battery-level capacity from the limiting electrode

## Electrodes
- Calculate energy capacity per electrode
### Pouch & Cylinder
- Add battery assembly parameters worth tracking
## Materials Inventory
- Add another page for keeping track of materials:
  - supplier
  - brand
  - date ordered
  - date arrived
  - date of chemical analysis
  - date of expiration
  - date marked as good/bad
  - quantity ordered
  - price ordered
  - uploaded files for this material
  - good/bad label
  - material-type-specific physical characteristics
  - possibly a flexible characteristic selector if needed
- Ask Svetlana which parameters should be added
- Ask Victor which properties he wants to be explicitly tracked
- Calculate capacity for the material, or percent capacity compared to the value declared by the supplier

### Good or Bad Materials Selector
- Add a way to label materials as "Good for reorder" or "Bad - don't order again"

## Recipes
- In materials, add `density` so that recipes can reflect volume calculated from density and mass

## Optimization

[[BATTERY_ASSEMBLY_LOGS_REFERENCES]] provides bibliography-based suggestions for system optimization and expansion.