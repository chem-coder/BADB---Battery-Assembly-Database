# Print Report Layout Guidance for Codex

Use the following design principles when improving the printed battery report layout.

## 1. Fundamental Design Principles

Apply these basic print-design rules so the report is readable, structured, and not visually chaotic.

### Hierarchy

Rank information by importance.

Examples:

- largest text for the report title;
- medium-sized section headers;
- smaller labels and body text;
- muted secondary metadata.

### Balance and Alignment

Use consistent columns, grids, and alignment.

The page should look organized and professional, not like unrelated blocks placed manually.

### Contrast

Use size, weight, spacing, and subtle borders to separate important information.

Do not rely on excessive color.

### Proximity

Group related data closely together.

Examples:

- electrode source information should stay near electrode stack information;
- capacity values should stay in the same visual block;
- notes should stay under the section they describe.

### Repetition

Use consistent formatting for:

- section headers;
- table headers;
- labels;
- numeric values;
- notes;
- metadata rows.

### White Space

Leave enough empty space between sections to avoid crowding.

The goal is a clean technical report, not a dense wall of text.

### Simplicity

Avoid decorative visual effects.

Do not add gradients, heavy backgrounds, 3D effects, icons, or unnecessary borders.

## 2. Gestalt Grouping Principles

Use layout to make relationships obvious.

### Proximity

Elements placed close together are interpreted as related.

### Similarity

Elements with the same visual style are interpreted as belonging to the same type of information.

### Connection

Lines, boxes, or framed sections can be used sparingly to show that content belongs together.

Use containers only when they improve clarity.

## 3. LATCH Information Organization

Information can be organized by:

- Location;
- Alphabet;
- Time;
- Category;
- Hierarchy.

For this battery report, prefer:

- Category for report sections;
- Time for chronological process data;
- Hierarchy for summary values and key results.

## 4. Layout Style

Use a clean print-oriented layout.

Recommended approach:

- use a structured grid;
- use repeated section blocks;
- keep tables simple;
- keep numeric summaries visually aligned;
- avoid over-nesting sections.

A modular grid is preferred for complex report sections because the report contains different types of information: metadata, process parameters, electrode stack data, capacity summaries, QC values, and notes.

## 5. Table Design

Use tables only where tabular comparison is useful.

Apply these rules:

- left-align text;
- right-align numbers;
- keep table headers short;
- avoid excessive borders;
- use light borders only when needed;
- avoid zebra striping unless readability is clearly improved.

## 6. Numeric Data

Numeric values should be easy to compare.

Apply these rules:

- align numbers consistently;
- use consistent decimal precision;
- keep units close to values;
- use tabular-number styling where possible.

CSS example:

```css
.report_number {
  font-variant-numeric: tabular-nums;
}
```

## 7. Data Visualization Style

If charts or visual summaries are added later:

- maximize meaningful data;
- remove non-essential visual clutter;
- avoid 3D effects;
- avoid unnecessary backgrounds;
- label data directly where possible;
- avoid legends when direct labels are clearer.

## 8. Typography

Use no more than two typefaces.

Recommended:

- one clean sans-serif typeface for the full report;
- different weights and sizes for hierarchy.

Do not introduce decorative fonts.

## 9. Specific Instruction for Current Codebase

Improve the printed report layout without changing backend logic or database logic.

Focus only on:

- `battery-print.html`
- `battery-print.js`
- print-related CSS in `styles.css`, if needed

Keep the implementation minimal, readable, and consistent with the existing vanilla HTML/CSS/JS style.

Do not introduce a frontend framework.

Do not rewrite unrelated report logic.

Do not add large dependencies.

Use small, focused changes.