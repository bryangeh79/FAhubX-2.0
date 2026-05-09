# FAhubX 2.0 — Installer Readiness Audit

**Date:** 2026-05-10
**Phase:** 6B — Config fixes and staging rebuild (updated)
**Auditor:** CC Runner (automated)
**Backend TypeScript:** `npx tsc --noEmit` → **ZERO ERRORS** ✅

---

## Phase 6B Changes (2026-05-10)

| Item | Before | After |
|------|--------|-------|
| `.iss` app name | `"FAhubX"` | `"FAhubX 2.0"` |
| `.iss` version | `"1.4.2"` | `"2.0.0"` |
| `.iss` install dir | `C:\FAhubX` | `C:\FAhubX2` (avoids 1.0 conflict) |
| `generate-env.js` APP_NAME | `FAhubX` | `FAhubX 2.0` |
| `build-backend.bat` Puppeteer | `C:\FAhubX` fallback | Project-relative only |
| Backend staging | Stale (pre-Phase-5) | **Rebuilt** ✅ |
| Frontend staging | Stale (had AdminUsersPage) | **Rebuilt** ✅ (0 AdminUsersPage chunks) |
| Bull in staged package.json | Not verified | **0 references** ✅ |
| Puppeteer-cache in staging | Present (old) | **Missing** ⚠️ (no source; downloads on first run) |

---

## Overall Status

| Category | Status | Notes |
|----------|--------|-------|
| Backend source | ✅ Ready | TypeScript passes, local-mode defaults set |
| Backend package-lock | ✅ Reconciled | Updated Phase 6A |
| Frontend source | ✅ Ready | AdminUsersPage route disabled |
| Installer script (.iss) | ✅ Updated | Version 2.0.0, name FAhubX 2.0, dir C:\FAhubX2 |
| Staging: Node.js | ✅ Present | v20.18.0 (node.exe staged) |
| Staging: PostgreSQL | ✅ Present | Portable binaries staged |
| Staging: Redis | ✅ Present | Portable binaries staged |
| Staging: Backend | ✅ Rebuilt (Phase 6B) | Fresh dist, 0 bull packages |
| Staging: Frontend | ✅ Rebuilt (Phase 6B) | 0 AdminUsersPage chunks |
| Staging: Puppeteer | ⚠️ Missing | Chromium auto-downloads on first run |
| Runtime scripts | ✅ Present | start.bat, stop.bat, init-db.bat, fahubx.bat |
| env generator | ✅ Fixed (Phase 6B) | APP_NAME=FAhubX 2.0; SERVE_STATIC + LICENSE_SERVER_URL present |
| obfuscate.js | ✅ Present | `installer/obfuscate.js` exists |
| build.bat pipeline | ✅ Ready | Orchestrates all 4 build phases |

---

## Backend Readiness

### Source (`backend/`)

| Item | Status |
|------|--------|
| TypeScript compile | ✅ PASS — zero errors |
| `DEPLOY_MODE` default | ✅ `'local'` (changed Phase 5A) |
| `APP_NAME` default | ✅ `'FAhubX 2.0'` (changed Phase 5A) |
| BullModule | ✅ Removed (Phase 5E) |
| Cloud DB subscription branch | ✅ Removed (Phase 5C) |
| VPN client/integration modules | ✅ Removed (Phase 5D) |
| `@nestjs/bull`, `bull` in package.json | ✅ Removed (Phase 5E) |
| `package-lock.json` | ✅ Reconciled (Phase 6A via `npm install --legacy-peer-deps`) |

### Build script (`installer/build-backend.bat`)

| Step | Status |
|------|--------|
| `npm ci --legacy-peer-deps` | ✅ Handles peer-dep conflicts |
| `npx nest build` | ✅ TypeScript compiles cleanly |
| `node obfuscate.js` | ✅ obfuscate.js present |
| Stage dist + node_modules | ✅ Script present |
| `npm prune --production` | ✅ Removes dev deps from staging |
| Copy puppeteer-cache | ⚠️ Falls back to `C:\FAhubX\backend\puppeteer-cache` (1.0 path) |

**Puppeteer cache note:** `build-backend.bat` first checks `C:\FAhubX\backend\puppeteer-cache`
(FAhubX 1.0 local runtime), then `backend\puppeteer-cache`. The 1.0 fallback is a
convenience for build machines that have 1.0 installed. On a clean build machine,
`backend/puppeteer-cache/` must exist (run `node -e "require('puppeteer')"` once
to trigger download). Consider updating `build-backend.bat` to remove the 1.0 path
reference for clarity.

### Staging backend (`installer/staging/backend/`)

| Item | Status |
|------|--------|
| `dist/` directory | ⚠️ EXISTS but STALE — built before Phase 5 cleanup |
| `node_modules/` | ⚠️ EXISTS but may include old bull packages |
| `package.json` | ⚠️ May be old version (before bull removal) |
| `database/` | ✅ Present (migration scripts) |
| `scripts/` | ✅ Present |
| `puppeteer-cache/` | ✅ Present (Chromium bundled) |

**Action required for Phase 6B:** Delete `installer/staging/backend/` contents and
re-run `installer/build-backend.bat` to produce a clean 2.0-ready build.

---

## Frontend Readiness

### Source (`frontend/`)

| Item | Status |
|------|--------|
| Package name | ✅ `fahubx-2-frontend` |
| Build script | ✅ `npm run build` → `tsc && vite build` |
| AdminUsersPage | ✅ Route disabled in App.tsx (Phase 5C) |
| AdminLicensesPage | ✅ Active (2.0 admin tool) |
| ActivationPage | ✅ Active (local license flow) |
| i18n | ✅ en/zh/vi present |

### Build script (`installer/build-frontend.bat`)

| Item | Status |
|------|--------|
| Script exists | ✅ Present |

### Staging frontend (`installer/staging/frontend/dist/`)

| Item | Status |
|------|--------|
| `index.html` | ✅ Present |
| JS/CSS assets | ⚠️ STALE — still includes `AdminUsersPage-0480fb24.js` chunk |
| Build is stale | ⚠️ Built before Phase 5C route disable |

**Action required for Phase 6B:** Delete `installer/staging/frontend/` and re-run
`installer/build-frontend.bat` to produce a clean build without the AdminUsersPage chunk.

---

## Installer Script Readiness

### `installer/fahubx-setup.iss`

| Item | Current | Required | Status |
|------|---------|----------|--------|
| `MyAppName` | `"FAhubX"` | `"FAhubX 2.0"` | ⚠️ Update needed |
| `MyAppVersion` | `"1.4.2"` | `"2.0.0"` | ⚠️ Update needed |
| `OutputBaseFilename` | `FAhubX-Setup-v1.4.2` | `FAhubX-2.0-Setup-v2.0.0` | ⚠️ Derived |
| `DefaultDirName` | `C:\FAhubX` | Should remain `C:\FAhubX` or change to `C:\FAhubX2` | Discuss |
| Staging sources | All present in staging | — | ✅ |
| Language files | en + zh | — | ✅ |
| Port wizard pages | Present | — | ✅ |
| Deploy mode wizard | Local/Cloud options | — | ✅ (though cloud should be de-emphasized) |
| Desktop icon | `assets\fahubx.ico` | — | ✅ |
| Inno Setup required | ISCC.exe 6.x | Must be installed on build machine | ✅ (checked in build.bat) |

**Note on `DefaultDirName`:** Currently `C:\FAhubX`. FAhubX 1.0 local runtime is
also at `C:\FAhubX`. Changing to `C:\FAhubX2` or `C:\FAhubX-2.0` would avoid
conflict on machines that have 1.0 installed.

---

## Staging Asset Inventory

| Asset | Path | Status | Version |
|-------|------|--------|---------|
| Node.js runtime | `installer/staging/node/` | ✅ Present | v20.18.0 |
| PostgreSQL binaries | `installer/staging/pgsql/` | ✅ Present | (existing) |
| Redis binaries | `installer/staging/redis/` | ✅ Present | (existing) |
| Backend dist | `installer/staging/backend/dist/` | ⚠️ Stale | Pre-Phase-5 |
| Backend node_modules | `installer/staging/backend/node_modules/` | ⚠️ Stale | May include bull |
| Backend puppeteer-cache | `installer/staging/backend/puppeteer-cache/` | ✅ Present | Chromium bundled |
| Frontend dist | `installer/staging/frontend/dist/` | ⚠️ Stale | Pre-Phase-5C |

---

## Required Scripts Checklist

| Script | Path | Status |
|--------|------|--------|
| Service launcher | `installer/scripts/start.bat` | ✅ Complete |
| Service stopper | `installer/scripts/stop.bat` | ✅ Present |
| Desktop shortcut | `installer/scripts/fahubx.bat` | ✅ Complete |
| DB initialization | `installer/scripts/init-db.bat` | ✅ Complete |
| Env generator | `installer/scripts/generate-env.js` | ✅ Complete |
| Redis config | `installer/scripts/redis.conf` | ✅ Present |
| Master build | `installer/build.bat` | ✅ Complete |
| Backend build | `installer/build-backend.bat` | ✅ Complete |
| Frontend build | `installer/build-frontend.bat` | ✅ Present |
| JS obfuscator | `installer/obfuscate.js` | ✅ Present |
| Icon | `installer/assets/fahubx.ico` | ✅ Present |

---

## Required Local Production Env Checklist

`installer/scripts/generate-env.js` generates the backend `.env` at install time.

| Env var | Generated | Notes |
|---------|-----------|-------|
| `NODE_ENV=production` | ✅ | Hardcoded |
| `DEPLOY_MODE=local` | ✅ | Default arg is 'local' |
| `APP_NAME=FAhubX` | ⚠️ | Should be `FAhubX 2.0` |
| `PORT` | ✅ | From wizard |
| `DB_HOST=127.0.0.1` | ✅ | Local only |
| `DB_PORT` | ✅ | From wizard |
| `DB_NAME=fbautobot` | ✅ | Hardcoded |
| `DB_USER=postgres` | ✅ | Local postgres |
| `DB_PASSWORD` | ✅ | Auto-generated strong password |
| `REDIS_HOST=127.0.0.1` | ✅ | Local only |
| `REDIS_PORT` | ✅ | From wizard |
| `JWT_SECRET` | ✅ | Auto-generated 64-char hex |
| `ENCRYPTION_KEY` | ✅ | Auto-generated 32-char hex |
| `SESSION_SECRET` | ✅ | Auto-generated 48-char hex |
| `SERVE_STATIC=true` | ❌ MISSING | Must be set for NestJS to serve frontend |
| `LICENSE_SERVER_URL` | ❌ MISSING | Must point to Cloudflare license server |

**Critical env gaps:** `SERVE_STATIC=true` and `LICENSE_SERVER_URL` are not generated
by `generate-env.js`. Without `SERVE_STATIC=true`, the frontend won't be served from
the backend. Without `LICENSE_SERVER_URL`, license heartbeat will use the hardcoded
default in `license.service.ts`. Both must be added to `generate-env.js`.

---

## Package-lock / Dependency Status

| Item | Status |
|------|--------|
| `@nestjs/bull` in package.json | ✅ Removed (Phase 5E) |
| `bull` in package.json | ✅ Removed (Phase 5E) |
| `package-lock.json` reconciled | ✅ Updated via `npm install --legacy-peer-deps` (Phase 6A) |
| `ioredis`, `@nestjs-modules/ioredis` | ✅ Kept (Redis required for local runtime) |

---

## Risks Before Packaging

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Stale backend staging dist (includes bull) | HIGH | Rebuild before compiling installer |
| Stale frontend staging dist (includes AdminUsersPage JS) | HIGH | Rebuild before compiling installer |
| `.iss` version still "1.4.2" | HIGH | Update to "2.0.0" before compile |
| `.iss` name still "FAhubX" | MEDIUM | Update to "FAhubX 2.0" |
| `SERVE_STATIC=true` missing from generate-env.js | HIGH | Add to env template or hardcode in script |
| `LICENSE_SERVER_URL` missing from generate-env.js | HIGH | Add with default value |
| `DefaultDirName=C:\FAhubX` conflicts with 1.0 on same machine | MEDIUM | Change to `C:\FAhubX2` or parameterize |
| `build-backend.bat` references `C:\FAhubX` for Puppeteer | LOW | Document or update to 2.0 path only |
| `APP_NAME=FAhubX` in generate-env.js | LOW | Update to "FAhubX 2.0" |
| Puppeteer-cache presence required at build time | MEDIUM | Ensure `backend/puppeteer-cache/` populated before build |

---

## Recommended Phase 6B Action Plan

### Step 1 — Update installer identity (1.iss + env gen)
```
installer/fahubx-setup.iss:
  MyAppName  = "FAhubX 2.0"
  MyAppVersion = "2.0.0"
  DefaultDirName = C:\FAhubX2

installer/scripts/generate-env.js:
  APP_NAME=FAhubX 2.0
  add: SERVE_STATIC=true
  add: LICENSE_SERVER_URL=https://license.starbright-solutions.com

installer/build-backend.bat:
  Remove C:\FAhubX puppeteer-cache fallback reference
```

### Step 2 — Rebuild backend staging (clear stale dist)
```bat
cd installer
rmdir /s /q staging\backend
call build-backend.bat
```
Prerequisites:
- `backend/puppeteer-cache/` must exist (run Puppeteer download once)
- Inno Setup 6 installed

### Step 3 — Rebuild frontend staging (clear stale dist)
```bat
cd installer
rmdir /s /q staging\frontend
call build-frontend.bat
```

### Step 4 — Compile installer
```bat
cd installer
"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" fahubx-setup.iss
```
Output: `installer/output/FAhubX-2.0-Setup-v2.0.0.exe`

### Step 5 — Test on clean Windows VM
1. Run installer on a clean Windows 10/11 x64 VM (no Node, no PostgreSQL, no Redis)
2. Complete wizard (Local mode, accept default ports)
3. Verify license activation page appears
4. Enter test license key `FAH-R4SD-7F4E-V9AW`
5. Verify all FAhubX features accessible after activation
6. Verify start.bat / stop.bat work correctly

---

## Files Changed by Phase 6A

| File | Change |
|------|--------|
| `backend/package-lock.json` | Reconciled via `npm install --legacy-peer-deps` |
| `docs/FAHUBX-2.0-INSTALLER-READINESS.md` | Created (this file) |
