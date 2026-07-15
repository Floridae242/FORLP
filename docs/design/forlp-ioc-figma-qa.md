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

- [ ] Components are complete and verified.

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
