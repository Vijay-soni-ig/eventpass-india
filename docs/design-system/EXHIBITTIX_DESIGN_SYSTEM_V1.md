# ExhibitTix Design System v1.0

## Status
**Canonical brand direction:** Deep Navy + Electric Blue + Cyan.

This version is derived from the supplied Exhibitix logo and replaces the previous teal-first visual foundation.

## Brand tokens

| Token | HEX | HSL | Primary usage |
|---|---|---|---|
| Brand Navy | #09254B | 215 79% 16% | Brand identity, headings, navigation |
| Brand Navy Deep | #071E40 | 216 80% 14% | Dark surfaces, strong brand sections |
| Brand Blue | #0374F8 | 212 98% 49% | Primary actions, links, focus |
| Brand Cyan | #0FB1EC | 196 88% 49% | Accent, highlights, gradients |
| Black | #040404 | 0 0% 1.6% | Primary text / maximum contrast |
| Neutral 700 | #4B5563 | 215 14% 34% | Secondary text |
| Neutral 500 | #92989E | 215 5% 61% | Decorative/disabled text only |
| Border | #E5E7E9 | 210 8% 91% | Borders and dividers |
| Surface | #F9FAFB | 210 20% 98% | App background |
| White | #FFFFFF | 0 0% 100% | Cards and primary surfaces |

## Semantic rules

### Primary
Use Brand Blue for primary CTAs and interactive actions: Create Event, Save, Continue, Publish, Buy Ticket, Book Stall, Submit.

### Brand / navigation
Use Brand Navy for logo treatment, sidebar/navigation surfaces, major headings, and high-importance brand sections.

### Accent
Use Brand Cyan sparingly for highlights, selected states, marketing accents, data visualization accents, and brand gradients.

### Semantic status colors
Brand colors must not replace semantic status colors.
- Success: green
- Warning/Pending: amber
- Error/Failed/Cancelled: red
- Information: blue
- Draft/Neutral: gray
- Refunded: neutral/purple where needed

## Accessibility

Validated pairings:

| Foreground | Background | Contrast | Result |
|---|---|---:|---|
| #0374F8 | #FFFFFF | 4.32:1 | AA for normal text; prefer larger/bold text or darker blue where possible |
| #09254B | #FFFFFF | 15.24:1 | AAA |
| #0FB1EC | #040404 | 8.32:1 | AAA |
| #4B5563 | #FFFFFF | 7.56:1 | AAA |
| #040404 | #FFFFFF | 20.50:1 | AAA |
| #92989E | #FFFFFF | 2.91:1 | Do not use for normal text |

#92989E is retained as a brand-derived neutral for decorative, disabled, or non-text uses. Use #4B5563 or darker for readable secondary text.

## Gradients

Preferred brand gradient: linear-gradient(135deg, #09254B 0%, #0374F8 58%, #0FB1EC 100%).

Use gradients primarily for marketing hero sections, featured event surfaces, brand moments, and selected promotional components. Do not apply gradients to every dashboard card or button.

## Typography
- Display/headings: Manrope
- Body/UI: Inter

Keep the existing typography foundation unless a separate typography audit identifies a production issue.

## Component rules
Shared components must consume semantic tokens instead of hard-coded brand colors.

Examples: Button primary -> bg-primary; Focus ring -> ring; Link -> text-primary; Sidebar -> sidebar-*; Status -> semantic status token; Card -> bg-card and border-border.

## Migration rule
Existing teal tokens and classes should be removed or aliased only after affected screens are migrated.

Do not perform a blind global string replacement. Review gradients, charts, illustrations, floor-plan states, status indicators, and data visualization separately.

## Scope
This v1.0 system applies across Super Admin, Organizer, Exhibitor, Visitor, public event discovery, event details, ticketing, exhibition/floor plan, check-in, leads, analytics, and marketing pages.

## Acceptance criteria
1. No new feature introduces a separate brand primary.
2. Shared UI components use semantic tokens.
3. Teal is no longer the default brand primary.
4. Status colors remain semantically distinct from brand colors.
5. Normal text meets WCAG AA contrast requirements.
6. Dark mode has equivalent semantic roles.
7. Public and dashboard experiences use the same core tokens while allowing different visual density.