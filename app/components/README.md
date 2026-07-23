# App-layer components & composables

The DS (`app/design-system`, `@ds/index`) owns primitives — buttons, inputs,
cards, sheets, toasts, skeletons, tokens, tempo. This layer owns **product
patterns** assembled from them. Rule: a pattern used twice gets extracted here;
a pattern used once stays in its page.

## Components

| Component | Purpose | Notes |
|---|---|---|
| `StoreShell` | The one public chrome (header/footer/width) for a merchant's pages | `width: wide\|narrow`; `current` on the storefront itself (h1 + #shelf anchor). A11y: one h1 per page, nav landmarks |
| `PageHeader` | The one merchant page heading: title / purpose / `#actions` / `#meta` | Renders h1; put page-level buttons in `#actions` |
| `PublishedBar` | The just-published moment: message slot → View live → Copy → dismiss | `live-url` (component cache-busts); `@dismiss`. aria-live=polite. The 0.2 law: no dead ends, no success modals |
| `PublicImg` | An img that fails to a quiet branded placeholder, lazy by default | `img-class` styles both img and fallback |
| `DealEngage` | Fire / save / follow bar | `kind: deal\|spark\|store` (store = follow-only); counts are SERVER truth — never render optimistic social proof |
| `NotificationCenter`* `WorkspaceSwitcher`* `WorkspaceTopBar`* | Shell parts (`workspace/`) | Owned by the layout; not for page use |

## Composables

| Composable | Purpose | Notes |
|---|---|---|
| `useDevHeaders()` | The dev-identity header, once | Forgetting this broke two pages historically — never hand-roll it |
| `useCopyFeedback()` | Copy-link with visible "Copied ✓" + SR announce | `copy(id, url)`; render `copiedId === id` on the pressed button |
| `useArmedAction(prompt)` | Two-tap destructive confirm, 3s disarm, announced | `if (arm(id)) doIt()`; render armed state via `armedId` |

## Laws that live above components

- Motion/durations exist only as tempo tokens (`theme.css`); the token gate
  enforces it. Press feedback + page transitions are global — never re-add
  per-component.
- Empty states use `DofEmptyState` and teach (never "No data").
- `heading-as` on `DofEmptyState` when it sits directly under an h1.
