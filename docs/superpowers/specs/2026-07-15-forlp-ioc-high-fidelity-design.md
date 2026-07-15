# FORLP Smart Area IOC High-Fidelity Design Specification

**Status:** Approved blueprint

**Date:** 2026-07-15

**Primary viewport:** 1920 × 1080

**Primary users:** Municipal security and operations personnel

**Primary language:** Thai, with English retained for technical identifiers

## 1. Product Direction

FORLP Smart Area IOC is an officer-first operations dashboard for Kad Kong Ta. It supports real-time crowd-density monitoring, six-camera CCTV operations, weather and PM2.5 monitoring, incident response, and official historical reporting.

The visual direction is **Operations Dark**: an authoritative, low-glare command interface with high information density, explicit system health, and restrained use of semantic color. The interface must prioritize rapid comprehension over decoration and should enable an operator to understand overall conditions and urgent actions within five seconds.

### Design principles

1. **Operational clarity:** Present the current state, its severity, its freshness, and the recommended action together.
2. **Thai-first readability:** Thai text must wrap safely and retain sufficient vertical clearance for vowels and tone marks.
3. **Redundant status encoding:** Never communicate status through color alone. Pair color with a shape, icon, and label.
4. **Stable live data:** Use tabular numerals and stable component dimensions so live refreshes do not shift the layout.
5. **Honest system states:** Distinguish zero, no data, stale data, loading, and error states.
6. **Functional motion:** Animation communicates location, causality, or state change; it is not decorative.
7. **Role-aware access:** Restricted CCTV and administrative actions clearly communicate authorization state.

## 2. Figma Library Architecture

The Figma file uses five pages:

1. `00 Foundations` — variables, text styles, grids, and icons
2. `01 Primitives` — buttons, inputs, badges, and tooltips
3. `02 Components` — cards, tables, filters, and navigation
4. `03 Patterns` — KPI clusters, CCTV tiles, alerts, and chart panels
5. `04 Templates` — assembled desktop screens and prototype states

Component sets use these properties where relevant:

- `State`: Default, Hover, Focus, Active, Disabled
- `Size`: Compact, Default, Large
- `Icon`: Boolean
- `Label`: Text property
- `Status`: Neutral, Info, Normal, Moderate, Dense, Critical
- `Loading`: Boolean
- `Role`: Public, Officer, Administrator

Theme differences are controlled through semantic variables, not duplicated component variants.

## 3. Design System

### 3.1 Typography

Primary font: `IBM Plex Sans Thai`

Fallbacks: `Noto Sans Thai`, `Inter`, system sans-serif

Numeric behavior: tabular numerals for counts, timestamps, percentages, environmental readings, tables, and chart axes

| Token | Size / line height | Weight | Usage |
|---|---:|---:|---|
| Display | 40 / 48 px | 600 | Dominant live KPI |
| Heading 1 | 28 / 36 px | 600 | Page title |
| Heading 2 | 22 / 30 px | 600 | Major region title |
| Heading 3 | 18 / 26 px | 600 | Panel title |
| Body Large | 16 / 24 px | 400 | Important description |
| Body | 14 / 22 px | 400 | Standard interface content |
| Body Medium | 14 / 22 px | 500 | Labels and emphasized content |
| Label | 13 / 18 px | 500 | Controls and table headers |
| Caption | 12 / 18 px | 400 | Timestamps and metadata |
| Micro | 11 / 16 px | 500 | Camera IDs and compact technical data |

Thai text styles and their Auto Layout containers must leave at least 2 px of vertical safety beyond the line-height bounding box. Controls should provide at least 4 px of effective content clearance above and below the line box. Thai text nodes hug vertically and are never vertically stretched.

### 3.2 Color primitives

#### Brand

| Token | Value |
|---|---|
| `brand/50` | `#EAF3FF` |
| `brand/300` | `#71B7FF` |
| `brand/400` | `#3B9CFF` |
| `brand/500` | `#1684F8` |
| `brand/600` | `#0869D1` |
| `brand/700` | `#0753A5` |

#### Operations Dark surfaces

| Token | Value |
|---|---|
| `surface/canvas` | `#07111F` |
| `surface/sidebar` | `#091827` |
| `surface/base` | `#0D1D2D` |
| `surface/raised` | `#12263A` |
| `surface/elevated` | `#183149` |
| `surface/selected` | `#123B61` |
| `surface/scrim` | `rgba(2, 8, 18, .72)` |

#### Text and borders

| Token | Value |
|---|---|
| `text/primary` | `#F3F7FC` |
| `text/secondary` | `#B7C5D5` |
| `text/tertiary` | `#8294A8` |
| `text/disabled` | `#58697B` |
| `text/inverse` | `#07111F` |
| `border/subtle` | `#1D344A` |
| `border/default` | `#29445D` |
| `border/strong` | `#42617D` |

#### Operational statuses

| Status | Foreground | Background | Required shape |
|---|---|---|---|
| Normal | `#32D583` | `#0D3328` | Filled circle with check |
| Moderate | `#FDB022` | `#3A2B0D` | Upright triangle |
| Dense | `#FF7A45` | `#3D2117` | Split diamond or rising diagonal arrow |
| Critical | `#F97066` | `#411C24` | Octagon with exclamation |
| Information | `#53B1FD` | `#102F49` | Circle with “i” |
| Unknown | `#98A2B3` | `#26313C` | Hollow circle with dash |

Status colors are reserved for operational meaning. Blue is the general interaction color.

### 3.3 Variable collections and modes

Collections:

- `Primitives`: raw color, spacing, radius, and typography values
- `Semantic`: surface, text, border, interaction, and status aliases
- `Component`: component-specific aliases for controls, navigation, cards, tables, and charts

Modes:

- `Operations Dark`: default mode
- `High Contrast Dark`: accessibility mode

Required High Contrast overrides:

| Semantic token | Operations Dark | High Contrast Dark |
|---|---|---|
| `surface/canvas` | `#07111F` | `#020812` |
| `border/subtle` | `#1D344A` | `#29445D` |
| `text/secondary` | `#B7C5D5` | `#F3F7FC` |

### 3.4 Spacing, radius, and elevation

Spacing uses a 4 px base scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, and 64 px.

- Workspace and card-row gap: 20 px
- Standard component-internal gap: 16 px
- Dense component-internal gap: 8–12 px
- Main content padding: 24 px

Radius tokens:

- `radius/xs`: 4 px
- `radius/sm`: 6 px
- `radius/md`: 10 px
- `radius/lg`: 14 px
- `radius/full`: 999 px

Elevation:

- Level 0: no shadow, subtle border
- Level 1: `0 4px 12px rgba(0,0,0,.20)`
- Level 2: `0 12px 32px rgba(0,0,0,.32)`
- Level 3: `0 24px 64px rgba(0,0,0,.45)`
- Focused panel highlight: `inset 0 0 0 1px rgba(83,177,253,.35)`

## 4. Layout and Grid

### 4.1 Application shell

| Element | Horizontal resizing | Vertical resizing | Gap |
|---|---|---|---:|
| Main Page | Fixed, 1920 px | Fixed, 1080 px | 0 |
| Workspace | Fill container | Fill container | 20 px |
| Card Rows | Fill container | Hug contents | 20 px |
| Table Rows | Fill container | Fixed, 48 or 56 px | 0 |
| Sidebar | Fixed, 240 or 72 px | Fill container | 0 |

Structure:

- `Main Page`: horizontal Auto Layout containing Sidebar and Application Region
- `Application Region`: vertical, Fill × Fill, containing Top Bar and Workspace
- `Top Bar`: Fill × Fixed 64 px
- `Workspace`: vertical, Fill × Fill, 24 px padding
- `Card Rows`: horizontal, Fill × Hug, 20 px gap
- `Table`: vertical, Fill × Hug; the body may scroll inside a fixed-height panel

### 4.2 Twelve-column grid

Primary frame: 1920 × 1080 px

Expanded sidebar: 240 px

Available application width: 1680 px

Main content width after 24 px side padding: 1632 px

Columns: 12

Column gutter: 16 px

Approximate column width: 121.3 px

Panel spans:

- 2 columns: compact KPI or utility
- 3 columns: standard KPI or environmental panel
- 4 columns: alerts or summary panel
- 6 columns: medium chart or camera group
- 8 columns: primary map, stream, or analysis
- 12 columns: report table or full-width workspace

At 1440–1919 px, secondary content may wrap below the primary region. At 1280–1439 px, the sidebar defaults to collapsed and the content uses an 8-column layout. Below 1280 px, use a dedicated tablet template rather than compressing the IOC desktop template further.

## 5. Core Component Library

### 5.1 Buttons

Default button: 40 px high, 16 px horizontal padding, 8 px gap, 10 px radius, 18 px icon, 14/22 semibold label, 88 px minimum width. High-priority actions use 48 px height.

Variants: Primary, Secondary, Tertiary, Destructive, Icon-only, and Split Action.

States:

- Default: `brand/500`
- Hover: `brand/400` with Level 1 elevation
- Focus: `brand/500` with a 2 px blue ring
- Active: `brand/600`, shadow removed, 1 px downward translation
- Disabled: elevated surface, subtle border, disabled text
- Loading: stable label width with spinner replacing the leading icon

Icon-only buttons are 40 × 40 px and require a tooltip.

### 5.2 Inputs and selects

Input shell: 44 px high, 12 px horizontal padding, 8 px internal gap, 6 px radius. Multiline inputs have a 96 px minimum height. Field stacks use vertical Auto Layout with a 6 px gap.

States: Default, Hover, Focus, Filled, Error, Success, Disabled, and Read-only. Error states include an icon and Thai-language message. Validation should occur on blur or submission rather than on every Thai character input.

Dropdowns use a 360 px maximum height, 6 px menu padding, and a 40 px minimum item height. Thai labels may wrap to two lines, increasing an item to 56 px. Search appears when a menu contains more than seven choices.

Types include text, search, officer code, number with suffix, date range, time range, threshold, camera selector, and zone selector.

### 5.3 Status badges

Badges combine the required shape, semantic color, label, and optional count.

- Compact: 24 px high with a 12/16 label
- Default: 28 px high with a 13/18 label
- Horizontal padding: 8–10 px
- Internal gap: 6 px
- Icon: 12–14 px

### 5.4 Cards and panels

Base cards use a base or raised surface, 1 px subtle border, 10 px radius, 20 px padding, and 16 px internal gap. They use vertical Auto Layout with Fill width and Hug height unless the template equalizes a row.

Anatomy: header, content, optional visualization, metadata/footer, and optional contextual action.

Variants: KPI, chart, camera, weather, alert, report summary, empty, loading, error, and stale data.

KPI values use 32/40 or 40/48 semibold type, tabular numerals, and a stable minimum width. A live refresh updates the value and timestamp without replaying the full card animation.

Data behavior:

- Loading preserves component dimensions with skeletons.
- Stale shows the last known value, timestamp, warning icon, and `ข้อมูลอาจล่าช้า`.
- Error retains the card identity and presents a scoped retry.
- No data uses `—`; zero remains `0`.

### 5.5 Navigation

Sidebar widths: 240 px expanded and 72 px collapsed. Items are 44 px high with 12 px padding, 20 px icons, 12 px gaps, and 8 px radius. Active items use a selected surface, blue leading indicator, and primary text. Collapsed items require tooltips.

The 64 px top status bar contains the page title, market state, data freshness, labeled service-health indicators, notifications, and current officer. At constrained widths, service health collapses into a summary such as `ระบบ 3/4 ปกติ` with a details popover.

### 5.6 Tables and filters

Tables use a 40 px minimum header, 48 px standard rows, or 56 px comfortable rows. Numeric values align right and use tabular numerals. Dates, times, and camera IDs do not wrap; Thai descriptions may wrap to two lines.

Tables support sticky headers, optional sticky first columns, sorting, selection, pagination, column visibility, loading, empty, error, and filtered states. Critical rows use a leading severity marker instead of a full red background.

Filter bars use horizontal Auto Layout with wrapping. Primary filters remain visible; secondary controls move into `ตัวกรองเพิ่มเติม`. Expensive filters require an Apply action.

### 5.7 Operational patterns

#### CCTV tile

- 16:9 aspect ratio
- 320 px minimum desktop width
- Camera ID, zone, live status, timestamp, and latency overlay
- Playback, fullscreen, PTZ, and incident actions on hover
- Offline state retains camera identity and last connection time
- Restricted streams display a security label

#### Alert item

Contains severity rail and shape, title, zone or camera, time, source, recommended action, and acknowledge/inspect/escalate controls. Acknowledged alerts retain operator identity and timestamp.

#### Chart shell

Contains title, explanation, filter, legend, plot, tooltip, and freshness footer. Blue is the primary series; cyan or violet is used for comparisons; semantic colors are reserved for thresholds. Use no more than four simultaneous series and provide a table or textual summary path.

## 6. Core Screen Templates

### 6.1 Operations Overview

Purpose: communicate current people count, density risk, and required action within five seconds.

1. **Top status bar:** page title, market state, synchronized timestamp, system health, notifications, and officer.
2. **Live summary row:** four 3-column cards for current count, overall density, weather/rain, and PM2.5.
3. **Primary region:** 8-column zone map or venue plan with camera markers and incidents.
4. **Alert rail:** 4-column active alert stream that stays visible without page scrolling.
5. **Supporting intelligence:** 8-column hourly chart and 4-column zone distribution.

Required template states: Normal, Dense, Critical, Market Closed, Loading, Partial Outage, and All Data Stale. A critical banner must not shift the grid; reserve its region or overlay it below the top bar.

### 6.2 CCTV Command

Purpose: monitor six streams, identify outages, focus on an incident, and request playback without losing context.

- Default grid: three columns × two rows, each tile spanning four grid columns.
- Header: restricted-access badge, online count, latency, layout selector, zone filter, and fullscreen mode.
- Focus mode: selected stream spans eight columns; metadata and actions span four.
- Playback uses a 480–560 px right drawer containing date, time range, presets, generation status, URL, authorization, and expiration details.

Required states: All Online, One Offline, Multiple Failures, Restricted Access, Playback Loading, Playback Unavailable, PTZ Active, and Fullscreen.

### 6.3 Analytics and Reports

Purpose: analyze trends, compare periods, review data completeness, and export official reports.

- Header: title, data coverage, update time, export action, and saved presets.
- Modes: Daily, Weekly, Monthly, Compare Periods, and Incident History.
- Filter bar: period, date range, zone, camera, density, Apply, Clear, and additional filters.
- Summary: four 3-column cards for maximum, average, minimum, and peak time.
- Analysis: 8-column primary chart plus 4-column insight panel.
- Secondary analysis: two 6-column panels for zone comparison and weather/crowd co-occurrence.
- Detail table: full 12-column width with sorting, selection, pagination, and export.

Official market reporting explicitly communicates the applicable `16:00–22:00 น.` operating window and weekend constraints. Weather analysis describes co-occurrence and must not imply causation.

Required states: Daily, Monthly, Compare, No Operating-Day Data, Partial Data, Exporting, Export Complete, and Export Failed.

## 7. Motion and Prototyping

### 7.1 Motion tokens

| Token | Duration | Usage |
|---|---:|---|
| `motion/fast` | 100–120 ms | Hover, press, focus |
| `motion/base` | 180–220 ms | Menus, selection, reordering |
| `motion/slow` | 280–320 ms | Drawers and major layout transitions |

Enter uses ease-out, exit uses ease-in, and repositioning uses ease-in-out. Reduced Motion mode removes layout animation and presents state changes immediately.

### 7.2 Live data

- Live counts crossfade over 160–200 ms.
- Digits do not animate independently.
- The entire card does not flash during polling.
- Status changes update shape, label, and color together.
- Dense introduces brief orange edge emphasis; Critical adds a persistent severity rail and alert.
- Returning to a safer state uses calm, non-emergency motion.

### 7.3 Navigation and overlays

- Sidebar collapse: 240 → 72 px over 220 ms; labels fade before contraction completes.
- Menus: opacity plus 4–6 px movement over 160–180 ms.
- Dialogs: scrim fade and 98% → 100% scale over 180–220 ms.
- Playback drawer: enters from the right over 280 ms and returns focus to its trigger on close.
- Toasts are used for transient feedback; critical incidents remain in the alert stream.

### 7.4 CCTV, maps, charts, and tables

- CCTV Grid → Focus uses shared camera identity and a 280–320 ms Smart Animate transition.
- Offline transition freezes the last valid frame and overlays the disconnect state and time.
- Alert selection centers the related map zone or camera and briefly identifies it with a ring.
- Chart axes appear immediately; series fade over 220–280 ms on initial load only.
- Live chart refreshes do not replay entry animations.
- Table sorting animates only for short local datasets; large result sets update without per-row motion.

### 7.5 Prototype flows

Create these named flows:

1. `Flow/Overview/Normal-to-Critical`
2. `Flow/Overview/Alert-to-Zone`
3. `Flow/CCTV/Grid-to-Focus`
4. `Flow/CCTV/Playback`
5. `Flow/Reports/Filter-and-Compare`
6. `Flow/System/Partial-Outage`
7. `Flow/Accessibility/High-Contrast`
8. `Flow/Accessibility/Reduced-Motion`

Interactive components cover buttons, navigation items, tabs, inputs, selects, badges, camera controls, alert acknowledgement, and sidebar collapse. Frame-level connections cover page navigation, camera focus, report modes, critical incidents, and service outages.

## 8. Figma Naming and Delivery Criteria

Template names:

- `Template/Desktop/Overview/Normal`
- `Template/Desktop/Overview/Critical`
- `Template/Desktop/CCTV/Grid`
- `Template/Desktop/CCTV/Focus`
- `Template/Desktop/Reports/Daily`
- `Template/Desktop/Reports/Compare`

Template regions:

- `Shell/Sidebar`
- `Shell/Topbar`
- `Region/Summary`
- `Region/Primary`
- `Region/Alerts`
- `Region/Supporting`
- `Region/Table`

The blueprint is complete when:

- Foundation variables support both theme modes without duplicating components.
- Every essential component includes its defined operational and interaction states.
- Thai text does not clip at any defined control or row height.
- Statuses remain distinguishable without color.
- Live updates do not cause layout movement.
- Zero, no data, stale data, loading, and error remain visually distinct.
- All three primary screen templates and eight prototype flows are present.
- The 1920 × 1080 templates preserve primary operational content without accidental overflow.
- Restricted CCTV actions and system failures have explicit states.
- Reduced Motion and High Contrast prototype variants are available.
