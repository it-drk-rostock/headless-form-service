# UI Design: Dashboard

> How the dashboard looks and feels. Every dashboard ticket follows this. Vocabulary follows [`GLOSSARY.md`](../GLOSSARY.md); UI text is German and goes through i18n keys (blueprint §1.2).

## 1. Direction

Clean, minimalist, calm. The visual reference is **Monospace** (and **Directus**, which it is closely modelled on): a white, mostly grey interface with lots of whitespace, thin borders, small type, and one brand colour used sparingly. Our brand colour is **DRK red** instead of Monospace's blue.

Rules of thumb:

- Grey and white carry the interface; red marks only what matters (the primary action, the current location, focus).
- One filled primary button per view, at most.
- Borders over shadows. Shadows only for overlays (drawers, menus, modals).
- Compact density: this is a tool people work in daily, not a marketing page.
- Light theme only for v1.

## 2. Colour

### 2.1 Primary: DRK red

| Token | Value | Use |
| :--- | :--- | :--- |
| DRK red | `#E60005` (RGB 230 0 5, CMYK 0 100 100 0) | Primary colour, Mantine shade 6 |

`#E60005` is the DRK corporate red. Check it once against DRK Rostock's brand manual; if the manual says otherwise, the manual wins and only the palette below changes.

Contrast: white on `#E60005` is about 4.8:1, and `#E60005` on white is the same, so both pass WCAG AA for normal text.

Mantine palette `drkRed` (10 shades; `primaryShade: 6`, so filled hover uses shade 7):

```ts
const drkRed = [
  "#FFE9EA", // 0  light backgrounds (active nav item, selected row)
  "#FFD1D2", // 1
  "#FBA1A3", // 2
  "#F76E71", // 3
  "#F34347", // 4
  "#F0262B", // 5
  "#E60005", // 6  primary: filled buttons, active icon, focus ring, links
  "#CC0004", // 7  hover on filled
  "#B30004", // 8
  "#990003", // 9
];
```

### 2.2 Neutrals

Mantine's default `gray` and `dark` scales, used as follows:

| Role | Mantine | Approx. |
| :--- | :--- | :--- |
| App background behind panels | `gray.0` | `#F8F9FA` |
| Panels, content, cards | white | `#FFFFFF` |
| Borders and row dividers | `gray.3` | `#DEE2E6` |
| Hover background (nav items, rows) | `gray.1` | `#F1F3F5` |
| Body text | `dark.7` | `#1A1B1E` |
| Secondary text, labels, descriptions | `gray.6` | `#868E96` |
| Section labels (uppercase) | `gray.6`, 11px, 600, letter-spacing | |

### 2.3 Red is the brand, so status colours must not rely on red

Monospace uses its primary colour for "Active" badges. We must not: in our UI red already means "brand" and, by convention, "error/danger". So:

| Meaning | Colour | Example |
| :--- | :--- | :--- |
| Positive / live | `green` | Form status *Veröffentlicht*, delivery OK |
| Neutral / inactive | `gray` | *Entwurf*, *Archiviert*, *Widerrufen* |
| Attention | `orange` | *Geschlossen*, pass expiring, unpublished changes |
| Error / destructive | `red` (same red) **plus** an icon and explicit text | Delivery failed, delete |
| Info callouts | `gray` border + info icon | Explanatory boxes |

Destructive actions are never a filled red button sitting next to the filled primary button. Use a `subtle`/`outline` red button and confirm in a modal; the confirm button in that modal may be filled red.

## 3. Typography, icons, shape

- **Font**: Inter (via `next/font`), fallback system sans. Monospace font for identifiers (form ID, slugs, keys), e.g. the form ID shown under a page title.
- **Sizes**: base 14px (`sm`) for UI text, 13px for table cells and descriptions, page title 20–22px weight 600, section headings 16px weight 600. Weights 400/500/600 only.
- **Icons**: Tabler icons (`@tabler/icons-react`, Mantine's standard set), outline style, stroke 1.5, 16–18px in navigation and buttons.
- **Radius**: `defaultRadius: "sm"` (4px) for buttons and inputs; `md` (8px) for cards, bordered lists and drawers.
- **Spacing**: 4px grid. Table rows about 44px high, nav items about 32px.

## 4. Layout: the app shell

Three columns plus a top bar, as in Monospace/Directus:

```
┌────┬──────────────────┬───────────────────────────────────────────────┐
│ ▣  │ DRK Rostock   ˅ ◧│ Formulare / Blutspende / Anmeldung        ⋯   │  ← top bar: breadcrumbs, page actions
│    │                  ├───────────────────────────────────────────────┤
│ ▤  │ ▸ Alle Formulare │                                               │
│ ▥  │ TEAMS ˅          │   Page title                                  │
│    │  ▸ Blutspende    │   form-id-in-monospace                        │
│    │     Anmeldung    │                                               │
│    │     Feedback     │   content                                     │
│    │  ▸ Erste Hilfe   │                                               │
│    │                  │                                               │
│ ⚙  │                  │                                               │
│ ●  │                  │                                               │
└────┴──────────────────┴───────────────────────────────────────────────┘
 rail   module sidebar     content (gray.0 page bg, white content panel)
```

1. **Icon rail** (about 56px, white, right border). Top: a square app tile in DRK red with the logo in white. Below it, one icon per module (*Formulare*, *Teams*; Super Admins also see *Audit-Log*). Bottom: *Einstellungen* (Super Admin only) and the user avatar (a circle with initials; its menu holds profile and *Abmelden*). The active module's icon sits on a `drkRed.0` rounded square with the icon in `drkRed.6`. Every icon has a German tooltip.
2. **Module sidebar** (about 240–260px, white, right border, collapsible via the toggle icon at its top right). The header shows the organisation name with a chevron. Content depends on the module: plain nav items (icon + label), uppercase section labels (*TEAMS*, *ALLGEMEIN*, *ZUGRIFF*) with collapse chevrons, and indented tree items (team → its forms), like the *Data Sources* tree in Directus. The active item gets a `gray.1` background and weight 500. Muted helper rows (e.g. "2 archiviert") use `gray.6`.
3. **Top bar** (about 48px, bottom border): breadcrumbs on the left, with every crumb but the last in `gray.6` and the last in body colour; page-level icon actions on the right.
4. **Content**: white panel. Detail and settings pages centre a column of about 720–800px. List pages use the full width.

On narrow screens the rail stays and the module sidebar becomes a drawer. The dashboard is desktop-first, but it must not break on a laptop at 1280px.

## 5. Components

| Pattern | Look | Mantine |
| :--- | :--- | :--- |
| Page header | Title (20–22px, 600); optional monospace ID below in `gray.6`; actions top right | `Title`, `Text ff="monospace"` |
| Primary action | Small filled red button with a leading `+` icon, e.g. *+ Formular anlegen* | `Button size="xs"/"sm"` |
| Secondary action | Default (white, grey border) or subtle button | `Button variant="default"` |
| List toolbar | Search, filter and sort as icon buttons, then the primary button, aligned right | `ActionIcon variant="subtle"` |
| Table | No zebra stripes, thin row dividers, muted header text, optional checkbox column, row hover `gray.1`, `⋯` row menu at the far right | `Table` |
| Status badge | Pill with a dot and a light background, colours from §2.3, e.g. `● Veröffentlicht` | `Badge variant="dot"` or `light` |
| Bordered list | Card with 1px border, rows with label, small outline buttons (*Konfigurieren*), `⋯` menu, optional drag handle | `Paper withBorder` + `Group` rows |
| View tabs | Segmented control at the top right of a detail page, e.g. form tabs *Designer · E-Mail · Einstellungen · Pässe · Statistik · Fehler* | `SegmentedControl` |
| Sub-tabs | Underline tabs inside a page section | `Tabs` |
| Create/edit panel | Drawer from the right, title plus close `×`, scrolling body, sticky footer with *Zurück* (default) and *Anlegen*/*Speichern* (primary) | `Drawer position="right"` |
| Forms | Label above the input, description below the label in `gray.6`; on settings pages, label and description on the left and the toggle right-aligned | `TextInput`, `Switch` |
| Save on settings pages | *← Zurück zu …* link top left, *Speichern* button top right, disabled until there are changes | `Anchor`, `Button` |
| Info callout | Bordered grey box with an info icon and text | `Alert variant="outline" color="gray"` |
| Empty state | Centred light icon, short title, one-line hint, then the primary action (or a search plus option grid) | `Stack align="center"` |
| Option grid | Two-column grid of small bordered cards (icon, name, muted subtitle) | `SimpleGrid` + `Paper withBorder` |

## 6. Mantine theme sketch

```ts
import { createTheme } from "@mantine/core";

export const theme = createTheme({
  primaryColor: "drkRed",
  primaryShade: 6,
  colors: { drkRed }, // §2.1
  defaultRadius: "sm",
  fontFamily: "var(--font-inter), system-ui, sans-serif",
  fontFamilyMonospace: "ui-monospace, SFMono-Regular, Menlo, monospace",
  headings: { fontWeight: "600" },
});
```

## 7. Logo and emblem

Use only the official DRK Rostock logo files supplied by the organisation. Do not draw a red cross ourselves: the emblem's use is protected (Geneva Conventions; in Germany, DRK-Gesetz) and the DRK has strict logo rules. Until the files are in the repo, the rail tile shows a plain red square with "DRK" in white.

## 8. Out of scope

- The Monospace AI-assistant side panel.
- Dark mode.
- Theming the embed: the public form follows the TYPO3 page and SurveyJS theme. The Standard Layout email has its own DRK branding (blueprint §5.2).
