# Whisper-Frontend — Design system & completeness plan

Produced from a grilling session on 2026-09-21; §5b updated by a second session on 2026-09-22 (Google OAuth2 SSO, per-user data isolation, PII encryption — supersedes that section's original password-auth design). Covers two things:

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

### 5b. Real authentication — Google OAuth2 SSO, per-user data isolation, encrypted PII

**Supersedes the plain-password design from the previous revision of this doc.** Produced from a second grilling session on 2026-09-22. Scope, settled in that interview:

- Google OAuth2 (Authorization Code flow) **replaces password login entirely** — the signup/login forms and `verifyPassword()` path go away, "Sign in with Google" is the only door in.
- **Per-user data isolation** via an auto-created personal team per user, reusing the existing team schema as-is — not a schema redesign.
- **Encryption scope is account/PII fields only** (`email`, `display_name`) — meeting content (title, transcript, summary, action items) stays as plain text so search/sort/filter keep working. AES-256-GCM via Web Crypto (`crypto.subtle`, already used in `auth.ts` for PBKDF2 — no new dependency).
- Session/token mechanism is **unchanged** from the previous design: a stateless signed bearer token (HMAC via Web Crypto, no session table), `Authorization: Bearer <token>` on every request, 401 → client clears session and redirects to `/login`. OAuth2 only changes *how* the user's identity is established before that token is issued.
- Google Cloud OAuth client **does not exist yet** — §5b-iv below is the exact manual checklist to create one; nothing here can go live before that's done.

Today's state this replaces: `POST /api/auth/login` only checks the email exists and ignores the password entirely (`index.ts:56-63`); the issued `token` is `crypto.randomUUID()`, never persisted, and `client.ts`'s `request()` attaches no `Authorization` header at all. Every signed-up user is added to the same single seeded "Demo Team" and every query pulls from that one team regardless of who's logged in.

#### 5b-i. OAuth2 flow

The frontend is a static export (no server-side code, deployed as static assets to `whisper-web`) — it can never hold the Google client secret. The token exchange must happen on the `whisper-api` Worker, which already owns request routing.

1. Frontend: "Sign in with Google" button builds Google's authorization URL directly (`https://accounts.google.com/o/oauth2/v2/auth` with `client_id`, `redirect_uri` pointing at the **Worker**, `scope=openid email profile`, a random `state` value stashed in `sessionStorage` for CSRF verification) and does a full-page redirect. No secret needed for this step.
2. Google redirects the browser to a new Worker route, `GET /api/auth/google/callback?code=...&state=...`.
3. Worker verifies `state` isn't reused/expired (pass it through unchanged and compare, or encode+HMAC-sign it like the session token so no server-side state store is needed), then does a server-to-server `POST https://oauth2.googleapis.com/token` with `code`, `client_id`, `client_secret` (Worker secret), `redirect_uri`, `grant_type=authorization_code`.
4. Google's response includes an `id_token` (a JWT). Since this exchange happened over a direct server-to-server HTTPS call to Google's own token endpoint (not a token handed to us by the browser), decoding the payload without a separate JWKS signature check is an acceptable simplification for this project's scope — note this explicitly as a deliberate scope cut, not an oversight, if it's ever reviewed.
5. Extract `sub` (Google's stable user id), `email`, `name` from the decoded payload. Look up `user_account` by a new unique-indexed `google_sub` column (not `email` — `sub` is stable even if the Google account's email ever changes). If not found: create the user (encrypt `email`/`display_name`, compute the `email_lookup_hash`, generate `google_sub`), then auto-create their personal team (§5b-ii).
6. Issue the same signed session token as before, then redirect the browser to a new frontend route, `https://whisper-web.../auth/callback#token=...` (fragment, not query string, so the token never hits server logs or `Referer` headers). That page reads the fragment, writes it into the existing `whisper.session` localStorage shape, and routes to `/dashboard`.

#### 5b-ii. Per-user data isolation (personal teams)

- On first-ever login for a `user_account`, create one `team` row (`team_name = "{displayName}'s workspace"`) and a `team_member` row for them as `'owner'` — no schema change, this is exactly what `ensureDemoSeed()` does today for the one hardcoded demo team, just per-user instead of global.
- Every place that currently calls `getDemoTeamId()` instead resolves the **authenticated request's own team** (looked up via their `user_account_id` → `team_member`, or cached on the verified session token itself to skip the extra query).
- Sharing a team with teammates (invites, multiple members) is not in scope here — one user, one personal team, exactly mirroring today's UX (single default team, no switcher) just scoped per person instead of globally shared.

#### 5b-iii. Encryption

New columns on `user_account` (migration, additive — no data loss for existing rows since this ships alongside the Google-only cutover, so existing plaintext demo/test rows can simply be treated as disposable rather than migrated in place):
- `email_encrypted TEXT` — AES-256-GCM ciphertext (IV prepended, base64), replaces plaintext `email` for storage/display.
- `email_lookup_hash TEXT UNIQUE` — `HMAC-SHA256(lowercased email, a second Worker secret)`, deterministic, this is what every `WHERE email = ?`-shaped lookup and the uniqueness constraint actually run against. One-way — can't be reversed back to the email.
- `display_name_encrypted TEXT` — AES-256-GCM ciphertext, no lookup needed so no blind-index for this one.
- `google_sub TEXT UNIQUE` — Google's opaque user id, plaintext (not sensitive, needs a fast unique lookup on every login).
- `password_hash` stays in the schema, just goes fully unused — leaving a dead column is lower-risk than a destructive `DROP COLUMN` migration, and it documents that password auth used to exist here.
- Two new Worker secrets: `PII_ENCRYPTION_KEY` (AES-256-GCM key) and `PII_LOOKUP_HMAC_KEY` (separate from both the encryption key and the existing session-token-signing secret — distinct keys per purpose is the point).
- Every read of `user_account` that needs to *display* email/name decrypts at read time; every read that needs to *find* a user by email computes the lookup hash from the input and queries that column instead.

#### 5b-iv. Manual setup checklist (you, not Claude — needs your Google account in a browser)

1. Google Cloud Console → new project (or reuse an existing one) → **APIs & Services → OAuth consent screen** → configure it (app name, support email, scopes: `openid`, `email`, `profile`).
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**, application type "Web application".
3. Authorized redirect URI: `https://whisper-api.whisper-ai.workers.dev/api/auth/google/callback` (exact match required, including scheme/host/path).
4. Copy the **Client ID** (safe to share, goes in frontend code / `wrangler.jsonc` `vars`) and **Client Secret** (never share — set directly with `wrangler secret put GOOGLE_CLIENT_SECRET` when this is implemented).
5. While in Cloud Console, also generate two random 32-byte secrets for `PII_ENCRYPTION_KEY` and `PII_LOOKUP_HMAC_KEY` (e.g. `openssl rand -base64 32` locally — not a Google Cloud step, just do it at the same time) and set them the same way.

**Frontend:**
- Replace `login/page.tsx`'s email/password form with a single "Sign in with Google" button.
- New route `app/auth/callback/page.tsx`: reads the token from the URL fragment, writes `whisper.session`, redirects to `/dashboard`.
- `client.ts`'s `request()`: attach `Authorization: Bearer <token>` from `whisper.session` to every call (unchanged from the previous design).
- `auth/context.tsx`: 401 anywhere → clear session, redirect to `/login` (unchanged).
- Remove `t.auth.mockNotice` ("Demo mode: any input logs you in instantly.") from `dictionaries.ts` — no longer true.
- Remove the now-dead `signup`/`login` (password) entries from `client.ts` and `dictionaries.ts`'s `auth` section.

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
- [ ] **You**: complete the Google Cloud OAuth setup checklist (§5b-iv) — blocks everything below
- [ ] Migration: `email_encrypted`, `email_lookup_hash`, `display_name_encrypted`, `google_sub` columns on `user_account`
- [ ] Backend: `GET /api/auth/google/callback` (code exchange, find-or-create user, personal-team auto-creation, issue session token)
- [ ] Backend: AES-256-GCM encrypt/decrypt + HMAC lookup-hash helpers in `auth.ts`; wire every `user_account` read/write through them
- [ ] Backend: replace every `getDemoTeamId()` call with the authenticated request's own team
- [ ] Backend: `Authorization: Bearer <token>` verification on every route except `/health` and the OAuth routes
- [ ] Frontend: "Sign in with Google" button replacing the password form; new `/auth/callback` route; remove dead password-auth code and the "Demo mode" notice
- [ ] R2 upload storage (prerequisite for...)
- [ ] Retry failed meeting
- [ ] Search: D1 FTS5 migration + query endpoint + search box
- [ ] Participant renaming: `PATCH /api/participants/{id}` + inline edit UI
