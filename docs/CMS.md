# Admin CMS (`cms/`)

The CMS is an internal operations console for shelters, moderators, and Token Tails staff. It is a
pure client of the NestJS backend: there are no Next.js API routes and no database access of its
own. Everything an admin does here becomes an authenticated HTTP call to the backend described in
[BACKEND.md](BACKEND.md) and [API.md](API.md).

## Stack

| Item | Value |
|---|---|
| Framework | Next.js 16.1 (Pages Router), React 19.2, TypeScript 5.5 (`strict`) |
| Styling | Tailwind CSS 3.4 with shadcn-style CSS-variable theme, SCSS globals, `tailwindcss-animate` |
| Data fetching | TanStack React Query 5 |
| Auth | Firebase Web SDK 10 (email/password, Google, Apple) |
| Rich text | TinyMCE (`@tinymce/tinymce-react`) |
| Uploads | `react-dropzone` posting multipart to the backend image endpoint |
| Dates | `react-datetime-picker` |
| UI primitives | Radix UI (dialog, dropdown, tabs, tooltip, slot), `lucide-react`, `class-variance-authority` |
| Tests | Jest 30, ts-jest, Testing Library |

Path alias `@/*` maps to the `cms/` root in both `tsconfig.json` and Jest.

## Scripts

```bash
npm run dev            # next dev --turbo
npm run build          # next build
npm run start          # next start
npm test               # jest
npm run coverage       # jest with cobertura output -> coverage.xml
```

There is no `lint` script even though an ESLint flat config exists. Run `npx eslint .` manually.

## Configuration

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_BE_URL` | Backend base URL, prefixed onto every API path. Read at module import time, so it is inlined at build time. |
| `NEXT_PUBLIC_THEME` | Theme folder segment used by an asset-path helper that the CMS never calls. Effectively unused. |

The Firebase web config and the TinyMCE cloud key are hard-coded in source rather than read from
environment variables. See "Known issues" below.

`cms/.env.development` and `cms/.env.production` are committed to git. They should only ever hold
public `NEXT_PUBLIC_*` values.

## Directory map

| Path | Purpose |
|---|---|
| `pages/` | Routes (see below). |
| `api/` | Fetch wrapper (`api.ts`) plus one module per backend domain: blessing, image, quest, shelter, ticket, user. |
| `components/ui/` | shadcn/Radix primitives: badge, button, card, drag-drop uploader, dropdown, input, loader, sheet, table, tabs, textarea (TinyMCE wrapper). |
| `components/blessings/`, `quests/`, `shelters/`, `users/` | Domain list and table components. |
| `components/tailsCard/` | The flippable collectible cat card used for previews (front, back, wrapper with tilt/holo effects, modal). |
| `components/SignIn.tsx` | Login modal. |
| `context/` | `FirebaseAuthContext` (auth gate, token storage, profile fetch), `ProfileContext`, `ToastContext`. |
| `layout/` | `RootLayout` (providers) and `DashboardLayout` (sidebar, mobile sheet nav, header). |
| `lib/` | `cn()` helper and a tiny typed event bus used to surface API errors as toasts. |
| `models/` | TypeScript interfaces and enums for blessings, cats, shelters, users, quests, images, search. |
| `constants/utils.ts` | Helpers shared with the player client. Only `cdnFile` is used by the CMS. |
| `public/` | Logo, backgrounds, ability icons, card art, country flags, the `paws` web font. |
| `__tests__/` | Jest suites (see Testing). |
| `client/` | Stale build artifact only (`.next/trace`). Safe to delete. |

## Routes

| URL | File | What it does |
|---|---|---|
| `/` | `pages/index.tsx` | Dashboard menu. "Manage MY Shelter Cats" always; Users, Shelters, Quests, Tickets, Giveaways only for permission level 3 and above. |
| `/blessings` | `pages/blessings/index.tsx` | Shelter cat list with shelter selector, debounced name search, status filter, inline status update, card preview. |
| `/blessings/:id`, `/blessings/create` | `pages/blessings/[id].tsx` | Create or edit a shelter cat: shelter, status, name, rich-text description, cat photo, adopter photo. |
| `/individual` | `pages/individual/index.tsx` | List of custom (individually created) blessings. |
| `/individual/:id`, `/individual/create` | `pages/individual/[id].tsx` | Create or edit a custom blessing including game props (ability type, sprite, cat image), gift the cat to a user, regenerate avatar. |
| `/shelters`, `/shelters/:id` | `pages/shelters/*` | Shelter list and editor: name, description, logo, address, website, socials, founding date. |
| `/quests`, `/quests/:id` | `pages/quests/*` | Quest list and editor: name, link, catpoints reward, $TAILS reward, image. |
| `/users`, `/users/:id` | `pages/users/*` | User list with search; editor for name, discount code, email, shelter assignment, permission level; grant Starter, Influencer, or Legendary packs. |
| `/tickets` | `pages/tickets.tsx` | Unanswered support tickets, 10 per page, inline reply. |
| `/giveaway` | `pages/giveaway.tsx` | Bulk loot-box giveaway to newline-separated Twitter or Discord usernames. |
| `404` | `pages/404.tsx` | Renders an empty page. |

## Domain concepts

- **Blessing**: a shelter cat record (or supplies, medical, bills in the enum, though only cats are used). Statuses are `WAITING`, `RECOVERING`, `ADOPTED`, `HEAVEN`. A blessing links to a game `cat`, a `shelter`, a `creator`, and optional `owner` and minted `token`.
- **Custom blessing**: a blessing created for an individual (for example an influencer cat) rather than a shelter intake. Saved with status `ADOPTED` and game props set by the admin.
- **Shelter**: partner organisation. Users can be assigned to a shelter, which scopes what they see.
- **Quest**: an off-platform task (link) that rewards catpoints and $TAILS.
- **Permission levels**: `USER=1`, `MODERATOR=2`, `EDITOR=3`, `MANAGER=4`, `ADMIN=5`. Levels 4 and above may switch between shelters; lower levels are pinned to their own shelter.
- **Packs**: `STARTER`, `INFLUENCER`, `LEGENDARY` bundles granted through the backend web3 module.

## Authentication flow

1. `FirebaseAuthProvider` renders the sign-in modal until a Firebase user exists. The modal cannot be dismissed without signing in.
2. Sign-in options are email and password, Google popup, and Apple popup. If email sign-in returns "user not found", the form silently creates the account.
3. On auth state change the Firebase ID token is stored in `sessionStorage` under the key `accesstoken`, prefixed with the literal `fb`. A timer refreshes it every 29 minutes.
4. Every backend call sends that value in a lowercase `accesstoken` header. The wrapper polls session storage until the key exists before sending.
5. The backend strategy (`backend/src/user/strategies/auth-app.strategy.ts`) decodes the token and resolves a Firebase user, then permission guards enforce roles per endpoint.

Client-side permission checks only hide links. Real enforcement is server-side.

## Backend endpoints used

| Method | Path | Used by |
|---|---|---|
| POST | `/blessing/search` | Blessing and individual lists |
| GET, DELETE | `/blessing/:id` | Editors (delete is currently unreachable from the UI) |
| POST | `/blessing/`, `/blessing/custom` | Create shelter cat, create custom blessing |
| PUT | `/blessing/:id/`, `/blessing/:id/custom` | Update |
| PUT | `/blessing/:id/status` | Inline status change |
| PUT | `/blessing/:id/avatar` | Regenerate avatar |
| GET | `/cat/gift/:catId/:userId` | Gift a cat to a user |
| POST | `/image` | Multipart upload (`file`, `name`) |
| POST | `/quest/search` | Quest list |
| GET, PUT, DELETE | `/quest/:id` | Quest editor |
| POST | `/quest` | Create quest |
| GET, POST | `/shelter` | Shelter list, create |
| GET, PUT | `/shelter/:id` | Shelter editor |
| POST | `/ticket/search/unanswered` | Ticket inbox |
| PUT | `/ticket/:id` | Answer ticket |
| GET | `/user/profile`, `/user/profile/:id` | Current admin, user editor |
| POST | `/user/profile` | Create user |
| PUT | `/user/profile/:id` | Update user |
| POST | `/user/search` | User list |
| POST | `/user/loot/twitter`, `/user/loot/discord` | Bulk giveaway |
| GET | `/web3/pack/:packType/:id` | Grant pack |

## Testing

Eight Jest suites cover the fetch wrapper, the Firebase auth context, the profile context, the
sign-in modal, the blessings table and marketplace item, and the dropdown primitive. Pages, the
domain API modules, layouts, toasts, and the card components are untested.

Coverage collection is restricted to `components/blessings/*` in `jest.config.ts`, so the committed
`coverage.xml` is not a project-wide figure.

## Known issues

Security and hygiene:

- TinyMCE cloud key and Firebase web config are hard-coded in source instead of env-driven.
- The auth context logs the refreshed Firebase token to the browser console every refresh cycle.
- Email sign-in doubles as open registration because of the "user not found" fallback.
- No client-side route guard. Any signed-in Firebase user can open every admin page; only backend guards stop the writes.
- `.env.development` and `.env.production` are tracked in git.

Correctness:

- The shared `request()` helper never throws. It returns `null` on failure and pushes the error to the toast bus, so the `try/catch` blocks in editor pages never fire and the shelter and user editors redirect as if saves succeeded.
- The token wait loop polls forever with no timeout.
- Blessing delete is wired in the individual list page but the table component has no delete prop.
- Quest search re-fetches the full list; the query string is never sent.
- Domain models are duplicated between `models/blessing.ts` and `models/cat.ts` on one side and `models/cats.ts` on the other, with different field sets, forcing `as any` casts.
- `ToastContext` registers an event listener during render without cleanup.
- `components.json` points at `tailwind.config.js` and `public/globals.scss`, but the real files are `tailwind.config.ts` and `styles/globals.scss`.
- `zod` and `server-only` are dependencies with zero imports.
