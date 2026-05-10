# electrodes logic

Created: 2026-05-06
Edited: 2026-05-06
Status: raw inbox
Converted from: `electrodes-logic.txt`

The clean logic is this:

1. Form-factor is selected:

A. Coin half
B. Coin full
C. Pouch
D. Cylinder

Based on that, constraints are needed in 2 different places:

1. Electrode sources (battery_electrode_sources):

a) if A (coin half):
	ONLY 1 cathode_tape & batch OR 1 anode_tape & batch
b) if B (coin full), C (pouch), or D (cylinder):
	Exactly 1 cathode_tape & batch AND 1 anode_tape & batch

2. Electrodes in the stack (battery_electrodes):

a) if A (coin half):
	1 electrode (1C OR 1A)

b) if B (coin full):
	1C + 1A

c) if C of D:
	multiple cells possible. Period. And the number of electrodes is
	cathodes = anodes OR
	off by one.

At the UI:

Before the stack is interacted with, the UI (I think the UI should make the decision, not the schema; but I am not sure. Maybe recording the number of cathodes and the number of anodes into the schema would be a good thing) makes a decision:
how many anodes and how many cathodes will be in the stack?

If
a) if A (coin half): only one cathode OR one anode
b) if B (coin full): only one cathode AND one anode
c) if C (pouch) or D (cylinder): ASK THE USER, i.e.,
there should be two new inputs at the top of the electrodes selection fieldset that look sorf of like this:

Please, specify how many electrodes will be in this stack:
Number of Cathodes: ______  // Number of Anodes: _______

*** For all, the anove constraints are atill valid: one for lhalf cells, one each for full cells; equal or off by one, where A = C + 1 for pouch and cylinder.

Then, UI interaction model:

The NUMBER OF ELECTRODES is important here and will be used here.
The UI allows to select only that many electrodes from the checkable list. Once the number is selected, the rest become greyed out, and to ungrey them, one has to deselect an electrode or more such that the total number of electrodes selected is smaller than the number of electrodes specified in the NUMBER OF ELECTRODES logic above.
This is true for ALl the form factors.

The selected electrodes appear in the "Electrode stack" list below the "Electrodes in this batch" lists in the electrode selection fieldset. The electrodes are arranged in order by mass, layering A & C, and starting with A (since the number of anodes is either equal to cathodes or greater than cathodes by one).

target electrode count logic:

If half cell:
either

1 cathode (1-sided) and 0 anodes

or

0 cathodes and 1 anode (1-sided)


If full cell (coin):

1 cathode (1-sided) and 1 anode (1-sided)


Battery page logic:

On creation of a new battery, the form opens.
The form is empty, here is what happens:

Person who created it is sutomatically selected and filled into the dropdown select, which is blocked - TRUE. DONE.

The user selects the form-factor and may add comments.
In element config, the user fills in the detais.
Then background calculations/processes commence. This information becomes stored in the state for the battery, and on page load these calculations must be performed to obtain the appropriate state values.

{
Background calculations:

(1) sidedness

form_factor = coin → compatible electrode batches should be one_sided.
form_factor = pouch or cylinder → compatible electrode batches may be 1-sided OR 2-sided (no limitations)

(2) Electrode sources (battery_electrode_sources):

a) if A (coin half):
	ONLY 1 cathode_tape & batch OR 1 anode_tape & batch
b) if B (coin full), C (pouch), or D (cylinder):
	Exactly 1 cathode_tape & batch AND 1 anode_tape & batch

(3) Electrodes in the stack (battery_electrodes):

a) if A (coin half):
	1 electrode (1C OR 1A)
b) if B (coin full):
	1C + 1A
c) if C of D:
	multiple cells possible. Period. And the number of electrodes is
	cathodes = anodes OR
	off by one.
}

Based on these results of background calculations, electrode source menu is provided
(
limited to either cathodes, aondes, or both based on battery_elelctrode_sources;
limited to 1-sided or both 1-sided and 2-sided based on sidedness;
limited by shape - circles for coins, rectangles for pouches and cylinders - based on ...;
not limited by electrode size;
)

Inside the battery_electrode_sources, there are three dropdowns. The electrode batch is the important one; the project dropdown and the tape dropdown basically act as filters to help find the desired electrode batch.

Once the desired electrode batch (A or C) or batches (A AND C) is/are selected, the electrodes from that/those batch/es is/are displayed in the "Electrode selection" fieldset.

Electrode selection fieldset:

At the top is the "Number of electrodes" section.

Number of anodes: _____ // Number of cathodes: ______

For coins, these are filled automatically (they will be 1,0; 0,1; or 1,1), but for pouch and cylinders, these are not filled in automatically - leave them for the user.
Once the user has specified how many of each electrode, they have a button probably, or some other way (like maybe if it sits still for more than 5 seconds) to tell the program that they are done filling this in, and the program checks to make sure that the numbers are adequate - i.e., that the number of anodes is either equal to or one greater than the number of cathodes.
If, when the program checks, this is not true, the user gets an alert and is told to fix it. The electrode stack selection cannot be finished until this section is satisfied.

Once the number of electrodes of each type has been finalized and approved by the program as adequate, the program allows the user to start electrode selection.

Electrodes lists are loaded and the checkboxes are enabled, active, and not disabled or blocked in any way. the program listens for changes in the electrode selection and performsbackground calculations to decide when to disable the remaining unselected electrodes.

Here, we can have a calculation function that does something like this:
if (targetCathodes - selectedCathodes = 0) {
	activate disabled HTML attribute and JavaScript property on all unselected electrodes in this list;
}

if (targetAnodes - selectedAnodes = 0) {
	activate disabled HTML attribute and JavaScript property on all unselected electrodes in this list;
}

Keep listening for selected changes. If one is unchecked and (targetCathodes - selectedCathodes != 0) or (targetAnodes - selectedAnodes != 0), deactivate the disabled. Keep doing this until the stack is selected by the user and finalized.

Below the two lists, show the layered stack starting with anode - GOOD, ALREADY DONE.

NEW THING:
When the user clicks "Save stack", an alert pops up that says, "Are you sure you are ready to save the stack? Once the stack is specified, it cannot be changed." or something like that - in Russian. The user confirms.

Once the user confirms, the battery stack is saved and cannot be changed. This means that the tape and electrode batch are also set in stone and cannot be changed, so those dropdowns are all displaying the current values and are disabled so the user can see the value but can't change it.

The user should be able to change the comments and the project_id of the battery, as well as all the data lower down the page under the electrode stack.
