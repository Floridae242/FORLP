# FORLP IOC High-Fidelity Figma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the approved Operations Dark FORLP component library, operational patterns, three 1920 × 1080 desktop templates, accessibility modes, and prototype flows in the existing FORLP Figma file.

**Architecture:** Preserve the existing `FORLP Wireframes` page as source material and construct a parallel, token-driven high-fidelity library across five new Figma pages. Build foundations first, then primitives, composite components, operational patterns, and templates; record returned node IDs after every write so later tasks depend on stable identifiers rather than canvas searches.

**Tech Stack:** Figma Design, Figma Variables, Figma component properties and variants, Auto Layout, Smart Animate, `use_figma`, `get_metadata`, `get_screenshot`, and a local JSON node manifest tracked in Git.

## Global Constraints

- Target the existing Figma file `aYx7tTJ6Iwa2WjCMQ125Iv` and preserve the existing `FORLP Wireframes` page.
- Primary frame is fixed at 1920 × 1080 px; expanded sidebar is 240 px, collapsed sidebar is 72 px, and top status bar is fixed at 64 px.
- Main Page uses zero gap; Workspace and Card Rows use 20 px gap; component-internal gaps use 16 px unless the specification defines 8–12 px dense spacing.
- The 12-column desktop grid uses 24 px outer content padding and 16 px column gutters.
- Use `IBM Plex Sans Thai`; use tabular numerals for live counts, timestamps, percentages, environmental readings, chart axes, and tables.
- Thai text containers must retain at least 2 px of vertical safety beyond the line-height bounds; text nodes hug vertically and are never vertically stretched.
- Default mode is `Operations Dark`; `High Contrast Dark` must be implemented with semantic variable modes rather than duplicated component sets.
- Statuses combine label, color, icon, and required shape: Normal circle, Moderate triangle, Dense split diamond or rising arrow, Critical octagon, Information circle-i, Unknown hollow circle-dash.
- Distinguish Loading, Zero, No Data, Stale, Error, Disabled, and Restricted states; never render missing data as zero.
- Motion is functional: Fast 100–120 ms, Base 180–220 ms, Slow 280–320 ms; include Reduced Motion prototype variants.
- Figma writes must be incremental. Every `use_figma` mutation must return all created and mutated node IDs, and every task must end with metadata and screenshot verification.
- Do not modify application source, dependencies, third-party credentials, or the 16 dependency vulnerabilities recorded during design review.
- Source specification: `docs/superpowers/specs/2026-07-15-forlp-ioc-high-fidelity-design.md` at commit `bf208ab`.

---

### Task 1: Establish the Figma build workspace and node manifest

**Files:**
- Modify: Figma file `aYx7tTJ6Iwa2WjCMQ125Iv`
- Create: `docs/design/forlp-ioc-figma-node-manifest.json`
- Create: `docs/design/forlp-ioc-figma-qa.md`

**Interfaces:**
- Consumes: existing `FORLP Wireframes` page and approved specification `bf208ab`
- Produces: page IDs for `00 Foundations`, `01 Primitives`, `02 Components`, `03 Patterns`, and `04 Templates`; manifest schema `{ fileKey, sourcePageId, pages, variables, styles, components, patterns, templates, prototypeFlows }`

- [ ] **Step 1: Inspect the current file without mutation**

Use `get_metadata` on node `0:1`, then use a read-only `use_figma` call to return page IDs, names, and top-level child counts:

```js
return {
  fileKey: figma.fileKey,
  editorType: figma.editorType,
  pages: figma.root.children.map(page => ({
    id: page.id,
    name: page.name,
    childCount: page.children.length
  }))
}
```

Expected: the existing wireframe page is present and no high-fidelity page name is duplicated.

- [ ] **Step 2: Create or reuse the five library pages**

Run one incremental page-creation script and preserve existing pages:

```js
const required = [
  '00 Foundations',
  '01 Primitives',
  '02 Components',
  '03 Patterns',
  '04 Templates'
]
const createdNodeIds = []
const pages = {}
for (const name of required) {
  let page = figma.root.children.find(node => node.type === 'PAGE' && node.name === name)
  if (!page) {
    page = figma.createPage()
    page.name = name
    createdNodeIds.push(page.id)
  }
  pages[name] = page.id
}
return { createdNodeIds, pages }
```

Expected: exactly one page exists for every required name; the wireframe page remains unchanged.

- [ ] **Step 3: Create the node manifest and QA checklist**

Create the manifest with the five concrete opaque page IDs returned by Step 2. The required shape is:

```ts
type FigmaNodeManifest = {
  fileKey: 'aYx7tTJ6Iwa2WjCMQ125Iv'
  sourcePageId: '0:1'
  pages: {
    foundations: string
    primitives: string
    components: string
    patterns: string
    templates: string
  }
  variables: Record<string, string>
  styles: Record<string, string>
  components: Record<string, string>
  patterns: Record<string, string>
  templates: Record<string, string>
  prototypeFlows: Record<string, string>
}
```

All five page values must be non-empty node IDs copied verbatim from the `pages` object returned in Step 2. The other record groups begin as empty objects and are populated by later tasks.

The QA file begins with unchecked sections for Foundations, Primitives, Components, Patterns, Templates, Accessibility, Prototype, Thai Typography, and Handoff.

- [ ] **Step 4: Verify and commit the workspace record**

Run:

```bash
git diff --check -- docs/design/forlp-ioc-figma-node-manifest.json docs/design/forlp-ioc-figma-qa.md
git add docs/design/forlp-ioc-figma-node-manifest.json docs/design/forlp-ioc-figma-qa.md
git commit -m "docs: initialize FORLP Figma build manifest"
```

Expected: commit contains only the manifest and QA checklist.

---

### Task 2: Build variables, typography, grid, and elevation foundations

**Files:**
- Modify: Figma page `00 Foundations`
- Modify: `docs/design/forlp-ioc-figma-node-manifest.json`
- Modify: `docs/design/forlp-ioc-figma-qa.md`

**Interfaces:**
- Consumes: page IDs from Task 1
- Produces: variable collection IDs `Primitives`, `Semantic`, `Component`; mode IDs `Operations Dark`, `High Contrast Dark`; text, grid, paint, and effect style IDs

- [ ] **Step 1: Create the variable collections and modes**

Use `figma.variables.getLocalVariableCollectionsAsync()` to reuse exact-name collections. Create missing collections, rename the default Semantic mode to `Operations Dark`, and add `High Contrast Dark` only when absent.

```js
const existing = await figma.variables.getLocalVariableCollectionsAsync()
const createdNodeIds = []
const collections = {}
for (const name of ['Primitives', 'Semantic', 'Component']) {
  let collection = existing.find(item => item.name === name)
  if (!collection) collection = figma.variables.createVariableCollection(name)
  collections[name] = collection
}
const semantic = collections.Semantic
semantic.renameMode(semantic.defaultModeId, 'Operations Dark')
let highContrast = semantic.modes.find(mode => mode.name === 'High Contrast Dark')
if (!highContrast) {
  const modeId = semantic.addMode('High Contrast Dark')
  highContrast = { modeId, name: 'High Contrast Dark' }
}
return {
  createdNodeIds,
  collectionIds: Object.fromEntries(Object.entries(collections).map(([key, value]) => [key, value.id])),
  semanticModes: semantic.modes
}
```

Expected: three exact-name collections and two Semantic modes.

- [ ] **Step 2: Create primitive and semantic variables**

Create the brand, surface, text, border, status, spacing, radius, and motion variables from the approved specification. Set explicit scopes on every variable. Required semantic mode values include:

```js
const semanticValues = {
  'surface/canvas': { operations: '#07111F', highContrast: '#020812', scopes: ['FRAME_FILL'] },
  'surface/sidebar': { operations: '#091827', highContrast: '#091827', scopes: ['FRAME_FILL'] },
  'surface/base': { operations: '#0D1D2D', highContrast: '#0D1D2D', scopes: ['FRAME_FILL', 'SHAPE_FILL'] },
  'surface/raised': { operations: '#12263A', highContrast: '#12263A', scopes: ['FRAME_FILL', 'SHAPE_FILL'] },
  'surface/elevated': { operations: '#183149', highContrast: '#183149', scopes: ['FRAME_FILL', 'SHAPE_FILL'] },
  'surface/selected': { operations: '#123B61', highContrast: '#123B61', scopes: ['FRAME_FILL', 'SHAPE_FILL'] },
  'text/primary': { operations: '#F3F7FC', highContrast: '#F3F7FC', scopes: ['TEXT_FILL'] },
  'text/secondary': { operations: '#B7C5D5', highContrast: '#F3F7FC', scopes: ['TEXT_FILL'] },
  'text/tertiary': { operations: '#8294A8', highContrast: '#B7C5D5', scopes: ['TEXT_FILL'] },
  'border/subtle': { operations: '#1D344A', highContrast: '#29445D', scopes: ['STROKE_COLOR'] },
  'border/default': { operations: '#29445D', highContrast: '#42617D', scopes: ['STROKE_COLOR'] },
  'status/normal': { operations: '#32D583', highContrast: '#32D583', scopes: ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'] },
  'status/moderate': { operations: '#FDB022', highContrast: '#FDB022', scopes: ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'] },
  'status/dense': { operations: '#FF7A45', highContrast: '#FF7A45', scopes: ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'] },
  'status/critical': { operations: '#F97066', highContrast: '#F97066', scopes: ['TEXT_FILL', 'SHAPE_FILL', 'STROKE_COLOR'] }
}
```

Use a tested hex-to-RGB helper and bind semantic aliases to primitives where the Figma variable API permits. Record every variable ID in the manifest.

- [ ] **Step 3: Create text, grid, paint, and effect styles**

Load `IBM Plex Sans Thai` Regular, Medium, and SemiBold before editing any text or text style. Create the ten typography styles defined in the specification and a `Grid/Desktop/12` layout-grid style with 12 columns, 16 px gutters, and 24 px margins. Create Level 0–3 effect styles with the exact shadow values from the specification.

Expected style names:

```text
Type/Display
Type/Heading 1
Type/Heading 2
Type/Heading 3
Type/Body Large
Type/Body
Type/Body Medium
Type/Label
Type/Caption
Type/Micro
Grid/Desktop/12
Elevation/Level 0
Elevation/Level 1
Elevation/Level 2
Elevation/Level 3
```

- [ ] **Step 4: Build a visual foundation specimen**

On `00 Foundations`, create a 1440 px-wide vertical Auto Layout specimen containing color swatches for both modes, all text styles with Thai samples, spacing and radius examples, elevation examples, and the six shape-coded statuses. Place the specimen to the right of existing top-level nodes and return all created IDs.

- [ ] **Step 5: Verify and commit foundation records**

Use metadata to confirm exact collection, mode, and style names. Capture a screenshot of the complete specimen and a close screenshot of Thai samples containing `ที่`, `น้ำ`, and `ผู้`. Update the manifest and QA checklist, then commit:

```bash
git add docs/design/forlp-ioc-figma-node-manifest.json docs/design/forlp-ioc-figma-qa.md
git commit -m "docs: record FORLP Figma foundations"
```

---

### Task 3: Build primitive interactive components

**Files:**
- Modify: Figma page `01 Primitives`
- Modify: `docs/design/forlp-ioc-figma-node-manifest.json`
- Modify: `docs/design/forlp-ioc-figma-qa.md`

**Interfaces:**
- Consumes: Semantic variables and typography styles from Task 2
- Produces: component-set IDs for Button, Icon Button, Input, Select, Status Badge, Tooltip, Tab, and Segmented Control

- [ ] **Step 1: Create Button and Icon Button sets**

Create Button variants for `Type=Primary|Secondary|Tertiary|Destructive`, `State=Default|Hover|Focus|Active|Disabled|Loading`, and `Size=Default|Large`. Use 40 px default height, 48 px large height, 16 px horizontal padding, 8 px gap, 10 px radius, 18 px icon, and 88 px minimum width. Create a separate 40 × 40 px Icon Button set with tooltip behavior documented in its description.

Every button component uses horizontal Auto Layout, centered alignment, Hug width, Fixed height, and a Thai label sample `ดำเนินการ`.

- [ ] **Step 2: Create Input and Select sets**

Create Input variants for `State=Default|Hover|Focus|Filled|Error|Success|Disabled|Read-only` and `Type=Text|Search|Officer Code|Number|Date|Time|Threshold`. The shell is 44 px high with 12 px horizontal padding, 8 px gap, and 6 px radius. The outer field stack uses vertical Auto Layout and a 6 px gap.

Create Select variants for `State=Default|Hover|Focus|Filled|Error|Disabled`, plus Single and Multi type. Create a menu specimen with 40 px minimum items, a 56 px wrapped Thai item, 6 px menu padding, and a 360 px maximum visible height.

- [ ] **Step 3: Create status, tooltip, tab, and segmented-control sets**

Create Status Badge variants for all six statuses and Compact/Default sizes. Bind status fills and text to semantic variables and preserve required shapes. Create Tooltip in Top/Right/Bottom/Left placement variants. Create Tab and Segmented Control sets with Default, Hover, Focus, and Active states.

- [ ] **Step 4: Add component properties and descriptions**

Expose `Label`, `Icon`, `Loading`, `State`, `Size`, and `Status` only where applicable. Component descriptions state their sizing, Thai typography safety, status semantics, and disabled/loading behavior.

- [ ] **Step 5: Verify primitive states and commit records**

Capture full-page and focused screenshots for Button, Input, Select, and Badge sets. Check that variants do not resize when changing state and that Thai labels do not clip. Record component-set IDs and commit the updated manifest and QA checklist with `docs: record FORLP Figma primitives`.

---

### Task 4: Build composite components and data states

**Files:**
- Modify: Figma page `02 Components`
- Modify: `docs/design/forlp-ioc-figma-node-manifest.json`
- Modify: `docs/design/forlp-ioc-figma-qa.md`

**Interfaces:**
- Consumes: primitive component IDs and Semantic variables
- Produces: component-set IDs for Sidebar, Top Bar, Base Card, KPI Card, Table, Filter Bar, Chart Shell, Dialog, Drawer, Toast, Empty State, and Data State

- [ ] **Step 1: Create the application navigation components**

Build Sidebar variants `State=Expanded|Collapsed` with fixed widths 240 and 72 px and Fill height. Include brand, primary navigation, operational status group, administration group, and bottom-pinned officer profile. Build a fixed 64 px Top Bar containing title, market state, data freshness, labeled service health, notifications, and profile.

- [ ] **Step 2: Create Base Card and KPI Card sets**

Base Card uses Fill width, Hug height, 20 px padding, 16 px internal gap, 10 px radius, subtle border, and vertical Auto Layout. Create `State=Default|Loading|Zero|No Data|Stale|Error|Disabled`. Stale must show the last-known value, timestamp, warning shape, and `ข้อมูลอาจล่าช้า`; No Data displays `—`; Zero displays `0`.

KPI Card exposes label, value, unit, delta, timestamp, and optional sparkline. Use tabular numerals and preserve a fixed minimum numeric region across `999`, `1,247`, and `12,500` specimens.

- [ ] **Step 3: Create table and filter components**

Build a Table header, 48 px Standard Row, 56 px Comfortable Row, sortable header cell, numeric cell, status cell, selection cell, pagination, loading body, empty body, and error body. Numeric cells align right; camera IDs and times do not wrap; Thai descriptions can wrap to two lines.

Build a wrapping Filter Bar with visible primary filters, `ตัวกรองเพิ่มเติม`, active-filter count, Apply, and conditional `ล้างทั้งหมด`.

- [ ] **Step 4: Create visualization and overlay shells**

Create Chart Shell with header, filter, legend, plot, tooltip, and freshness footer. Create Dialog, right Drawer, and Toast sets with defined elevation and focus descriptions. Create a Data State panel demonstrating Loading, Zero, No Data, Stale, Error, Restricted, and Partial Outage side by side.

- [ ] **Step 5: Verify composite resizing and commit records**

Resize specimens to 396, 533, 808, and 1083 px widths. Confirm Fill/Hug behavior, Thai wrapping, and state stability. Capture screenshots, record IDs, update QA, and commit with `docs: record FORLP Figma components`.

---

### Task 5: Build operational patterns

**Files:**
- Modify: Figma page `03 Patterns`
- Modify: `docs/design/forlp-ioc-figma-node-manifest.json`
- Modify: `docs/design/forlp-ioc-figma-qa.md`

**Interfaces:**
- Consumes: components from Task 4
- Produces: pattern IDs for CCTV Tile, Alert Item, KPI Summary Row, Zone Summary, Service Health, Hourly Chart, Zone Map Panel, and Report Summary

- [ ] **Step 1: Build CCTV Tile and camera-grid specimens**

Create 16:9 CCTV Tile variants `State=Live|Selected|Offline|Restricted|PTZ|Loading`. Include camera ID, zone, stream status, timestamp, latency, playback, PTZ, fullscreen, and incident actions. Offline preserves the last-frame region and disconnect time. Assemble a three-column × two-row six-camera specimen.

- [ ] **Step 2: Build Alert Item and alert-stream specimens**

Create `Severity=Info|Moderate|Dense|Critical`, `State=New|Acknowledging|Acknowledged|Error`. Include severity rail and shape, title, location, timestamp, source, recommendation, and acknowledge/inspect/escalate controls. Assemble a 4-column-width stream ordered Critical, Dense, Moderate, Info.

- [ ] **Step 3: Build dashboard and report patterns**

Create a four-card KPI Summary Row, three-zone summary, service-health summary, hourly count chart with threshold bands, zone map shell with three zones and six camera markers, and report-summary pattern with maximum, average, minimum, and peak time.

- [ ] **Step 4: Verify every operational state and commit records**

Capture screenshots of the Live/Offline CCTV comparison, New/Acknowledged Critical alert comparison, and Data State patterns. Confirm Dense uses the orange split diamond or rising-arrow shape and Critical uses the octagon. Record IDs and commit with `docs: record FORLP operational patterns`.

---

### Task 6: Assemble Operations Overview templates

**Files:**
- Modify: Figma page `04 Templates`
- Modify: `docs/design/forlp-ioc-figma-node-manifest.json`
- Modify: `docs/design/forlp-ioc-figma-qa.md`

**Interfaces:**
- Consumes: Sidebar, Top Bar, KPI Summary Row, Zone Map Panel, Alert Stream, Hourly Chart, and Zone Summary
- Produces: template IDs `Template/Desktop/Overview/Normal`, `Dense`, `Critical`, `Market Closed`, `Loading`, `Partial Outage`, and `All Data Stale`

- [ ] **Step 1: Build the 1920 × 1080 Normal template**

Use a fixed Main Page with horizontal Auto Layout and zero gap. Place expanded Sidebar and a Fill Application Region. Place fixed 64 px Top Bar and Fill Workspace with 24 px padding and 20 px vertical gap. Assemble:

- Four 3-column KPI cards
- 8-column map and 4-column always-visible alert stream
- 8-column hourly chart and 4-column zone summary

The primary operational content must fit without page scrolling.

- [ ] **Step 2: Create operational-state template variants**

Duplicate the Normal template into named states and swap only stateful instances. Critical adds a persistent reserved banner below the top bar without shifting the grid. Market Closed explains operating hours. Partial Outage names failed services. All Data Stale preserves last-known values and timestamps.

- [ ] **Step 3: Apply the desktop grid and semantic modes**

Attach `Grid/Desktop/12` to every template. Confirm all panels align to 3/4/8/12-column spans. Create a High Contrast specimen using the semantic variable mode rather than detached or duplicated component styling.

- [ ] **Step 4: Verify overview templates and commit records**

Capture 1920 px screenshots of Normal and Critical plus a focused screenshot of the alert rail. Confirm no overlap, clipping, accidental scroll, or color-only status. Record IDs and commit with `docs: record FORLP overview templates`.

---

### Task 7: Assemble CCTV Command templates

**Files:**
- Modify: Figma page `04 Templates`
- Modify: `docs/design/forlp-ioc-figma-node-manifest.json`
- Modify: `docs/design/forlp-ioc-figma-qa.md`

**Interfaces:**
- Consumes: application shell, CCTV Tile, Drawer, badges, filters, and camera metadata components
- Produces: template IDs `Template/Desktop/CCTV/Grid`, `Focus`, `Offline`, `Restricted`, `Playback Loading`, and `Playback Unavailable`

- [ ] **Step 1: Build the CCTV Grid template**

Assemble the header with restricted badge, `5/6 ออนไลน์`, latency, layout selector, zone filter, and fullscreen action. Place six 16:9 tiles in a three-column × two-row grid with 20 px gaps.

- [ ] **Step 2: Build Focus and Playback templates**

Focus uses an 8-column selected stream and 4-column metadata/actions panel. Playback adds a 520 px right drawer with date, start/end time, 15/30/60-minute presets, generation progress, URL, authorization, and expiration note.

- [ ] **Step 3: Build failure and restriction states**

Create one-camera-offline, multiple-failure, restricted-access, playback-loading, and playback-unavailable states. Never remove a failed tile; retain camera identity and last connection time.

- [ ] **Step 4: Verify CCTV templates and commit records**

Capture Grid, Focus, and Offline screenshots. Confirm tile aspect ratios, overlay readability, focus hierarchy, and drawer width. Record IDs and commit with `docs: record FORLP CCTV templates`.

---

### Task 8: Assemble Analytics and Reports templates

**Files:**
- Modify: Figma page `04 Templates`
- Modify: `docs/design/forlp-ioc-figma-node-manifest.json`
- Modify: `docs/design/forlp-ioc-figma-qa.md`

**Interfaces:**
- Consumes: application shell, segmented controls, Filter Bar, KPI cards, Chart Shell, insight panel, Table, and Dialog
- Produces: template IDs `Template/Desktop/Reports/Daily`, `Monthly`, `Compare`, `No Data`, `Partial Data`, `Exporting`, `Export Complete`, and `Export Failed`

- [ ] **Step 1: Build the Daily report template**

Assemble page header, report navigation, filters, official `16:00–22:00 น.` coverage notice, four summary cards, 8-column chart, 4-column insights, two 6-column secondary analyses, and a 12-column detail table.

- [ ] **Step 2: Build Monthly and Compare templates**

Monthly changes filters, chart granularity, and summary copy. Compare presents two explicit periods, stable shared axes, percentage changes, and neutral co-occurrence language for weather and attendance.

- [ ] **Step 3: Build data and export states**

Create No Operating-Day Data, Partial Data, Exporting, Export Complete, and Export Failed. Export dialog includes report name, date range, zones, sections, PDF/CSV, Thai-language confirmation, generation timestamp, and privacy note.

- [ ] **Step 4: Verify report templates and commit records**

Capture Daily, Compare, and Partial Data screenshots. Confirm sticky-header intent, numeric alignment, long Thai wrapping, and explicit operating-window copy. Record IDs and commit with `docs: record FORLP report templates`.

---

### Task 9: Connect prototype flows and accessibility variants

**Files:**
- Modify: Figma pages `01 Primitives`, `02 Components`, and `04 Templates`
- Modify: `docs/design/forlp-ioc-figma-node-manifest.json`
- Modify: `docs/design/forlp-ioc-figma-qa.md`

**Interfaces:**
- Consumes: all component and template IDs from Tasks 3–8
- Produces: eight named flows, interactive component reactions, High Contrast coverage, and Reduced Motion variants

- [ ] **Step 1: Add interactive-component reactions**

Connect Default → Hover at 100 ms, Hover → Active at 100 ms, menu and selection changes at 200 ms, and sidebar collapse at 220 ms. Preserve focus-state variants and avoid animations that change layout dimensions unexpectedly.

- [ ] **Step 2: Connect the eight named prototype flows**

Create:

```text
Flow/Overview/Normal-to-Critical
Flow/Overview/Alert-to-Zone
Flow/CCTV/Grid-to-Focus
Flow/CCTV/Playback
Flow/Reports/Filter-and-Compare
Flow/System/Partial-Outage
Flow/Accessibility/High-Contrast
Flow/Accessibility/Reduced-Motion
```

Use Smart Animate only for shared elements. Use 200 ms for base changes and 300 ms for CCTV focus and playback drawer transitions.

- [ ] **Step 3: Create Reduced Motion counterparts**

Duplicate only prototype entry frames required to demonstrate Reduced Motion. Use instant transitions and static status emphasis while keeping the same component instances and semantic styling.

- [ ] **Step 4: Verify prototype navigation and commit records**

Walk every flow from its starting point, verify back/close behavior, and confirm focus returns to the initiating control after drawers and dialogs. Record flow start IDs and commit with `docs: record FORLP Figma prototype flows`.

---

### Task 10: Run final visual QA and hand off the Figma library

**Files:**
- Modify: `docs/design/forlp-ioc-figma-node-manifest.json`
- Modify: `docs/design/forlp-ioc-figma-qa.md`

**Interfaces:**
- Consumes: complete Figma library, templates, modes, and prototype flows
- Produces: signed-off QA record and final node manifest with no empty ID groups

- [ ] **Step 1: Run structural metadata checks**

Confirm:

- Exactly five high-fidelity pages exist.
- Required component sets and template names exist exactly once.
- All expected manifest IDs resolve.
- No unfinished placeholder shimmer remains.
- No top-level high-fidelity node is positioned at an accidental `(0,0)` overlap.
- Existing wireframes remain unchanged.

- [ ] **Step 2: Run visual checks at full and focused scale**

Capture full screenshots of Overview Normal/Critical, CCTV Grid/Focus, and Reports Daily/Compare. Capture focused screenshots of Thai typography, shape-coded statuses, stale-vs-zero-vs-no-data, offline CCTV, and High Contrast mode.

- [ ] **Step 3: Complete the QA checklist**

Every checklist item must include evidence: node ID, screenshot reference, or prototype-flow name. Any failure is corrected in Figma and rechecked before the item is marked complete.

- [ ] **Step 4: Validate the local artifacts**

Run:

```bash
node -e "const fs=require('fs'); const p='docs/design/forlp-ioc-figma-node-manifest.json'; const x=JSON.parse(fs.readFileSync(p,'utf8')); for (const k of ['pages','variables','styles','components','patterns','templates','prototypeFlows']) if (!x[k] || Object.keys(x[k]).length === 0) throw new Error('Missing '+k); console.log('manifest ok')"
git diff --check -- docs/design/forlp-ioc-figma-node-manifest.json docs/design/forlp-ioc-figma-qa.md
```

Expected: `manifest ok`; `git diff --check` returns no output.

- [ ] **Step 5: Commit the final handoff record**

```bash
git add docs/design/forlp-ioc-figma-node-manifest.json docs/design/forlp-ioc-figma-qa.md
git commit -m "docs: complete FORLP Figma design handoff"
```

Expected: final commit contains only the completed node manifest and QA record. Do not push, publish a library, or modify Code Connect mappings without separate explicit approval.
