# FAhubX 2.0 — Architecture

**Date:** 2026-05-10
**Status:** Phase 3 — initial architecture document

---

## Overview

FAhubX 2.0 is a **local Windows application** controlled remotely by a
**Cloudflare-hosted License Server**. Each licensed customer installs and runs
the full stack on their own Windows machine. Cloudflare enforces all licensing.
The customer machine only needs internet access for the 30-minute license heartbeat.

---

## System Diagram

```
┌─────────────────────────────────────────────────────────┐
│                Customer Windows Machine                  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │          FAhubX Backend  (NestJS)                │   │
│  │  • REST API  localhost:3000                      │   │
│  │  • Cron task runner (@Cron EVERY_30_SECONDS)     │   │
│  │  • WebSocket gateway                             │   │
│  │  • License heartbeat client                      │   │
│  └───────────────┬──────────────────┬───────────────┘   │
│                  │                  │                    │
│       ┌──────────▼──────┐  ┌───────▼────────┐          │
│       │   PostgreSQL    │  │     Redis       │          │
│       │   (portable)    │  │   (portable)    │          │
│       │   localhost:5432│  │  localhost:6379 │          │
│       └─────────────────┘  └────────────────┘          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │     FAhubX Frontend  (React, served locally)     │   │
│  │  • Ant Design UI  •  i18n (en/zh/vi)             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │     Puppeteer  (Chromium automation)             │   │
│  │  • One browser profile per FB account            │   │
│  │  • Headless or headed mode                       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                     │
           HTTPS — every 30 min
                     │
┌─────────────────────────────────────────────────────────┐
│          Cloudflare License Server  (remote)             │
│   Runtime: Cloudflare Workers  •  DB: Cloudflare D1     │
│                                                          │
│  POST /activate      — bind license key to machine ID   │
│  POST /heartbeat     — record last-seen, return limits  │
│  GET  /admin/licenses — list all licenses               │
│  POST /admin/licenses — create new license              │
│  PATCH /admin/licenses/:id — modify / revoke / extend   │
│  POST  /admin/licenses/:id/unbind — release machine     │
└─────────────────────────────────────────────────────────┘
```

---

## Local Runtime Components

### Backend (`backend/`)
- **Framework:** NestJS with TypeScript + TypeORM
- **Database:** PostgreSQL (portable, bundled by installer)
- **Cache:** Redis (portable, bundled by installer)
- **Key modules:**
  - `auth` — JWT auth, session management
  - `facebook-accounts` — account storage, browser profile paths
  - `simple-tasks` / `task-executor` — task creation and execution
  - `task-auto-runner` — `@Cron(EVERY_30_SECONDS)` polling
  - `warmup` — account warmup scheduler (P1 / P2 / P3)
  - `license` — heartbeat client, machine fingerprint (`machine-id.util.ts`)
- **Port:** `localhost:3000`

### Frontend (`frontend/`)
- **Framework:** React 18 + TypeScript + Ant Design 5
- **Build tool:** Vite
- **Key pages:** Dashboard, Accounts, Tasks, Chat Scripts,
  Admin (Licenses, Users), Activation
- **i18n:** English / Chinese (Simplified) / Vietnamese
- **API:** Relative URL — proxied or served alongside backend

### License Server (`license-server/`)
- **Runtime:** Cloudflare Workers (edge, no VPS required)
- **Database:** Cloudflare D1 (managed SQLite)
- **Key format:** `FAH-XXXX-XXXX-XXXX` (chars A-Z 2-9, no I/O/0/1)
- **Deploy:** `npx wrangler deploy`

### Installer (`installer/`)
- **Tool:** Inno Setup 6 (`installer/fahubx-setup.iss`)
- **Staged assets:**
  - `installer/staging/pgsql/` — portable PostgreSQL (Windows x64)
  - `installer/staging/redis/` — portable Redis (Windows)
  - `installer/staging/backend/` — pre-built backend
- **Install flow:**
  1. Extract PostgreSQL + Redis
  2. Initialize DB cluster + run migrations
  3. Start backend and serve frontend
  4. Create desktop shortcut
  5. On first launch: show Activation page if not licensed

---

## License Enforcement Flow

```
1. Install → first launch
2. Backend checks license-cache.json
   → Not found: redirect to /activate
   → Found: validate against License Server

3. /activate page:
   User enters FAH-XXXX-XXXX-XXXX
   → POST /activate to License Server
   → Server checks: valid? not expired? not bound to another machine?
   → OK: cache plan limits locally, proceed to app
   → Error: show message (expired / already bound / invalid key)

4. Every 30 minutes:
   → POST /heartbeat to License Server
   → Server returns current plan + expiry
   → Backend updates local cache

5. If offline > 24 hours:
   → Backend blocks task execution
   → Data preserved (not deleted)
   → User sees license warning

6. Admin actions (via Admin API):
   → Revoke key, unbind machine, change plan, extend expiry
```

---

## Plan Limits

| Plan | maxAccounts | maxTasks | maxScripts |
|------|-------------|----------|------------|
| Basic | 10 | 50 | 10 |
| Pro | 30 | 200 | 50 |
| Enterprise | 50 | 300 | 100 |

---

## Legacy VPS/Cloud Code — Phase 4 Isolation Targets

FAhubX 2.0 was branched from FAhubX 1.0 (VPS SaaS). The following areas contain
cloud-mode code not yet removed. **Do not delete yet — audit first in Phase 4.**

| Area | Location | Cloud-specific behavior |
|------|----------|------------------------|
| Deploy mode guard | `backend/src/common/guards/subscription.guard.ts` | `DEPLOY_MODE=cloud` branches |
| VPN integration | `backend/src/modules/vpn-client/` | VPS-side VPN management |
| Kubernetes configs | `kubernetes/` | Cloud orchestration |
| Docker Compose prod | `docker-compose.prod.yml` | Cloud container stack |
| Admin multi-tenant | `frontend/src/pages/AdminUsersPage.tsx` | Multi-tenant SaaS admin |
| PM2 references | Various `.md` and deploy scripts | VPS process management |

Phase 4 action: add `// TODO(2.0): cloud-mode only` comments, then isolate
in Phase 5 before installer packaging.

---

## Safety Boundaries

| Boundary | Rule |
|----------|------|
| FAhubX 1.0 source | Do NOT modify `C:\AI_WORKSPACE\Facebook Auto Bot` |
| FAhubX 1.0 runtime | Do NOT modify `C:\FAhubX` |
| VPS production | Do NOT SSH to `45.77.242.18` from repo scripts |
| Secrets | Do NOT commit `.env`, license keys, or credentials |
| Processes | Do NOT run broad kill commands (`taskkill /F /IM node.exe`) |
| Other projects | Do NOT touch WAhubX, TeleHubX, ChatFlow Pro, M33 Lotto Bot |

---

## Key Files

```
backend/src/modules/license/license.service.ts        heartbeat client
backend/src/modules/license/machine-id.util.ts        machine fingerprint
backend/src/common/guards/subscription.guard.ts       dual-mode guard
backend/src/modules/simple-tasks/
  task-auto-runner.service.ts                         cron scheduler
backend/src/modules/facebook-accounts/
  browser-session.service.ts                          Puppeteer management

frontend/src/App.tsx                                  license check + routing
frontend/src/pages/ActivationPage.tsx                 activation UI
frontend/src/services/api.ts                          API base URL

license-server/src/index.ts                           Cloudflare Worker entry
license-server/src/utils/key-generator.ts             license key generation
installer/fahubx-setup.iss                            Inno Setup script
```
