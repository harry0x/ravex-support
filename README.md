# Ravex Support Chat

A realtime customer support platform (Intercom/Zendesk-style) built on [Ravex](https://github.com/ravex-io/ravex), React, Express and PostgreSQL. It shows how Ravex fits into a real full-stack application: Ravex handles realtime delivery, PostgreSQL holds durable data, and Cloudinary stores files. See [`RAVEX_SUPPORT_CHAT_PROJECT.md`](./RAVEX_SUPPORT_CHAT_PROJECT.md) for the full specification.

**Status: Phases 1–8 complete.** Remaining: Docker (9) and deployment (10).

📖 **[How the platform works](./docs/FLOW.md)** covers every flow end to end (sign-in, realtime connection, rooms, messages, uploads, typing, read receipts, presence, admin), with diagrams.

- **Customers** register, open conversations (optionally choosing a department), chat live, upload files, react, close and reopen.
- **Agents** work a live queue, accept conversations (first one wins), chat, and change status, priority and department.
- **Admins** see a dashboard (stats, charts, activity), manage users, agents and departments, search and assign conversations.
- **Realtime (Ravex):** one room per conversation, messages saved before delivery, presence (online/away/offline), typing indicators, read receipts, emoji reactions, edits and deletes, live queue/list updates.
- **Landing page** at `/` for visitors: an annotated-raven hero, a looping two-screen product demo, features, architecture, the three portals (real screenshots, light and dark) and calls to action. Signed-in users go straight to their portal.
- **Dark mode** everywhere: follows the OS, or pin Light / Dark with the ◐ ☀ ☾ switch (remembered, applied before first paint).

## Design

The UI is an "instrument" for support. It blends the [Ravex site](https://ravex-io.github.io/) with editorial and technical-drawing references:

- **Identity:** the official Ravex raven (`apps/web/public/favicon.svg`, from the Ravex site's `logo.svg`), with a plum gradient taken from the site's 3D raven. Fonts are Space Grotesk (the Ravex site's typeface) and JetBrains Mono for annotations.
- **Gallery layout:** paper whites, ink, and one accent (raven plum `#a3477c`). Huge tightly tracked titles have a grey continuation line.
- **Technical-drawing details:**
  - mono measurement labels (`ID = 62C33B47`);
  - dimension-line rulers for days and system events;
  - the sign-in page draws the raven as an annotated diagram, with callouts for presence, typing, read receipts and reactions;
  - braille spinners for typing.
- **Signature details:** the Ravex animated grid backdrop and ◆ feature marquee, a black pill dock for navigation (a full-screen "MENU ••" index on mobile), tactile pill buttons that press into a ledge, and faceted chat bubbles echoing the low-poly raven.
- **Charts:** colours validated for colour-vision deficiency; every chart has visible values and a table view.

Brand components live in `apps/web/src/components/brand`, and tokens and utilities in `apps/web/src/index.css`.

## Structure

```text
apps/
  server/   Node + TypeScript + Express + Prisma + @ravex/server
    prisma/              schema, migrations (commit these), seed
    prisma.config.ts     Prisma 7 config (datasource URL, migrations, seed)
    src/
      config/            env (Zod-validated), database (Prisma client)
      controllers/       thin HTTP handlers
      services/          business logic: auth, conversation, message, upload, user, admin, department
        realtime.ts      the gateway interface services use to reach the realtime layer
      schemas/           Zod request schemas
      middleware/        authenticate / authorize, rate limits, error handler
      routes/            Express routers (+ API tests)
      ravex/             ALL Ravex-specific code (isolated integration layer)
        index.ts         createRealtime(): socket.io Server, ChatEngine, gateway implementation
        auth.ts          handshake: JWT -> server-built Ravex user
        guard.ts         per-packet authorization + persistence of reads/reactions/edits/deletes
        persistence.ts   messageMiddleware: saves message:send before Ravex broadcasts it
        rooms.ts         logical room keys <-> Ravex room ids, access levels, kicks
      cloudinary/        ALL Cloudinary-specific code
      utils/             AppError, jwt, password, file validation
      generated/prisma/  generated client (git-ignored, created by `prisma generate`)
    test/                Vitest global setup + helpers
  web/      React 19 + TypeScript + Vite + Tailwind 4 + react-router + @ravex/client
    src/
      stores/            auth (session) and realtime (one Ravex connection, rooms, presence)
      hooks/             useConversationChat, useConversationList
      services/api.ts    REST client
      components/        chat UI, layout, UI primitives, charts
      pages/             auth, customer, agent, admin, profile
    e2e/smoke.mjs        browser smoke test (real Chrome)
```

## Getting started

Requires Node.js LTS and pnpm (via corepack).

```bash
corepack enable            # once, provides the pnpm binary
pnpm install               # also runs `prisma generate`
cp apps/server/.env.example apps/server/.env   # fill in DATABASE_URL, DIRECT_URL, JWT_SECRET, ...
cp apps/web/.env.example apps/web/.env
pnpm --filter @support-chat/server db:deploy   # apply migrations
pnpm --filter @support-chat/server db:seed     # departments + admin from SEED_ADMIN_*
pnpm dev                   # API + Ravex on $PORT, web on :5173
```

Sign in as the seeded admin, create an agent under **Users**, then register a customer in a private window (sessions are stored per browser profile) and start chatting.

If port 3000 is taken, set `PORT` in `apps/server/.env` and update `VITE_API_URL` / `VITE_RAVEX_URL` in `apps/web/.env` to match.

### Environment

| Variable (server) | Purpose |
|---|---|
| `DATABASE_URL` | Runtime queries. On Neon, use the pooled (`-pooler`) host. |
| `DIRECT_URL` | Prisma migrations. On Neon, the same URL without `-pooler`. |
| `TEST_DATABASE_URL` | Integration tests. Must include `?schema=<name>` other than `public`; tests refuse to run otherwise, because they wipe that schema. |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | Token signing (≥ 32 chars) and lifetime (e.g. `7d`). |
| `CLIENT_URL` | The web app's origin (CORS for REST and Socket.IO). |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Optional. Until all three are set, uploads return `503 UPLOADS_NOT_CONFIGURED` and the rest of the app works normally. |
| `MAX_FILE_SIZE` | Upload size limit in bytes (default 10 MB). |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | First admin, created by `db:seed`. |

The web app only uses `VITE_API_URL`, `VITE_RAVEX_URL` and `VITE_APP_NAME`. No secrets ever go to the frontend.

Server scripts: `db:migrate` (create + apply a migration, regenerate client), `db:deploy`, `db:seed`, `db:generate`, `db:studio`.

## Testing

CI (`.github/workflows/ci.yml`) runs typecheck, build and the full server suite against a Postgres service container on every push and pull request.

```bash
pnpm typecheck
pnpm test                                  # server: Vitest integration tests against TEST_DATABASE_URL
E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… pnpm --filter @support-chat/web e2e   # with `pnpm dev` running
```

- **Server (88 tests):** real HTTP requests and real `@ravex/client` sockets against a real PostgreSQL schema. They cover:
  - auth: register, login, `me`, tampered tokens, disabled users, timing-safe errors;
  - authorization for every role and conversation state;
  - pagination and search; agent assignment, including concurrent accepts;
  - uploads (Cloudinary mocked): type sniffing, size limit, filename sanitisation, attachment reuse;
  - admin: users, departments, stats, activity;
  - security headers and rate limits;
  - Ravex realtime: room join rules, save-before-broadcast, viewers can't send, typing, read receipts, reactions, edits and deletes, kicks on reassignment, staff and customer notifications, disconnect on disable, presence and `lastSeenAt`.
- **Browser smoke test** (`apps/web/e2e/smoke.mjs`): drives three real Chrome sessions through the whole flow:
  1. The admin creates an agent; a customer registers and opens a conversation.
  2. The agent sees it in the queue live and accepts it.
  3. They exchange live messages, typing indicators, read receipts, reactions and edits, plus status changes and closing.
  4. Admin search and the agents page.

  It fails on any browser console error. It uses the locally installed Chrome (`playwright-core`, no browser download).

## REST API

All responses use `{ "success": true, "data": ... }` or `{ "success": false, "message": "...", "error": "CODE" }`. Validation errors add `details: [{ path, message }]`. Stack traces and internal messages are hidden in production.

| Method | Path | Who | Notes |
|---|---|---|---|
| `POST` | `/api/auth/register` | anyone | `{ name, email, password }`. Always creates a `CUSTOMER`; any `role` field is ignored. |
| `POST` | `/api/auth/login` | anyone | Same `INVALID_CREDENTIALS` error for a wrong password or unknown email. |
| `POST` | `/api/auth/logout` | signed in | Stateless: the client discards its token. |
| `GET` | `/api/auth/me` | signed in | |
| `GET` | `/api/conversations` | signed in | `?page&limit&status&assigned=me\|unassigned&q=`. `q` searches customer name/email, subject and message content. Items include `customer`, `agent` (with live `presence`), `department`, `lastMessage`, `unreadCount`. |
| `POST` | `/api/conversations` | customer | `{ subject, message, departmentId? }`. |
| `GET` / `PATCH` | `/api/conversations/:id` | see rules | `PATCH { status?, priority?, departmentId? }`. |
| `POST` | `/api/conversations/:id/assign` | agent, admin | Agents send `{}` to accept; admins `{ agentId }` or `{ agentId: null }`. |
| `GET` | `/api/conversations/:id/messages` | viewers | `?limit&before=<messageId>` cursor pagination, newest page first. |
| `POST` | `/api/conversations/:id/messages` | participants | `{ content?, attachmentIds? }`. Broadcast live to the room. |
| `POST` | `/api/uploads` | participants | multipart `conversationId` + `file`. Returns a pending attachment to send with a message. |
| `GET` | `/api/departments` | signed in | Admins also see inactive ones. |
| `POST` / `PATCH` / `DELETE` | `/api/departments[/:id]` | admin | Deleting keeps conversations (department set to null). |
| `GET` / `POST` | `/api/users` | admin | List (`?page&role&status&q`) / create staff accounts. |
| `GET` / `PATCH` | `/api/users/:id` | self, admin | Users rename themselves; admins change role/status (not their own). |
| `GET` | `/api/agents` | agent, admin | Active agents with presence and open-conversation count. |
| `GET` | `/api/admin/stats`, `/api/admin/activity` | admin | Totals, 14-day series, activity feed. |
| `GET` | `/health` | anyone | Liveness. |

### Conversation access rules

| | View | Send / react / mark read | `PATCH` | Assign |
|---|---|---|---|---|
| **Customer** | Own | Own | close / reopen only | — |
| **Agent** | Assigned to them + unassigned queue | Only once assigned | status, priority, department (once assigned) | Accept unassigned (first wins, others `409`) |
| **Admin** | All | — (read-only) | status, priority, department | Any active agent, reassign, unassign |

- Conversations a user may not view return `404`, so their existence isn't revealed.
- `CLOSED` conversations reject messages, uploads and assignment until reopened.
- A customer reply to a `PENDING` conversation sets it back to `OPEN`.
- Status changes and assignments add `SYSTEM` messages to the timeline.
- Disabling or demoting an agent returns their open conversations to the queue and ends their live sessions.

## Realtime design (Ravex)

### Rooms

Clients join **logical room keys**. The server checks each one against PostgreSQL before handing the client Ravex's actual room id:

| Key | Who may join | What it carries |
|---|---|---|
| `conversation:<id>` | Anyone who may view it. Customer and assigned agent are **participants**; admins and agents watching the queue are **viewers**. | Messages, typing, read receipts, reactions, edits, deletes |
| `staff` | Agents, admins | `conversation.created` / `conversation.updated` notifications (refresh the inbox) |
| `user:<id>` | That user only | Notifications about the customer's own conversations |

Only participants can send, type, react, mark read, edit or delete. When an agent accepts a conversation, everyone who lost access is removed from the room (`engine.kickUser`).

### Message flow

```text
socket message:send ─► guard (auth) ─► Ravex ─► messageMiddleware: save via message.service ─► broadcast message:new
REST POST /messages ─► message.service (save) ─► gateway.publishMessage ─► emit Ravex message:new to the room
```

Every stored message is broadcast with the full stored record in `metadata.message`, so clients see the same shape live as from history. Reads, reactions, edits and deletes are authorized and saved in the guard *before* Ravex broadcasts them.

### Ravex APIs used (verified against v0.1.1 source and types)

- **Server:**
  - `new ChatEngine(io, { message, presence, rateLimit, messageMiddleware })`
  - `engine.createRoom`, `engine.kickUser`, `engine.getUser`, `engine.destroy`, `engine.io`
  - `ChatError`, `ErrorCodes`
  - types: `MessageMiddleware`, `TypedNamespace`, `SocketData`, `PersistenceAdapter` (only to derive types)
- **Client:**
  - `ChatClient({ url, auth, autoConnect })`, `rawSocket`
  - `joinRoom` / `leaveRoom`, `sendMessage`, `editMessage`, `deleteMessage`, `markAsRead`, `sendReaction`
  - `startTyping` / `stopTyping`, `setStatus`, `ping`
  - `onMessage`, `onMessageEdited`, `onMessageDeleted`, `onReadReceipt`, `onReaction`
  - `onTypingStart` / `onTypingStop`, `onUserOnline` / `onUserOffline` / `onUserStatus`, `onKickedFromRoom`
- **Not used:**
  - `PersistenceAdapter`: Ravex calls it after broadcasting, and edits and deletes would load a room's whole history through it.
  - `message:history`: history comes from the paginated REST API.

### Ravex behaviour to know about (and how this project handles it)

1. **Handshake identity is client-trusted.** Ravex copies `handshake.auth.user` into `socket.data.user`. `ravex/auth.ts` runs first: it verifies the JWT, loads the active user, and replaces the payload.
2. **`room:join` has no authorization, and room ids are random.** The guard checks the logical key in PostgreSQL, creates the Ravex room lazily, and swaps in its id. Client `room:create` / `room:delete` are blocked.
3. **`message:react` / `message:read` / edit / delete skip membership and ownership checks** without a persistence adapter. The guard enforces participant access and ownership.
4. **Messages are broadcast before `PersistenceAdapter.saveMessage`, and its failures are only logged.** Saving in `messageMiddleware` instead means nothing is delivered unless it was stored.
5. **Rooms, membership and presence live in memory.** They are rebuilt lazily after a restart, and clients re-join on reconnect and re-fetch the latest messages.
6. **`user:online/offline/status` go to every connected socket.** The Ravex `username` is therefore a role label (`customer` / `agent`), and real names (`displayName`) only reach rooms the user is in.
7. **Reaction events don't say whether a reaction was added or removed.** The database mirrors Ravex's toggle semantics, and clients toggle locally.
8. **Typing isn't replayed to late joiners.** It auto-stops after 3 s.
9. **Not supported by Ravex 0.1.1: a "delivered" receipt.** Messages show **Sent** (stored) and **Read** (read receipt persisted in `message_reads`).
10. **One malformed packet could crash the server.** Ravex calls `ack()` without checking it exists and destructures payloads unchecked, and socket.io runs handlers in `process.nextTick` without a try/catch. For example, `socket.emit('room:list')` with no callback would kill the process. The guard therefore only lets through the events the app uses, in the expected shape, and drops everything else. A process-level handler logs anything that still slips through. Covered by a test.
11. **Ravex's `room:leave` is per user, but sockets are per tab.** Leaving in one tab would break the user's other tabs and hide them from access re-checks. The guard handles `room:leave` per socket instead.

## Security

- **Auth:** bcrypt (cost 12, pure-JS `bcryptjs`), and the JWT carries only the user id. Role and status are re-read on every request and socket connection, so changes apply immediately.
- **Authorization:** role and conversation access are checked on the server for every REST call *and* every socket packet. Client-sent roles, ids and room ids are never trusted.
- **Validation:** Zod on every input, request bodies limited to 100 KB, Socket.IO `maxHttpBufferSize` 100 KB, messages limited to 5,000 characters.
- **Socket packets:** an allowlist of events with shape checks (so a malformed packet can't crash Ravex), and a per-connection rate limit on database-backed events (30 burst, then 5 per second).
- **Rate limits:**
  - failed logins: 10 per 15 min per IP;
  - registrations: 20 per hour;
  - API: 1,000 per 15 min;
  - uploads: 30 per 15 min per user;
  - Ravex messages: 30 per minute per user.
- **Uploads:**
  - files stay in memory (never on the server's disk) and go straight to Cloudinary;
  - an allowlist of extensions, checked against the file's actual bytes; the browser's MIME type is ignored and SVG is excluded;
  - size limit, sanitised file names, random public ids;
  - only the uploader's own unused uploads in the same conversation can be attached.
- **Headers:** Helmet; strict CORS to `CLIENT_URL`; `trust proxy` in production.
- **Secrets:** never sent to the frontend. Password hashes are omitted from every query by default.

## Roadmap

1. ✅ Ravex proof of concept
2. ✅ Backend foundation: Prisma, PostgreSQL (Neon), Zod, JWT auth
3. ✅ Chat persistence and conversation authorization
4. ✅ Ravex features: conversation rooms, presence, typing, read receipts, reactions, edits/deletes
5. ✅ Cloudinary uploads (enabled once credentials are set)
6. ✅ Frontend: customer, agent and admin apps
7. ✅ Security hardening
8. ✅ Testing
9. Docker
10. Deployment (Cloudflare Pages + Render + Neon)

Known limitations and next steps:
- Substring search uses `ILIKE`; add `pg_trgm` or full-text indexes at scale.
- Daily stats are bucketed in application code; move to SQL `date_trunc` at scale.
- Uploads that are never attached to a message stay in Cloudinary; add a cleanup job.
- Rooms and presence are per process; multiple instances need the Socket.IO Redis adapter plus shared room state.
- Ravex broadcasts `user:online/offline/status` to every socket. Only user ids and a role label are exposed (no names), but hiding presence entirely would need changes inside Ravex.
- Ravex never frees rooms or user records in memory. That's fine for a single instance at this scale; a long-lived, high-traffic deployment would need periodic restarts or an upstream fix.
