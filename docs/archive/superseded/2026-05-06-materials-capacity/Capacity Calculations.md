
# Capacity Calculations Note

Created: unknown
Edited: 2026-05-06
Status: superseded

Superseded by:

- `docs/current/capacity_calculations.md`


**Удельная ёмкость, мАч/г** - for example, 160 mAh for LFP - this value is intrinsic to a material, i.e., input at the start in materials properties. Must add this parameter to active materials - both anode and cathode. 

Once electrodes have been cut and arranged in decreasing order, 
For each electrode, we need to compute:
**Ёмкость электрода, мАч** = [(масса электрода - масса фольги), г] * (Содержание активного вещества, %) * (Удельная ёмкость материала, мАч/г)

**C avg** = Среднее значение (ср знач) емкости электродов в партии

**Площадь электрода с одной стороны S** = ... cm^2

**C areal** = C avg / S  (this is per electrode - 2 sides)
**C 1/2 areal** = C areal / 2 (per side, in case the electrodes are two-sided, which they are for pouches)


# Practical recommendation for BADB (this fits your schema perfectly)

Store:

### In materials:

- `specific_capacity_mAh_g` (reference value)
    

### In electrodes (computed):

- `areal_capacity_mAh_cm2`
    
- optionally:
    
    - `total_capacity_mAh = mass * specific_capacity`
        

---

# Key insight

- Material → gives **specific capacity**
    
- Electrode → gives **areal + total capacity**
    
- Battery → gives **limiting electrode capacity**
