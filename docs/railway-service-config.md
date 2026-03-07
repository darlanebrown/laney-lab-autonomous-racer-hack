# Railway Service Config Baseline

Last verified: March 7, 2026

This project runs three Railway services in one project:
- `laney-lab-autonomous-racer-hack` (simulator)
- `shared-runs-api` (API)
- `trainer-worker` (trainer)

Use this as the source of truth to avoid service config drift.

## Expected Service Settings

### 1) Simulator (`laney-lab-autonomous-racer-hack`)
- Repo: `JekaJeka1627/laney-lab-autonomous-racer-hack`
- Root Directory: `/simulator`
- Config file: `simulator/railway.json`
- Builder: `DOCKERFILE`
- Dockerfile path: `simulator/Dockerfile`
- Build Command override: none
- Start Command override: none
- Restart policy: `ON_FAILURE`, max retries `10`
- Healthcheck path: `/`

### 2) API (`shared-runs-api`)
- Repo: `JekaJeka1627/laney-lab-autonomous-racer-hack`
- Root Directory: `/services/api`
- Config file: `services/api/railway.json`
- Builder: `DOCKERFILE`
- Dockerfile path: `Dockerfile`
- Build Command override: none
- Start Command override: none
- Restart policy: `ON_FAILURE`, max retries `10`
- Healthcheck path: `/health`
- Volume mount: `/data`

### 3) Trainer (`trainer-worker`)
- Repo: `JekaJeka1627/laney-lab-autonomous-racer-hack`
- Root Directory: `/services/trainer`
- Config file: `services/trainer/railway.json`
- Builder: `DOCKERFILE`
- Dockerfile path: `Dockerfile`
- Build Command override: none
- Start Command override: none
- Restart policy: `ON_FAILURE`, max retries `10`

## Fast Drift Check

In Railway UI, for each service:
1. Open `Settings -> Source`.
2. Confirm repo + root directory match above.
3. Open `Settings -> Build`.
4. Confirm builder is `Dockerfile` and Dockerfile path matches above.
5. Ensure custom `Build Command` is empty.
6. Open `Settings -> Deploy`.
7. Ensure custom `Start Command` is empty (unless intentionally required).

## Known Failure Modes

### Wrong service accidentally builds simulator
Symptom:
- Build logs show `cd simulator && npm install && npm run build` on `trainer-worker`.

Fix:
- Set trainer root dir to `/services/trainer`.
- Set builder to Dockerfile and clear custom build/start overrides.

### Simulator Docker build succeeds but app build fails
Symptom:
- Docker steps run correctly, but `npm run build` fails in app code.

Current known app error (March 7, 2026):
- `simulator/src/components/game/Track3D.tsx`:
  `Property 'ellipseGeometry' does not exist on type 'JSX.IntrinsicElements'.`

This is a TypeScript/React Three Fiber typing issue in app code, not a Railway infra issue.

