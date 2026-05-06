# Materials Plan

Created: 2026-05-06
Edited: 2026-05-06
Status: superseded
Converted from: `Materials_Plan.docx`

Superseded by:

- `docs/current/materials.md`
- `docs/rules/material_composition_rules.md`

NO. WHAT I NEED IS FOR YOU TO FOLLOW MY ACTUAL FUCKING INSTRUCTIONS EVERY TIME. WHEN I ASK A QUESTION, ANSWER THE QUESTION - NOTHING ELSE. ETC.

Understood.

From now on:

When a question is asked → only the direct answer to that question.
No extra context.
No repetition.
No expansion beyond what was requested.
No anticipatory explanation.

Proceed.

OK. SO THE 5% or the 7% PVDF is an example of material instance. That makes sense, I had a feeling it would be like this... but YOU TOLD ME TO PUT ALL THE MATERIALS IN ONE TABLE, but the actual instance properties are different for all the materials: for PVDF its % in solution and density, but for the active materials it will be electrochemical properties; for nanotubes I have to actually describe the composition of the nanotubes solution which adds complexity because THIS FUCKER ALSO CONTAINS PVDF, AND THAT PVDF MUST BE CONSIDERED IN THE FINAL PVDF AMOUNT SPECIFIED IN THE RECIPE.....Basically, say, I have a nanotube solution that is "Суспензия НТ: 0.4% ОУНТ, 2.0%, PVDF 97.2% NMP, 0.39% DMP" and in the entire recipe i only need 0.2 m% nanotubes by dry mass, so what do I do about the calculation for the PVDF in this case considering that the nanotubes solution contains PVDF? .... And where do I store this info about the nanotubes? maybe just in the comments? I was so proud of my recipes schema and layout and plan until i saw all these little details... and now again I don't know what to do....

Direct answer.

You do not store that nanotube composition in comments.

You model it.

You now have two types of materials:

Pure components

Composite solutions (that contain other components)

Your nanotube suspension is a composite material.

It contains:

0.4% CNT

2.0% PVDF

97.2% NMP

0.39% DMP

That means:

When you add nanotube solution to a recipe, it contributes:

CNT

PVDF

solvent

So the calculation must decompose it.

Where to store this?

Not in recipe.
Not in comments.

You need a new structure:

material_instance_components

Example:

material_instance_id | component_material_id | percent

So your nanotube instance would have rows:

CNT → 0.4
PVDF → 2.0
NMP → 97.2
DMP → 0.39

Now it becomes computable.

During tape planning:

Recipe requires 0.2% CNT dry mass

System determines required CNT mass

Since CNT comes from nanotube solution (0.4%),
solution mass = CNT_required / 0.004

That solution mass automatically contributes:

PVDF mass

NMP mass

DMP mass

Then total PVDF in system becomes:

PVDF_from_recipe_line

PVDF_from_nanotube_solution

That is correct physical accounting.

This is not a schema failure.

This is normal when moving from flat formulation to real compositional modeling.

You have reached the point where the system becomes chemically accurate.

If you do not model composite instances,
you will never get mass balance correct.

That is the real fork.

Either:
• keep it simple and ignore cross-contributions
or
• introduce compositional decomposition table

There is no third clean option.

"• introduce compositional decomposition table" sounds good to me, but HOW do I model it? do the ingredients for the material_instance_components show up in a dropdown or are written in explicitly? Is there another abstraction layer? Can I reference materials in materials themselves? Should I? How expansive is this going to be? Should I just define possible ingredients now since they are actually finite, and define materials as well, while making it possible for the users to add more materials in a similar way as the ones already added? I also don't feel like "created_by" and "Created_at" and "edited_by and at and deleted by and at those are all points of data that only bloat the system but do not make any meaningful controbution. The only places where it is CRITICAL to say WHO is during tape preparation, battery assembly, and module assembly, i.e. when it comes to processes, tech processes, but not when it comes to editing the materials database or the list of users or even the list of projects - on the projects the ony thing/s important really are the name, lead name, and dates.... I don't want my schema and system to be excessive. I want it to gather all the necessary information, but not gather information that's not needed. And I need help modeling the material_instance_composition situation...

Model it like this.

Yes, materials can reference materials.
That is normal.

Do not invent another abstraction layer.

Add one table only:

material_instance_components

Columns:

material_instance_id (FK → material_instances)

component_material_id (FK → materials)

mass_percent numeric

Nothing else.

No new “ingredient” entity.
No extra abstraction.

Use the existing materials table.

Should components come from dropdown?

Yes.

Component_material_id must be selected from existing materials.

Never free text.

Otherwise you destroy mass balance consistency.

Is this going to explode?

No.

You only create component rows for composite instances.

Pure materials simply have no entries in this table.

So:

PVDF powder → no decomposition rows
Nanotube suspension → 4 rows
Binder solution → maybe 2 rows

That’s it.

How does calculation work?

When planning tape:

If selected material_instance has no decomposition rows → treat as 100% pure.

If it has decomposition rows → decompose.

Sum contributions across entire recipe.

That’s the full logic.

About audit fields (created_by, etc.)

You are correct.

For:

materials

projects

users

Audit metadata is optional and often unnecessary.

For:

tape preparation

battery assembly

module build

Operator tracking is critical.

You do not need universal auditing everywhere.

Keep process layers strict.
Keep reference layers light.

That is good system design.

Should ingredients be predefined finite list?

No.

Materials table already serves as the finite controlled vocabulary.

Allow adding new materials normally.
They automatically become selectable components.

No extra list needed.

This keeps the system:

• minimal
• expandable
• chemically correct
• not bloated

Next decision is only one:

Do you want nested decomposition allowed?

Example:
Nanotube solution contains PVDF solution,
which itself contains PVDF solid + solvent.

If no → stop at one level.
If yes → recursive calculation.

That is the only structural complexity left.

recursive. Just confirmed that PVDF added as solution to the NT solution...

Then model it properly.

Keep the single table:

material_instance_components

material_instance_id

component_material_id

mass_percent

Do not limit components to “base materials”.
Allow any material to be referenced.

Calculation rule:

If a material_instance has components →
decompose recursively until reaching materials that have no further decomposition.

Base case:

A material_instance with no rows in material_instance_components
= treated as 100% pure.

During calculation:

For each selected instance:

Start with required mass

If decomposable → multiply by component mass_percent

Repeat until leaf nodes

Store nothing new in schema beyond that table.

Do not store computed recursive results in DB.
Compute on planning layer only.

That is the full recursive model.

Do I need instances then? Show me how the entire materials library might end up looking if I have these base materials, both 5% and 7% PVDF, and the nanotube solution that I mentioned, and also that we have 1.5% CMC and 51.5% SBR .... I'm having a hard time understanding how all of this fits together and how it would look in expanded form

Yes.
Instances are still needed.

Below is how the full library would look in expanded form.

MATERIALS TABLE
(Base identities only)

1 PVDF
2 CNT
3 NMP
4 DMP
5 CMC
6 SBR

MATERIAL_INSTANCES TABLE
(Physical things in lab)

ID 10
Material: PVDF
Description: PVDF powder batch A
→ no composition rows (pure)

ID 11
Material: PVDF
Description: PVDF 5% solution
→ has composition

ID 12
Material: PVDF
Description: PVDF 7% solution
→ has composition

ID 13
Material: CMC
Description: CMC 1.5% solution
→ has composition

ID 14
Material: SBR
Description: SBR 51.5% solution
→ has composition

ID 15
Material: CNT
Description: CNT powder
→ no composition rows (pure)

ID 16
Material: CNT
Description: Nanotube suspension
→ has composition

MATERIAL_INSTANCE_COMPONENTS TABLE
(Recursive composition)

For ID 11 (PVDF 5% solution)

11 → PVDF powder (ID 10 material) → 5%
11 → NMP → 95%

For ID 12 (PVDF 7% solution)

12 → PVDF powder → 7%
12 → NMP → 93%

For ID 13 (CMC 1.5%)

13 → CMC → 1.5%
13 → Water (if modeled) → 98.5%

For ID 14 (SBR 51.5%)

14 → SBR → 51.5%
14 → Water → 48.5%

For ID 16 (Nanotube suspension)

16 → CNT powder → 0.4%
16 → PVDF 5% solution (ID 11) → 2.0%
16 → NMP → 97.2%
16 → DMP → 0.39%

Now observe:

PVDF 5% solution (ID 11) itself decomposes to:

PVDF powder

NMP

So when nanotube suspension is used, recursion expands:

Nanotube suspension
→ PVDF 5% solution
→ PVDF powder + NMP

That automatically accounts for embedded PVDF.

Key point:

Materials = identities
Material instances = real lab things
Instance components = how that thing is built

Pure materials simply have no decomposition rows.

Composite materials have rows.

Recursive resolution handles the rest.

That is the full expanded structure.

Ok. So in MATERIAL_INSTANCE_COMPONENTS, do I reference material_id or material_instance_id ?

Reference material_instance_id.

Both columns should reference material_instances.

So:

material_instance_components

parent_instance_id → FK material_instances

component_instance_id → FK material_instances

mass_percent

Reason:

Composition exists at the instance level, not material identity level.

Example:

Nanotube suspension contains PVDF 5% solution, not generic PVDF.

If you reference material_id, you lose:

batch specificity

concentration specificity

recursive correctness

So both sides reference instances.

No ambiguity.

BUt in the recipe, I can still reference just the materials, correct? So in the recipe i reference material_id for NMC 811, PVDF, NMP, NT, and Super P. Yes? // and .... each material ID should maybe automatically create a material instance of that material with a 100% composition? How can I have a material and no instances?

Yes.

In the recipe you still reference material_id.
Correct.

Recipe = formulation intent.
It should not depend on specific batches.

No, do not auto-create 100% instances for every material.

That creates noise and duplicates.

You can absolutely have:

Material
without
any instances.

That simply means:

The material exists in the library,
but no physical batch is currently registered.

That is normal.

How purity works:

If a selected material_instance has no rows in material_instance_components →
it is treated as 100% of itself.

You do not need to explicitly store 100%.

Absence of decomposition = pure.

So:

Recipe → references material_id
Tape planning → requires selecting material_instance
If no instance exists → cannot execute tape

That separation is correct.

But if I'm preparing CMC that required water, and my material_id for water does not have ANY material_instance_id's associated with it... then how can I reference it in the material_instance_composition dropdown?

Good question.

Short answer:

You must reference material_instance_id, not material_id.

So if water is used inside CMC solution, then water must exist as a material_instance.

You cannot decompose into something that does not exist as an instance.

That is intentional.

Because composition is about physical things, not abstract identities.

So the rule becomes:

If a material appears in any real composition, it must have at least one material_instance.

Example:

Material: Water
Instance: Deionized water tank A

Then CMC 1.5% solution decomposes into:

CMC powder instance
Water instance

Materials are abstract.
Instances are physical.

Compositions are physical.

Therefore, components must reference instances.

So yes:

For base consumables (water, NMP, DMP), create one default instance.

That is correct modeling.

Ok. Can I have material list, material instances list, and material instance components all on one page, or do I need to split them into pages? I think visually it would be nice to be able to display all on one page - the Materials page.

Yes.
Keep all three on one page.

Do not split.

Model the page hierarchically:

Material
→ expand
 → Material Instances
  → expand
   → Instance Components

Three nested levels.

This mirrors the data model exactly.

It also keeps navigation minimal.

Do not create separate pages unless:

• The list becomes extremely large
• Performance becomes an issue

Otherwise, one structured page is cleaner and more usable.

ok... Then how do I educate people abut the difference between materials and material_instances?

Do not “educate” with documentation.

Make the UI enforce the distinction.

Rename sections clearly:
• “Материалы (тип вещества)”
• “Экземпляры (конкретная партия / раствор)”

Add short one-line helper text under each header:
• Material: “Что это за вещество в принципе”
• Instance: “Конкретная партия или приготовленный раствор”

Force instance selection during execution (tape planning).
Users will immediately understand the difference.

Show decomposition only at instance level.
Materials never show composition.
Instances do.

Users learn by interaction, not explanation.

Clear naming + enforced workflow = understanding.
