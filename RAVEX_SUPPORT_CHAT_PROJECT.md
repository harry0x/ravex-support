# Ravex Support Chat Platform

## 1. Project Overview

Build a production-style realtime customer support platform using:

-   **Frontend:** React + TypeScript + Vite + Tailwind CSS
-   **Backend:** Node.js + TypeScript + Express
-   **Realtime:** Ravex (`@ravex/server` + `@ravex/client`)
-   **Database:** PostgreSQL
-   **ORM:** Prisma
-   **Database hosting:** Neon PostgreSQL
-   **File/media storage:** Cloudinary
-   **Authentication:** JWT + bcrypt
-   **Deployment:** Cloudflare Pages (frontend) + Render (backend)
-   **Containerization:** Docker
-   **Source control:** GitHub

The goal is to build a serious portfolio/open-source project that
demonstrates realtime architecture, PostgreSQL, REST APIs,
WebSockets/Ravex, authentication, file uploads, Docker, testing and
cloud deployment.

------------------------------------------------------------------------

# 2. Ravex Repository

Official repository:

https://github.com/ravex-io/ravex

Ravex is a TypeScript/Socket.IO realtime chat system. It provides:

-   Realtime messaging
-   Presence
-   Typing indicators
-   Rooms
-   Read receipts
-   Emoji reactions
-   Rate limiting
-   Client/server type safety
-   Pluggable persistence through a persistence adapter

Important:

**Do not invent Ravex APIs.**

Before implementation:

1.  Inspect the official repository.
2.  Read its README.
3.  Inspect `@ravex/server`.
4.  Inspect `@ravex/client`.
5.  Inspect TypeScript types/source when documentation is insufficient.
6.  Use the actual API available in the installed version.
7.  Keep Ravex-specific code isolated in a dedicated integration layer.
8.  Do not modify Ravex itself unless absolutely necessary.

Ravex should provide realtime communication. PostgreSQL should provide
permanent application persistence.

------------------------------------------------------------------------

# 3. Product Concept

Build a simplified Intercom/Zendesk-style customer support platform.

There are three roles:

### Customer

Customers can:

-   Register/login
-   Create support conversations
-   Send messages
-   Receive realtime messages
-   See agent online/offline status
-   See typing indicators
-   See message read status
-   React to messages
-   Upload attachments
-   Close conversations
-   Reopen conversations

### Agent

Agents can:

-   Login
-   View conversations
-   Accept/assign conversations
-   Chat with customers
-   See customer presence
-   Send messages
-   See typing indicators
-   Mark messages as read
-   React to messages
-   Upload files/images
-   Close/reopen conversations

### Admin

Admins can:

-   View users
-   Manage agents
-   View conversations
-   Assign agents
-   Manage departments
-   View basic statistics
-   Disable users
-   View activity

------------------------------------------------------------------------

# 4. Architecture

``` text
                         GitHub
                           |
             +-------------+-------------+
             |                           |
             v                           v
     Cloudflare Pages                 Render
        React App                  Node Backend
                                      |
                              +-------+-------+
                              |               |
                              v               v
                           Express          Ravex
                              |               |
                              |          Realtime
                              |               |
                              v               |
                           Prisma <-----------+
                              |
                              v
                         Neon PostgreSQL

Frontend
   |
   +---- REST API ------> Express
   |
   +---- Realtime ------> Ravex

Backend
   |
   +---- PostgreSQL ----> Neon
   |
   +---- Files ---------> Cloudinary
```

------------------------------------------------------------------------

# 5. Why PostgreSQL Instead of MongoDB?

Use PostgreSQL because this application has strongly related entities:

``` text
Users
  |
  +---- Conversations
            |
            +---- Messages
            |
            +---- Attachments
            |
            +---- Reactions
            |
            +---- Assignments
```

PostgreSQL gives us:

-   Foreign keys
-   Transactions
-   Relations
-   Constraints
-   Indexes
-   Reliable relational querying
-   Good support for analytics/reporting

Use **Prisma** as the database ORM.

------------------------------------------------------------------------

# 6. Database Hosting

Use **Neon PostgreSQL** for the initial free deployment.

Do NOT use Render Free Postgres for this project because Render's
current free PostgreSQL instance is limited to 1 GB and expires after 30
days.

Neon currently provides a free Postgres plan with 1 GB storage per
project.

Environment variable:

``` env
DATABASE_URL=postgresql://...
```

Never expose `DATABASE_URL` to the frontend.

------------------------------------------------------------------------

# 7. Database Schema

Use Prisma.

## User

``` text
User
- id
- name
- email
- passwordHash
- role
- avatarUrl
- status
- lastSeenAt
- createdAt
- updatedAt
```

Roles:

``` text
CUSTOMER
AGENT
ADMIN
```

Status:

``` text
ACTIVE
DISABLED
```

------------------------------------------------------------------------

## Department

``` text
Department
- id
- name
- description
- isActive
- createdAt
- updatedAt
```

Examples:

``` text
Technical Support
Billing
Sales
General Support
```

------------------------------------------------------------------------

## Conversation

``` text
Conversation
- id
- customerId
- agentId
- departmentId
- subject
- status
- priority
- lastMessageAt
- createdAt
- updatedAt
```

Status:

``` text
OPEN
PENDING
CLOSED
```

Priority:

``` text
LOW
NORMAL
HIGH
URGENT
```

------------------------------------------------------------------------

## Message

``` text
Message
- id
- conversationId
- senderId
- content
- type
- createdAt
- updatedAt
- deletedAt
```

Message type:

``` text
TEXT
IMAGE
FILE
SYSTEM
```

------------------------------------------------------------------------

## Attachment

``` text
Attachment
- id
- messageId
- publicId
- url
- secureUrl
- resourceType
- originalName
- mimeType
- size
- createdAt
```

Cloudinary should store the actual file.

PostgreSQL stores metadata and the Cloudinary URL/public ID.

------------------------------------------------------------------------

## MessageRead

``` text
MessageRead
- id
- messageId
- userId
- readAt
```

Use a unique constraint on:

``` text
messageId + userId
```

------------------------------------------------------------------------

## Reaction

``` text
Reaction
- id
- messageId
- userId
- emoji
- createdAt
```

Use a unique constraint on:

``` text
messageId + userId + emoji
```

------------------------------------------------------------------------

# 8. Cloudinary

Use Cloudinary for persistent media storage.

Do NOT store uploaded files on Render's local filesystem.

Render free web services have ephemeral filesystems, so uploaded files
can disappear after restart, redeploy or spin-down.

Cloudinary is responsible for:

-   Image uploads
-   File uploads where supported
-   CDN delivery
-   Image transformations
-   Public/secure URLs

Cloudinary free plan currently provides a no-cost allowance and supports
upload APIs/widgets.

Backend environment variables:

``` env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Never expose `CLOUDINARY_API_SECRET` to the frontend.

Prefer uploading through the backend initially:

``` text
React
  |
  v
Express
  |
  v
Cloudinary
  |
  v
secure URL
  |
  v
PostgreSQL metadata
```

Later, direct browser uploads using signed upload parameters can be
added if needed.

------------------------------------------------------------------------

# 9. Backend Environment Variables

Create:

``` text
apps/server/.env
```

Example:

``` env
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://...

JWT_SECRET=replace_with_long_random_secret
JWT_EXPIRES_IN=7d

CLIENT_URL=http://localhost:5173

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

MAX_FILE_SIZE=10485760
```

Production:

``` env
NODE_ENV=production
PORT=10000

DATABASE_URL=...

JWT_SECRET=...

JWT_EXPIRES_IN=7d

CLIENT_URL=https://your-frontend.pages.dev

CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

MAX_FILE_SIZE=10485760
```

Render provides the public port/environment configuration; the
application must listen on the platform-provided `PORT`.

------------------------------------------------------------------------

# 10. Frontend Environment Variables

Create:

``` text
apps/web/.env
```

Example:

``` env
VITE_API_URL=http://localhost:3000/api
VITE_RAVEX_URL=http://localhost:3000
VITE_APP_NAME=Ravex Support Chat
```

Production:

``` env
VITE_API_URL=https://your-backend.onrender.com/api
VITE_RAVEX_URL=https://your-backend.onrender.com
VITE_APP_NAME=Ravex Support Chat
```

Important:

Anything beginning with `VITE_` is potentially visible to the browser.

Never put:

``` text
DATABASE_URL
JWT_SECRET
CLOUDINARY_API_SECRET
private API keys
database passwords
```

inside frontend environment variables.

------------------------------------------------------------------------

# 11. Authentication

Implement:

``` text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

Use:

-   bcrypt for passwords
-   JWT for authentication
-   Authentication middleware
-   Role-based authorization

Never trust a role supplied by the frontend.

The backend must determine the user's role from authenticated
server-side data.

------------------------------------------------------------------------

# 12. REST API

## Authentication

``` text
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

## Conversations

``` text
GET    /api/conversations
POST   /api/conversations
GET    /api/conversations/:id
PATCH  /api/conversations/:id
```

## Messages

``` text
GET  /api/conversations/:id/messages
POST /api/conversations/:id/messages
```

## Users

``` text
GET   /api/users
GET   /api/users/:id
PATCH /api/users/:id
```

## Agents

``` text
GET  /api/agents
POST /api/conversations/:id/assign
```

## Departments

``` text
GET    /api/departments
POST   /api/departments
PATCH  /api/departments/:id
DELETE /api/departments/:id
```

## Uploads

``` text
POST /api/uploads
```

Use pagination for conversation and message endpoints.

------------------------------------------------------------------------

# 13. Ravex Realtime Features

Use Ravex for realtime behavior.

Implement where supported by the actual Ravex version:

### Realtime messages

``` text
Customer
   |
   v
Ravex
   |
   v
Conversation room
   |
   v
Agent
```

Persist the message in PostgreSQL.

### Presence

``` text
ONLINE
AWAY
OFFLINE
```

Presence should be realtime.

Persist `lastSeenAt` when appropriate.

### Typing indicators

``` text
typing:start
typing:stop
```

Use the actual event/API names provided by Ravex.

Do not store typing state permanently.

### Read receipts

``` text
SENT
DELIVERED
READ
```

Persist important read state in PostgreSQL.

### Reactions

Allow:

``` text
👍 ❤️ 😂 😮 😢
```

Persist reactions in PostgreSQL.

------------------------------------------------------------------------

# 14. Conversation Rooms

Each conversation should correspond to a Ravex room.

Example conceptual room:

``` text
conversation:<conversation-id>
```

Before joining a room, verify:

-   User is authenticated
-   Customer owns the conversation
-   Agent is assigned/authorized
-   Admin has permission

Never trust a room ID received from the client.

------------------------------------------------------------------------

# 15. Frontend Pages

Public:

``` text
/login
/register
```

Customer:

``` text
/dashboard
/chat/:conversationId
/profile
```

Agent:

``` text
/agent/dashboard
/agent/conversations
/agent/conversations/:id
/agent/profile
```

Admin:

``` text
/admin
/admin/users
/admin/agents
/admin/conversations
/admin/departments
```

------------------------------------------------------------------------

# 16. Chat UI

Create:

-   Conversation sidebar
-   Chat header
-   Message list
-   Message composer
-   Typing indicator
-   Online indicator
-   Read status
-   Emoji reactions
-   File upload
-   Image preview
-   Delete/edit actions
-   Connection status
-   Scroll-to-bottom
-   Loading state
-   Empty state
-   Error state

Example:

``` text
+-----------------------------------------------------+
| Conversations |             Chat                    |
|----------------|-----------------------------------|
| Customer 1     | John Doe                    Online |
| Customer 2     |-----------------------------------|
| Customer 3     | Hello, I need help.               |
|                |                                   |
|                |                 Sure, I can help. |
|                |                                   |
|                | John is typing...                 |
|                |-----------------------------------|
|                | [Type message...] [📎] [Send]    |
+-----------------------------------------------------+
```

------------------------------------------------------------------------

# 17. Admin Dashboard

Display:

``` text
Total Customers
Total Agents
Open Conversations
Pending Conversations
Closed Conversations
Online Agents
Messages Today
```

Add simple charts for:

-   Conversations per day
-   Open vs closed
-   Messages per day

Do not overbuild analytics.

------------------------------------------------------------------------

# 18. Search

Agents/admins should be able to search:

-   Customer name
-   Customer email
-   Conversation subject
-   Message content

Use PostgreSQL indexes where appropriate.

Add pagination.

Do not load all messages into the browser.

------------------------------------------------------------------------

# 19. Security

Implement:

-   Password hashing
-   JWT authentication
-   Role-based authorization
-   Request validation
-   Zod validation
-   Helmet
-   CORS
-   Rate limiting
-   File type validation
-   File size limits
-   Filename sanitization
-   Conversation authorization
-   Error handling

Never expose:

``` text
JWT_SECRET
DATABASE_URL
CLOUDINARY_API_SECRET
```

to the frontend.

------------------------------------------------------------------------

# 20. Error Response Format

Use consistent API responses.

Success:

``` json
{
  "success": true,
  "data": {}
}
```

Error:

``` json
{
  "success": false,
  "message": "Conversation not found",
  "error": "CONVERSATION_NOT_FOUND"
}
```

Do not expose stack traces in production.

------------------------------------------------------------------------

# 21. Project Structure

Recommended:

``` text
ravex-support-chat/
│
├── apps/
│   ├── server/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   │
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── controllers/
│   │   │   ├── middleware/
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── ravex/
│   │   │   ├── cloudinary/
│   │   │   ├── utils/
│   │   │   └── server.ts
│   │   │
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   └── package.json
│   │
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── stores/
│       │   ├── services/
│       │   ├── types/
│       │   └── App.tsx
│       │
│       ├── .env.example
│       └── package.json
│
├── README.md
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── .gitignore
```

------------------------------------------------------------------------

# 22. Docker

Dockerize the backend.

Example:

``` text
Docker
  |
  +-- Node.js
       |
       +-- Express
       +-- Prisma
       +-- Ravex
       +-- Cloudinary SDK
```

Do not run PostgreSQL inside the production backend container.

PostgreSQL is hosted by Neon.

Cloudinary stores uploaded files.

------------------------------------------------------------------------

# 23. Local Development

Required local tools:

-   Node.js LTS
-   pnpm
-   Docker
-   Git

For local development, PostgreSQL can either be:

### Option A

Use Neon directly.

### Option B

Run PostgreSQL locally using Docker.

Example:

``` text
Docker
  |
  └── PostgreSQL
```

Production:

``` text
Render
  |
  └── Node + Ravex

Neon
  |
  └── PostgreSQL

Cloudinary
  |
  └── Files
```

------------------------------------------------------------------------

# 24. Development Phases

Do not generate the entire project at once.

## Phase 1 --- Ravex Proof of Concept

First:

1.  Inspect Ravex.
2.  Install the actual packages.
3.  Create a minimal Node server.
4.  Connect the Ravex client.
5.  Connect two browser clients.
6.  Send a realtime test message.
7.  Verify the actual Ravex APIs.

Do not proceed until realtime communication works.

------------------------------------------------------------------------

## Phase 2 --- Backend Foundation

Add:

-   Express
-   PostgreSQL
-   Prisma
-   Environment variables
-   Error handling
-   Zod
-   Authentication

Create:

``` text
User
Department
Conversation
Message
```

------------------------------------------------------------------------

## Phase 3 --- Chat Persistence

Implement:

-   Create conversation
-   Send message
-   Save message
-   Retrieve history
-   Pagination
-   Conversation authorization

------------------------------------------------------------------------

## Phase 4 --- Ravex Features

Implement:

-   Rooms
-   Presence
-   Typing
-   Read receipts
-   Reactions

Use the actual APIs from the installed Ravex version.

------------------------------------------------------------------------

## Phase 5 --- Cloudinary

Implement:

-   Image upload
-   File upload
-   Cloudinary metadata
-   Message attachments
-   File validation

------------------------------------------------------------------------

## Phase 6 --- Frontend

Build:

-   Login
-   Register
-   Dashboard
-   Conversation list
-   Chat UI
-   Agent dashboard
-   Admin dashboard

------------------------------------------------------------------------

## Phase 7 --- Security

Implement:

-   Authorization
-   Rate limiting
-   Input validation
-   Upload validation
-   CORS
-   Helmet
-   Secure authentication

------------------------------------------------------------------------

## Phase 8 --- Testing

Test:

-   Authentication
-   Authorization
-   Conversation access
-   Message creation
-   Agent assignment
-   Ravex realtime behavior
-   File uploads

------------------------------------------------------------------------

## Phase 9 --- Docker

Create:

``` text
Dockerfile
docker-compose.yml
```

Verify the backend runs correctly inside Docker.

------------------------------------------------------------------------

## Phase 10 --- Deployment

### Frontend

Deploy:

``` text
Cloudflare Pages
```

### Backend

Deploy:

``` text
Render Web Service
```

Render supports Node web services, Docker containers and WebSocket
connections.

### Database

Deploy:

``` text
Neon PostgreSQL
```

### Files

Use:

``` text
Cloudinary
```

Final:

``` text
Cloudflare Pages
       |
       | HTTPS
       v
Render Node Server
       |
       +---- Ravex / WebSocket
       |
       +---- Prisma
       |       |
       |       v
       |     Neon
       |
       +---- Cloudinary
```

------------------------------------------------------------------------

# 25. Free-Tier Deployment Notes

The initial portfolio deployment should target \$0/month.

Expected services:

``` text
GitHub          $0
Cloudflare      $0
Render          $0 tier
Neon            $0 tier
Cloudinary      $0 tier
```

Important limitations exist on free tiers.

Render free web services can spin down after inactivity, so the first
request/realtime connection after sleeping can be slow.

Do not use this free setup as a production SLA architecture.

------------------------------------------------------------------------

# 26. Production Improvements Later

When the application grows, consider:

-   Redis
-   Redis adapter for realtime scaling
-   Multiple backend instances
-   S3/R2 object storage
-   Background workers
-   Email notifications
-   Push notifications
-   Message queues
-   Observability
-   Sentry
-   Better analytics
-   Full-text search
-   Multi-tenant organizations
-   React Native mobile application
-   AI support assistant

------------------------------------------------------------------------

# 27. Coding Rules for AI Coding Agents

When using Claude Code/Cursor:

1.  Inspect existing code before changing it.
2.  Inspect the actual Ravex source/types before using an API.
3.  Never invent Ravex methods/events.
4.  Do not rewrite working code unnecessarily.
5.  Use TypeScript.
6.  Avoid `any`.
7.  Keep controllers thin.
8.  Put business logic in services.
9.  Keep Ravex integration isolated.
10. Keep Cloudinary integration isolated.
11. Validate all external input.
12. Validate authorization on the backend.
13. Never trust frontend roles/IDs.
14. Never expose secrets.
15. Do not install unnecessary packages.
16. Do not create unnecessary abstractions.
17. Add tests for important functionality.
18. Keep the README updated.
19. Run lint/typecheck/tests after meaningful changes.
20. Work phase-by-phase instead of generating the whole application
    blindly.

------------------------------------------------------------------------

# 28. First Task for the Coding Agent

Start ONLY with Phase 1.

Do not build the complete application yet.

The first task is:

1.  Inspect https://github.com/ravex-io/ravex
2.  Determine the current package APIs.
3.  Create the project structure.
4.  Install the required Ravex packages.
5.  Create a minimal Node/TypeScript server.
6.  Create a minimal React/Vite client.
7.  Connect the React client to Ravex.
8.  Verify two browser clients can connect.
9.  Verify realtime messaging.
10. Document exactly which Ravex APIs were used.
11. Run the project and verify it works.
12. Only after Phase 1 works, explain what was implemented and wait for
    the next phase.

Do not invent APIs based on assumptions.

------------------------------------------------------------------------

# 29. Definition of Done

The final project should have:

-   React frontend
-   Node/Express backend
-   TypeScript
-   Ravex realtime chat
-   PostgreSQL
-   Prisma
-   Neon deployment
-   JWT authentication
-   Customer/Agent/Admin roles
-   Conversation rooms
-   Realtime messages
-   Presence
-   Typing indicators
-   Read receipts
-   Reactions
-   Cloudinary uploads
-   Search
-   Pagination
-   Admin dashboard
-   Validation
-   Rate limiting
-   Docker
-   Tests
-   GitHub repository
-   Cloudflare frontend deployment
-   Render backend deployment
-   Professional README

The key objective is not just to create a chat application. The project
should clearly demonstrate how **Ravex can be integrated into a real
full-stack application while PostgreSQL handles durable data and
Cloudinary handles persistent media storage.**
