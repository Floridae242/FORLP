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

- [ ] Patterns are complete and verified.

## Templates

- [ ] Templates are complete and verified.

## Accessibility

- [ ] Accessibility requirements are verified.

## Prototype

- [ ] Prototype flows are complete and verified.

## Thai Typography

- [x] Thai typography is complete and verified: IBM Plex Sans Thai Regular, Medium, and SemiBold; all ten type styles; 2 px specimen safety; focused samples include `ที่`, `น้ำ`, and `ผู้`.

## Handoff

- [ ] Handoff artifacts are complete and verified.
