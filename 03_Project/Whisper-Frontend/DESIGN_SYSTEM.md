# Whisper-Frontend — Design system & completeness plan

Produced from a grilling session on 2026-09-21. Covers two things:

1. A visual design-system refresh (typography, icons, a "Liquid Glass" evolution of the existing glass surfaces).
2. Closing real frontend↔backend gaps found during the audit — some built now, some designed here and deferred past the 2026-09-23 deadline.

Everything under **Deferred** is a full design, not a stub — implement directly from this doc when picked back up.

## Scope decisions (from the interview)

- Real work now: typography, icons, Liquid Glass evolution, action item CRUD, meeting rename.
- Documented only, deferred past 2026-09-23: soft delete, real auth, retry-failed-meeting, search, participant renaming.
- New backend work targets **Whisper_Cloudflare_API only** (the deployed Worker), matching this project's established pattern — `Whisper_Backend_API` (Python/Postgres) is a parallel local-dev path, not kept in lockstep.
- This app is dark-mode only today (`:root` and `.dark` in `globals.css` are identical, `<html>` always carries the `dark` class) — nothing here changes that.

---

## 1. Typography — switch to "Prompt"

**This is a bug fix, not a style preference.** `layout.tsx` currently loads Geist/Geist Mono with `subsets: ["latin"]` only — Geist has no Thai glyphs, so every Thai string in `dictionaries.ts` (most of the app's copy) is already silently falling back to the browser's system font. "Prompt" is a Google Font with full Thai + Latin coverage designed for UI use at small sizes.

- Replace `Geist`/`Geist_Mono` in `src/app/layout.tsx` with `next/font/google`'s `Prompt`, subsets `["thai", "latin"]`, weights `[300, 400, 500, 600, 700]`.
- Drop `Geist_Mono` entirely — `grep` confirms `font-mono`/`--font-geist-mono` is declared but never applied by any component (dead weight). If a monospace need shows up later (e.g. a raw-JSON debug view), add a mono font then, scoped to that one place.
- Keep the `--font-sans` / `--font-heading` CSS variable indirection in `globals.css` as-is — just point it at Prompt's generated variable.

## 2. Iconography — Material Symbols Rounded

Replace `lucide-react` (used in 13 files: `transcript-view.tsx`, `dashboard/page.tsx`, `ui/sonner.tsx`, `ui/select.tsx`, `ui/checkbox.tsx`, `ui/dialog.tsx`, `ui/dropdown-menu.tsx`, `language-toggle.tsx`, `job-timeline.tsx`, `dashboard-nav.tsx`, `app/page.tsx`, `dashboard/meeting/page.tsx`, `dashboard/new/page.tsx`) with **Material Symbols Rounded**.

- Load via Google Fonts stylesheet link (variable font, axes `FILL,wght,GRAD,opsz`) rather than an npm icon-component package — keeps bundle size down and gets Google's actual variable-font behavior (e.g. animate `FILL` 0→1 on active/selected states instead of swapping icon components).
- Render as `<span className="material-symbols-rounded">icon_name</span>` with a small typed wrapper component (`<Icon name="..." filled={...} />`) so call sites don't hand-write the raw span everywhere.
- Default axis settings: `FILL 0, wght 400, GRAD 0, opsz 24`; flip `FILL` to `1` for active nav items / checked states instead of swapping to a different icon name.
- Map every current lucide icon 1:1 to its Material Symbols name (e.g. `TriangleAlert` → `warning`, `ChevronLeft` → `chevron_left`, `UploadCloud` → `upload`, `Users` → `group`, `Info` → `info`) before touching call sites, so it's a mechanical swap, not a redesign of what each icon means.

## 3. Liquid Glass evolution

Extends the existing `.glass-panel` utility (`globals.css:104`) and the already-glass nav headers (`site-header.tsx`, `dashboard-nav.tsx` both already use `bg-background/70 backdrop-blur-xl`). **CSS-approximation, not true refraction** — no SVG displacement/shader work; that's a separate, higher-risk effort if ever wanted. Keep the current violet primary (`oklch(0.72 0.19 292)`) — this is a treatment upgrade, not a rebrand.

New `.glass-panel` (replaces the current one-liner):

```css
.glass-panel {
  @apply relative border border-white/12 bg-white/[0.06] backdrop-blur-xl backdrop-saturate-150;
  box-shadow:
    inset 0 1px 0 0 oklch(1 0 0 / 8%),      /* top specular edge */
    inset 0 0 0 1px oklch(1 0 0 / 4%),      /* inner hairline */
    0 8px 30px -8px oklch(0 0 0 / 45%);      /* soft cast shadow */
}
.glass-panel::before {
  /* specular highlight sweep, top-left */
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(120% 60% at 15% 0%, oklch(1 0 0 / 10%), transparent 60%);
  pointer-events: none;
}
```

- **Corner radii**: keep the existing `--radius` scale (`globals.css:42-48`); no true squircle (no native CSS support without a hand-authored `clip-path: path(...)` per size, which isn't worth the maintenance cost here). The existing `radius-2xl`/`3xl` on cards already reads close enough to Apple's continuous-corner look at this UI's density.
- **Adaptive tint on interaction**: `.glass-panel` gets a `transition-[background,box-shadow] duration-300` and a `:hover`/`:has(:focus-visible)` state that nudges `bg-white/[0.06]` → `bg-white/[0.09]` and intensifies the specular `::before` opacity — approximates Liquid Glass's "material reacts to attention" behavior cheaply.
- **Motion**: keep `framer-motion` (already a dependency, already used for page-entry fades). Add a shared spring preset (`{ type: "spring", stiffness: 300, damping: 30 }`) exported from `src/lib/motion.ts` and use it for card entry, tab switches, and the new Trash-view transitions, instead of each component hand-tuning its own `transition` object.
- **Where it applies**: every existing `.glass-panel` usage (login card, dashboard meeting cards, transcript panel, action item rows) plus the two nav headers get the upgraded treatment — no new surfaces need it, this is a treatment swap on existing ones.

## 4. Feature completeness — built now

### 4a. Action item CRUD

Today: `PATCH /api/action-items/{id}` only ever updates `status` (`Whisper_Cloudflare_API/src/index.ts:129`, `db.ts`'s `updateActionItemStatus`). There is no create endpoint and no UI for either. Action items can currently only exist if a future LLM-extraction step creates them — which doesn't exist yet — so today the list is permanently empty for every real meeting.

**Backend (`Whisper_Cloudflare_API`):**
- `POST /api/meetings/{id}/action-items` — body `{ description, assigneeName?, dueDate? }`, creates a row on that meeting, returns `{ actionItem }`.
- Extend `PATCH /api/action-items/{id}` to accept `description?`, `assigneeName?`, `dueDate?`, `status?` (any subset), not just `status`.
- `assigneeName` is a **free-text string column**, not a foreign key to `participant` — deliberately decoupled, since participants are still raw "A"/"B" labels until the deferred participant-renaming work ships. Matches how `sourceFileName` etc. are already plain denormalized strings on `meeting`.
- New `db.ts` functions: `createActionItem(db, meetingId, input)`, extend `updateActionItemStatus` → `updateActionItem(db, actionItemId, patch)`.

**Frontend:**
- `action-item-list.tsx`: add an "Add action item" row/button opening an inline form (description, optional assignee, optional due date) → `POST`.
- Each item gets an edit affordance (pencil icon, Material Symbols `edit`) opening the same form pre-filled → `PATCH`.
- `client.ts`: add `api.createActionItem(meetingId, input)`, change `setActionItemStatus` → generic `updateActionItem(meetingId, actionItemId, patch)`.
- `types.ts`: no shape change needed — `ActionItem` already has all these fields, they just weren't writable.

### 4b. Meeting rename

Today: `Whisper_Cloudflare_API/src/db.ts` only has `setMeetingStatus` (status-only `UPDATE meeting`). Postgres's `Whisper_Backend_API` already has a general `usp_update_meeting` procedure — the Worker never got the equivalent.

**Backend:**
- `PATCH /api/meetings/{id}` — body `{ title }` (extend later if more fields need editing), `UPDATE meeting SET title = ?, updated_at = ? WHERE meeting_id = ?`.
- New `db.ts` function: `updateMeetingTitle(db, meetingId, title)`.

**Frontend:**
- `dashboard/meeting/page.tsx`: title becomes click-to-edit (or a pencil icon next to the `<h1>`) — inline text input, save on blur/Enter → `PATCH`, optimistic update matching the pattern already used in `action-item-list.tsx`'s `toggle()`.
- `client.ts`: add `api.renameMeeting(id, title)`.

---

## 5. Deferred — full designs, not stubs

### 5a. Soft delete (meetings only, with Trash)

- Schema already supports this everywhere — every table has `deleted_at`, every existing read query already filters `WHERE deleted_at IS NULL`. This is purely additive.
- **Backend**: `DELETE /api/meetings/{id}` → `UPDATE meeting SET deleted_at = ? WHERE meeting_id = ?` (not a real `DELETE`). `POST /api/meetings/{id}/restore` → `SET deleted_at = NULL`. `GET /api/meetings?trash=1` (or a separate `GET /api/meetings/trash`) → same list query but `WHERE deleted_at IS NOT NULL` instead.
- **Frontend**: delete action (icon button, Material Symbols `delete`) on each dashboard card and on the meeting detail page, with a confirm step (destructive action — needs explicit confirmation per this project's own UX conventions, e.g. an `AlertDialog` from the existing `ui/dialog.tsx` primitives). A "Trash" entry in `dashboard-nav.tsx` linking to a view reusing the existing dashboard card grid, sourced from the trash-filtered list, with a "Restore" button instead of a link-through.
- Out of scope even in this deferred design: auto-purge after N days, and extending soft-delete to action items/participants — no real user need surfaced for either.

### 5b. Real authentication

Today: `POST /api/auth/login` only checks the email exists and **ignores the password entirely** (`index.ts:56-63`, same on the Python backend); the issued `token` is `crypto.randomUUID()`, never persisted, and the frontend never sends it back on any later request (`client.ts`'s `request()` attaches no `Authorization` header at all). Every signed-up user is added to the same single seeded "Demo Team" and every list/read query pulls from that one team regardless of who's "logged in" — so today there is zero real per-request authorization, not just a weak password check.

Chosen shape: **stateless signed bearer token**, no new DB table, single shared team stays exactly as-is (this only makes login/session real, it doesn't add multi-tenancy).

**Backend:**
- Add `src/auth.ts` helpers (a real hash-verify function already exists per the file's own comment — "real PBKDF2 hash... but /api/auth/login only looks the account up by email" — so the hash-compare half is mostly wiring, not new crypto).
- `POST /api/auth/login`: verify `password` against the stored PBKDF2 hash with `crypto.subtle`; on mismatch return `401 INVALID_CREDENTIALS` (today it never can).
- Token = a compact signed payload: `base64url(JSON{userId, exp}) + "." + base64url(HMAC-SHA256(that JSON, a secret))`, secret stored as a Worker secret (`wrangler secret put AUTH_SECRET`), verified with `crypto.subtle.verify`. No session table, no DB round trip to validate — matches this project's existing "no framework, minimal surface" pattern (see `index.ts`'s own comment on why there's no Hono).
- Every route except `/health`, `/api/auth/login`, `/api/auth/signup` requires a valid `Authorization: Bearer <token>`; missing/invalid/expired → `401`. Extract `userId` from the verified token instead of always resolving the single demo user.
- Reasonable expiry: 7 days (long enough not to be annoying for a demo app, short enough that a leaked token isn't forever).

**Frontend:**
- `client.ts`'s `request()`: read the token from the existing `whisper.session` localStorage entry and attach `Authorization: Bearer <token>` to every call automatically.
- `auth/context.tsx`: on a `401` response anywhere, clear the session and redirect to `/login` (session expired), not just on explicit logout.
- `logout()` stays exactly as it is today — clearing localStorage — since there's no server-side session to also invalidate with this token design. If a real logout-everywhere need shows up later, that's what would force the stateful-session-table alternative instead.
- Remove `t.auth.mockNotice` ("Demo mode: any input logs you in instantly.") from `login/page.tsx` and `dictionaries.ts` once this ships — it'll no longer be true.

### 5c. Smaller deferred items

- **Retry failed meeting**: a "Retry" button on the failed-state card in `dashboard/meeting/page.tsx`, calling a new `POST /api/meetings/{id}/retry` that re-runs `runMeetingPipeline` against the same stored... — note: today the uploaded audio file itself is **not retained** anywhere after processing (read into memory, never written to R2 — see `Whisper_Cloudflare_API/README.md`'s own note that R2 isn't wired up yet). A real retry therefore needs R2 storage of the original upload first; without it, "retry" can only mean "re-upload the same file again," which barely needs a dedicated feature. **Treat R2 upload storage as a prerequisite sub-task before this one is buildable at all.**
- **Search**: Postgres already has a generated `TSVECTOR` column (`schema.sql:201`); the Cloudflare/D1 side has none (explicitly noted as future work in `migrations/0001_init.sql`'s own header comment). Needs a new D1 migration adding an FTS5 virtual table over `transcript.full_text` (+ maybe `meeting.title`), a new `GET /api/meetings?q=...` query path, and a search box in the dashboard header. Biggest of the deferred items — budget it as its own multi-step slice, not a quick add-on.
- **Participant renaming**: turn raw speaker labels ("A", "B") into real display names. Needs `PATCH /api/participants/{id}` (no such route exists today on either backend) and a small inline-edit UI wherever a speaker badge renders (`transcript-view.tsx`). Low backend risk, mostly UI wiring once the endpoint exists.

---

## 6. Sub-task checklist

### Now (this pass)
- [ ] Typography: swap Geist → Prompt (`thai`+`latin`, weights 300-700) in `layout.tsx`; drop unused Geist Mono
- [ ] Icons: add Material Symbols Rounded stylesheet + `<Icon>` wrapper component; map all 13 lucide call sites 1:1; remove `lucide-react` dependency once done
- [ ] Liquid Glass: rewrite `.glass-panel` (specular `::before`, inset shadows, hover/focus tint transition); add `src/lib/motion.ts` shared spring preset; apply to nav headers + existing glass surfaces
- [ ] Backend: `POST /api/meetings/{id}/action-items`, extend `PATCH /api/action-items/{id}` to accept description/assignee/dueDate
- [ ] Backend: `PATCH /api/meetings/{id}` for title rename
- [ ] Frontend: action item create/edit form in `action-item-list.tsx`
- [ ] Frontend: click-to-edit meeting title in `dashboard/meeting/page.tsx`
- [ ] Deploy Worker + frontend, verify live (same pattern as the diarization-fallback fix: synthetic/real test, check both `POST`/`PATCH` responses and the rendered UI)

### Later (designed above, implement directly from §5 when picked back up)
- [ ] Soft delete: `DELETE`/`restore` endpoints, Trash view, confirm-dialog on delete
- [ ] Real auth: password verification, signed bearer token, `Authorization` header on every request, 401-triggers-logout, remove the "Demo mode" notice
- [ ] R2 upload storage (prerequisite for...)
- [ ] Retry failed meeting
- [ ] Search: D1 FTS5 migration + query endpoint + search box
- [ ] Participant renaming: `PATCH /api/participants/{id}` + inline edit UI
