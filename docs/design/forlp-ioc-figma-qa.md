# FORLP IOC Figma QA Checklist

## Foundations

- [x] Foundations are complete and verified: three collections, two Semantic modes, 79 variables with explicit scopes, 42 local styles, and the 1440 px specimen (`95:93`).

## Primitives

- [x] Primitives are complete and verified: Button (`103:194`, 48 variants), Icon Button (`103:213`, 6 variants), Input (`104:338`, 56 variants), Select (`106:2`, 12 variants), Status Badge (`107:56`, 12 variants), Tooltip (`108:18`, 4 variants), Tab (`108:31`, 4 variants), and Segmented Control (`109:14`, 4 variants).
- [x] Button uses Hug width with an 88 px minimum, fixed 40/48 px heights, 16 px horizontal padding, 8 px gap, 10 px radius, 18 px icon/loading slots, and stable dimensions across all states.
- [x] Input and Select shells are fixed at 44 px with 12 px horizontal padding, 8 px gap, 6 px radius, and stable dimensions across every state; the Select menu specimen (`106:3`) uses 6 px padding, 40/56 px items, and a 360 px maximum visible height.
- [x] Status Badge foregrounds and backgrounds are bound to Semantic status variables and retain circle, triangle, split-diamond, octagon, circle-i, and hollow-circle-dash shapes.
- [x] Full-page and focused Button, Input, Select, and Status Badge screenshots were reviewed with no overlap or clipped Thai text; focused metadata resolved all eight component-set IDs.
- [x] State stability is verified for all eight families; all 203 Thai text nodes use available IBM Plex Sans Thai fonts with non-zero, line-height-safe bounds.

## Components

- [x] Components are complete and verified on `02 Components` (`88:4`): Sidebar (`117:53`), Top Bar (`117:78`), Base Card (`119:44`), KPI Card (`119:88`), Table (`120:56`), Filter Bar (`120:102`), Chart Shell (`121:124`), Dialog (`121:156`), Drawer (`121:178`), Toast (`121:192`), Empty State (`125:83`), and Data State (`125:108`).
- [x] Composite construction consumes the recorded primitive masters, including Button (`103:194`), Icon Button (`103:213`), Input (`104:338`), Select (`106:2`), Status Badge (`107:56`), Tooltip (`108:18`), Tab (`108:31`, default resolves to `108:19`), and Segmented Control (`109:14`).
- [x] Navigation is stable: Sidebar variants are fixed at 240/72 px by 720 px with a bottom-pinned officer profile; Top Bar variants are fixed at 64 px high and include title, market state, freshness, service health, notification, and profile content.
- [x] Base Card covers Default, Loading, Zero, No Data, Stale, Error, and Disabled; KPI specimens preserve a 240 px numeric region and verified values `999`, `1,247`, and `12,500` in IBM Plex Mono.
- [x] Table parts cover both row densities, sortable/numeric/status/selection cells, pagination, and loading/empty/error bodies. Camera IDs and times remain single-line, numeric cells align right, and Thai description nodes `120:21` and `120:27` use 220 px fixed width with height-responsive wrapping.
- [x] Filter Bar preserves visible primary controls and wraps additional filters at narrow widths; active variants include count and conditional clear controls. Chart, Dialog, Drawer, Toast, Empty State, and all seven Data State variants remain visually distinct.
- [x] Responsive specimen `127:70` was verified at exact widths 396, 533, 808, and 1083 px. Top Bar, Base Card, and Filter Bar instances report horizontal Fill; labels report Hug; no measured Fill/Hug failures were found.
- [x] Focused screenshots for responsive composites, Table, Filter Bar, Chart Shell, Dialog, Drawer, Toast, Empty State, and Data State were reviewed with no overlap or clipped Thai text. All 207 Thai text nodes report available fonts.

## Patterns

- [x] Patterns are complete and verified on `03 Patterns` (`88:5`): CCTV Tile (`143:122`), Alert Item (`145:710`), KPI Summary Row (`148:555`), Zone Summary (`148:614`), Service Health (`148:647`), Hourly Chart (`150:633`), Zone Map Panel (`150:683`), and Report Summary (`153:633`).
- [x] CCTV Tile covers Live, Selected, Offline, Restricted, PTZ, and Loading at an exact `480 × 270` (`16:9`) per variant. Every state includes camera ID, zone, stream status, timestamp, latency, playback, PTZ, fullscreen, and incident actions; Offline retains the last-frame region and disconnect time. The six-camera specimen (`143:172`) is arranged `3 × 2`.
- [x] Alert Item contains the full 16-variant matrix for Info, Moderate, Dense, and Critical across New, Acknowledging, Acknowledged, and Error. Every variant includes a severity rail and shape, title, location, timestamp, source, recommendation, and acknowledge/inspect/escalate controls. The ordered stream (`145:787`) resolves Critical → Dense → Moderate → Info.
- [x] Dense is implemented as an orange four-point diamond plus a separate split bar in all four workflow states (`145:432`/`145:433` sample); Critical is implemented as an eight-point octagon in all four states (`145:576` sample). These are geometric nodes, not labels alone.
- [x] Dashboard/report patterns include four approved KPI Card instances, three zone summaries, four service-health items, an hourly count chart with Normal/Moderate/Dense/Critical threshold bands, a three-zone map with six camera markers, and maximum/average/minimum/peak-time report metrics.
- [x] Required focused screenshots were reviewed: Live/Offline CCTV comparison (`143:126`), New/Acknowledged Critical alert comparison (`145:714`), and all seven approved Data State patterns (`153:658`). No overlap or clipped Thai text was observed.
- [x] Exact audit confirmed all eight recorded pattern nodes, all six CCTV fields/action groups in every state, 16 alert variants, four Dense split diamonds, four Critical octagons, four threshold bands, three zones, six camera markers, report values `1,247`, `782`, `415`, and `11:30–13:00`, and seven Data State instances sourced from approved master `125:108`. All 384 Task 5 text nodes use available fonts.

## Templates

- [x] Operations Overview templates are complete and verified on `04 Templates` (`88:6`): Normal (`164:2`), Dense (`167:262`), Critical (`167:515`), Market Closed (`167:768`), Loading (`167:1021`), Partial Outage (`167:1274`), and All Data Stale (`167:1527`).
- [x] Every template is fixed at `1920 × 1080` with expanded Sidebar, `1680 × 64` Top Bar, `24 px` workspace padding, `20 px` gaps, and `Grid/Desktop/12`; exact span widths are `393` (3 columns), `531` (4 columns), `1081` (8 columns), and `1632` (12 columns).
- [x] The primary content height is exactly `968 px` inside the padded `1016 px` workspace. Metadata found no descendants outside any template root, no overlap, no accidental primary scroll, no visible clipping, and no remaining build placeholders.
- [x] Operational states remain instance-driven. Dense swaps Alert Item to `145:430`; Critical swaps to `145:574`; Loading swaps map and chart to Data State Loading `125:84`; Partial Outage swaps the map to `125:103` and alert to `145:294`; All Data Stale preserves the last-known KPI/map/chart/zone values and timestamp `10:42:18`.
- [x] The reserved `1632 × 44` banner occupies the same slot in every template, so Critical does not shift the grid. Critical, Market Closed, Partial Outage, and All Data Stale add shape plus text cues; Partial Outage names `CCTV Analytics` and `Occupancy API`, and Market Closed states operating hours `06:00–22:00`.
- [x] High Contrast specimen `167:1780` applies Semantic mode `High Contrast Dark` (`93:3`) to the template root; all operational templates use `Operations Dark` (`93:1`). No component styling was detached or duplicated for the mode change.
- [x] Final screenshots were reviewed at `1920 × 1080` for Normal (`164:2`) and Critical (`167:515`), with a focused Critical alert-rail screenshot (`167:530`). A separate High Contrast render was reviewed. Text audit found no missing fonts or zero-size text nodes, and status meaning is never color-only.

## Accessibility

- [ ] Accessibility requirements are verified.

## Prototype

- [ ] Prototype flows are complete and verified.

## Thai Typography

- [x] Thai typography is complete and verified: IBM Plex Sans Thai Regular, Medium, and SemiBold; all ten type styles; 2 px specimen safety; focused samples include `ที่`, `น้ำ`, and `ผู้`.

## Handoff

- [ ] Handoff artifacts are complete and verified.
