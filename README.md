# FAhubX 2.0

**FAhubX 2.0** is a new independent engineering line of the FAhubX Facebook automation platform, redesigned for **local Windows deployment** with **Cloudflare-managed licensing**.

> **Lineage note:** FAhubX 1.0 is preserved untouched at `C:\AI_WORKSPACE\Facebook Auto Bot` / `C:\FAhubX`. This repo is an independent 2.0 branch and does not modify any 1.0 source or runtime.

---

## What Changed from 1.0?

| Aspect | FAhubX 1.0 | FAhubX 2.0 |
|---|---|---|
| Deployment | VPS / Cloud SaaS | Local Windows app |
| License control | Embedded in backend | Cloudflare Workers + D1 |
| Database | Remote PostgreSQL (VPS) | Local PostgreSQL (bundled) |
| Cache | Remote Redis (VPS) | Local Redis (bundled) |
| Multi-tenant | Admin manages all tenants | Each install = one tenant |
| Distribution | SSH / PM2 on VPS | Windows installer (.exe) |

---

## Architecture

```
Customer Windows Machine
  ├── FAhubX Backend   (NestJS + TypeORM, localhost:3000)
  ├── FAhubX Frontend  (React + Vite, served locally)
  ├── PostgreSQL       (portable, bundled by installer)
  ├── Redis            (portable, bundled by installer)
  └── Puppeteer        (Chromium, browser profile isolation)

          │  HTTPS heartbeat every 30 min
          ▼

  Cloudflare License Server  (Workers + D1)
  ├── License activation + device binding
  ├── Plan enforcement (Basic / Pro / Enterprise)
  ├── Expiry checking
  ├── 30-min heartbeat ingestion
  └── 24-hour offline grace period
```

---

## Repository Structure

```
FAhubX-2.0/
├── backend/          # NestJS backend (local runtime)
├── frontend/         # React frontend (served from localhost)
├── license-server/   # Cloudflare Workers + D1 license service
├── installer/        # Windows installer (Inno Setup + staged assets)
└── docs/             # Architecture and phase documentation
```

---

## Plan Tiers

| Plan | Max Accounts | Max Tasks | Max Scripts |
|------|-------------|-----------|-------------|
| Basic | 10 | 50 | 10 |
| Pro | 30 | 200 | 50 |
| Enterprise | 50 | 300 | 100 |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS, TypeORM, PostgreSQL, Redis |
| Frontend | React 18, Ant Design, Vite, TypeScript |
| Automation | Puppeteer (headless / headed Chromium) |
| License server | Cloudflare Workers, Cloudflare D1 |
| Installer | Inno Setup (Windows .exe) |
| i18n | react-i18next (en / zh / vi) |

---

## Local Development

```bash
# Backend
cd backend && npm install && cp .env.local.example .env && npm run start:dev

# Frontend
cd frontend && npm install && npm run dev

# License server (Cloudflare Workers)
cd license-server && npm install && npm run dev
```

---

## Phase Status

| Phase | Description | Status |
|---|---|---|
| Phase 1 | Baseline survey | Done |
| Phase 2A | Git repo initialization | Done |
| Phase 3 | Identity + architecture docs | Done |
| Phase 4 | VPS/cloud isolation audit | Planned |
| Phase 5 | Local deployment hardening | Planned |
| Phase 6 | Installer packaging | Planned |

---

## Safety Boundaries

- Do not modify `C:\AI_WORKSPACE\Facebook Auto Bot` (FAhubX 1.0 source)
- Do not modify `C:\FAhubX` (FAhubX 1.0 local runtime)
- Do not commit `.env` files, license keys, or credentials

---

## License

Proprietary — FAhubX / Starbright Solutions
