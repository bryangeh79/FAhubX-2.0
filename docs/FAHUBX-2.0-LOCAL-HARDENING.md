# FAhubX 2.0 — Local Deployment Hardening Plan

**Date:** 2026-05-10
**Phase:** 5A — Local mode safe defaults
**Status:** In progress

---

## Overview

FAhubX 2.0 targets **local Windows deployment** with **Cloudflare-managed licensing**.
This document tracks the hardening steps needed to strip cloud/VPS/SaaS logic from the
codebase and prepare it for the Windows installer packaging phase.

---

## Local Mode Defaults (Phase 5A — Applied)

| Setting | Old Default | New Default | File |
|---------|-------------|-------------|------|
| `DEPLOY_MODE` fallback | `'cloud'` | `'local'` | `subscription.guard.ts:22` |
| `APP_NAME` | `'Facebook Auto Bot'` | `'FAhubX 2.0'` | `configuration.ts:4` |

### Critical: DEPLOY_MODE=local

The `DEPLOY_MODE` environment variable controls which code path runs:
- `local` → license check via Cloudflare License Server heartbeat
- `cloud` → subscription expiry check via local PostgreSQL `users.subscriptionExpiry`

**The 2.0 installer `.env` MUST set `DEPLOY_MODE=local`.**
Added to `backend/.env.local.example` as `DEPLOY_MODE=local`.

---

## SubscriptionGuard — Local Mode Behavior

File: `backend/src/common/guards/subscription.guard.ts`

The guard now defaults to `local` mode when `DEPLOY_MODE` is not set:

```typescript
const deployMode = process.env.DEPLOY_MODE || 'local'; // 2.0 default: local mode
```

**Local mode flow:**
1. Dynamically imports `LicenseService`
2. Calls `licenseService.isValid()` — checks heartbeat cache
3. If invalid: throws `ForbiddenException` (license expired/offline > 24h)
4. If valid or LicenseModule not loaded: returns `true`

**Cloud mode flow (only when `DEPLOY_MODE=cloud`):**
- Queries `users.subscriptionExpiry` from PostgreSQL
- Marked with `TODO(2.0): cloud-mode only` — will be removed in Phase 5B

---

## Cloud-Mode Isolation List (Marked in Phase 4)

These areas are marked with `// TODO(2.0): cloud-mode only — isolate before local Windows packaging`.
They must be removed or stubbed before installer packaging (Phase 5B+).

### Backend — marked

| File | Area | Action in Phase 5B |
|------|------|-------------------|
| `subscription.guard.ts` | Cloud DB subscription check (lines 42–65) | Remove cloud branch; keep local branch only |
| `main.ts` | Cloud-only production key validation | Remove or guard behind explicit `DEPLOY_MODE=cloud` |
| `vpn-client/vpn-client.module.ts` | VPS VPN management module | Remove from AppModule imports |
| `vpn-integration/vpn-integration.module.ts` | VPS VPN/IP pool integration | Remove from AppModule imports |
| `configuration.ts` | RabbitMQ config section | Remove or leave as unused stub |
| `configuration.ts` | MinIO config section | Remove or leave as unused stub |
| `configuration.ts` | Email/SMTP config section | Remove or leave as unused stub |

### Frontend — marked

| File | Area | Action in Phase 5B |
|------|------|-------------------|
| `AdminUsersPage.tsx` | Multi-tenant SaaS admin (create/suspend tenants) | Review: may be removed entirely for local install |

### Config/Infra — cloud-only (gitignored or not shipped)

| File | Status |
|------|--------|
| `docker-compose.prod.yml` | Marked; not shipped in installer |
| `docker/nginx/nginx.conf` | Marked; not shipped in installer |
| `kubernetes/manifests/` | Already gitignored; cloud orchestration |

---

## Admin Pages — Cloud SaaS vs Local License

### `AdminUsersPage.tsx` — Cloud SaaS only

Manages multi-tenant users (admin creates tenants, sets plans, manages
`subscriptionExpiry`). In 2.0 local deployment there is only one tenant
per install. **This page is cloud-only and should be removed in Phase 5B.**

### `AdminLicensesPage.tsx` — 2.0 RELEVANT (keep)

Manages Cloudflare License Server entries (create keys, set plans, unbind
machines, set expiry). This IS the 2.0 admin license management tool.
The admin uses this to issue licenses to customers. **Keep as-is.**

---

## AppModule — Module Status

File: `backend/src/app.module.ts`

| Module | Status | Notes |
|--------|--------|-------|
| `AuthModule` | Active | Keep — authentication needed |
| `UsersModule` | Active | Keep — user management |
| `FacebookAccountsModule` | Active | Keep — core feature |
| `VpnModule` | Active | Review in Phase 5B — VPN config for browser profiles? |
| `ChatScriptsModule` | Active | Keep — core feature |
| `SimpleTasksModule` | Active | Keep — core feature |
| `WarmupModule` | Active | Keep — core feature |
| `LicenseModule` | Active | Keep — local mode license heartbeat |
| `AdminLicensesModule` | Active | Keep — Cloudflare license admin |
| `VPNClientModule` | Commented out | Cloud VPN server management — remove permanently |
| `TaskSchedulerModule` | Commented out | Review — may be superseded by SimpleTasksModule |
| `TaskQueueModule` | Commented out | Cloud Bull queue — not needed locally |
| `TaskExecutorModule` | Commented out | Review in Phase 5B |
| `BullModule` | Active (app.module) | Cloud task queue — Phase 5B: remove if not used |

---

## docker-compose.local.yml (Created Phase 5A)

A minimal `docker-compose.local.yml` was created with **PostgreSQL + Redis only**.

- No RabbitMQ (cloud-only task queue)
- No MinIO (cloud object storage)
- No Nginx (local mode serves frontend via NestJS ServeStatic)
- No monitoring stack (Prometheus/Grafana/Loki)

For the **final Windows installer**, portable binaries in `installer/staging/pgsql/`
and `installer/staging/redis/` are used instead of Docker.
`docker-compose.local.yml` is for developers who prefer Docker.

---

## Installer Packaging Risks

| Risk | Details | Mitigation |
|------|---------|-----------|
| BullModule requires Redis | `app.module.ts` imports BullModule unconditionally | Phase 5B: make conditional on DEPLOY_MODE or remove |
| RabbitMQ config in env | `.env.local.example` has RabbitMQ URL | Remove from local example |
| MinIO/email config in env | `.env.local.example` has MinIO/email stubs | Remove from local example |
| VpnModule import | Still active in AppModule | Phase 5B: audit whether vpn/ handles browser proxy or server VPN |
| `ServeStaticModule` | Conditional on `SERVE_STATIC=true` | Good — add to installer .env |
| `DEPLOY_MODE` not set | Old default was `cloud`; now fixed to `local` | Fixed in Phase 5A |
| Cloud startup validation | `main.ts` checks JWT/DB secrets in cloud mode | Now bypassed in local mode correctly |

---

## Phase 5B Plan

1. Remove cloud DB branch from `SubscriptionGuard` (keep local branch only)
2. Remove `VPNClientModule` import from `AppModule` (and delete its unused service files)
3. Remove `VpnIntegrationModule` import (already commented out — delete files)
4. Remove or make optional: `BullModule`, `RabbitMQ` config
5. Remove `AdminUsersPage.tsx` or convert to local single-tenant equivalent
6. Audit `VpnModule` — is it used for browser proxy or VPS VPN? Keep or remove accordingly
7. Update `backend/.env.local.example` to remove cloud-only vars (RabbitMQ, MinIO, email SMTP)
8. Smoke-test: start backend in local mode, verify license activation flow works end-to-end

---

## Files Changed in Phase 5A

| File | Change |
|------|--------|
| `backend/src/common/guards/subscription.guard.ts` | Default DEPLOY_MODE: `cloud` → `local` |
| `backend/src/config/configuration.ts` | App name, TODO markers on RabbitMQ/MinIO/email |
| `backend/.env.local.example` | Added `DEPLOY_MODE=local` |
| `docker-compose.local.yml` | Created — PostgreSQL + Redis only |
| `docs/FAHUBX-2.0-LOCAL-HARDENING.md` | Created (this file) |
