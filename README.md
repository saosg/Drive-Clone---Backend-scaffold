# Drive Clone — Backend scaffold

This workspace contains a TypeScript + Express backend scaffold for a Google Drive-like project.

Quick start (requires Docker):

```bash
docker-compose up --build
```

Dev (local):

```bash
npm install
npm run dev
```

Prisma schema is in `prisma/schema.prisma`.

Kubernetes

Apply manifests in `k8s/` to deploy to a cluster (simple examples):

```bash
kubectl apply -f k8s/
```

Tests

```bash
npm ci
npm test
```

## System Architecture

The backend is a production-lean, scalable TypeScript + Express service providing file metadata, resumable uploads, object storage, background processing, and ACLs. The diagram below shows the main runtime components and integrations.

```mermaid
flowchart LR
	User[User / Client]
	API[Drive Clone API (Express + TypeScript)]
	Postgres[(Postgres)]
	MinIO[(MinIO - S3 API)]
	Redis[(Redis - BullMQ / Metadata)]
	Worker[Background Worker]
	Google[Google OAuth]
	GitHub[GitHub OAuth]

	User -->|HTTP/HTTPS (REST / signed URLs)| API
	API -->|Prisma ORM| Postgres
	API -->|S3 (AWS SDK v3)| MinIO
	API -->|Enqueue jobs (BullMQ)| Redis
	Worker -->|Consume jobs (BullMQ)| Redis
	Worker -->|Read/Write objects| MinIO
	API -->|OAuth flows| Google
	API -->|OAuth flows| GitHub
	API -.->|Signed URLs| User
```

## Components

- **API (src/)**: Express app in TypeScript handling auth, file metadata, upload APIs (single & multipart), ACLs, sharing, and signed downloads.
- **Prisma**: ORM layer with schema in `prisma/schema.prisma` (models: `User`, `File`, `Folder`, `Share`, `FilePermission`, `Role`).
- **Object Storage (MinIO)**: S3-compatible storage used for file parts and final objects.
- **Redis + BullMQ**: Redis stores upload part metadata and queues background jobs for processing (thumbnailing, virus scan, post-processing).
- **Worker (src/worker.ts)**: Background process that consumes jobs and processes objects from MinIO.
- **OAuth Providers**: Google and GitHub strategies are configured (see `src/passport.ts`) — credentials required in environment.
- **Docker / k8s / Helm**: Local `docker-compose.yml`, example `k8s/` manifests, and a Helm chart at `helm/drive-clone` for cluster deployment.

## Quickstart — Local (development)

1. Install dependencies:

```bash
npm ci
npx prisma generate
```

2. Start local services for development (Postgres, MinIO, Redis, app):

```bash
docker-compose up --build
```

3. Run database migrations (first-time):

```bash
npx prisma migrate dev --name init
```

4. Start the app in dev mode:

```bash
npm run dev
```

## Environment variables

Provide these via `.env` or your environment/secret management. Check `src/config.ts` for exact names used by the code.

- `DATABASE_URL` — Postgres connection string (e.g. `postgresql://user:pass@localhost:5432/dbname`).
- `MINIO_ENDPOINT` — MinIO endpoint (host:port).
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` or `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` — MinIO credentials.
- `JWT_SECRET` — Secret used to sign JWTs.
- `REDIS_URL` — Redis connection string (e.g. `redis://localhost:6379`).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth credentials.
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth credentials.
- `NODE_ENV` — `development` | `production`.

## Running Tests

Unit tests mock external services (Prisma, S3, Redis) and run via Jest.

```bash
npm test
```

Integration tests and end-to-end demos require live stack (docker-compose):

```bash
docker-compose up --build -d
# wait until Postgres/MinIO/Redis healthy
npx prisma migrate dev --name init
npm test
node scripts/demo_e2e.js http://localhost:3000 ./path/to/largefile
```

## Demo scripts

- `scripts/multipart_demo.js` — demonstrates client-side multipart uploads against the multipart API.
- `scripts/demo_e2e.js` — registers a user, logs in, and runs a multipart upload using the API and JWT.

## Deployment

Kubernetes manifests are available in `k8s/` for simple examples. For Helm-based deployments use the `helm/drive-clone` chart. The chart includes templates for:

- App `Deployment` and `Service` with liveness/readiness probes and resource requests/limits.
- `Secret` (see `templates/secrets.yaml`) for Postgres and MinIO credentials.
- PersistentVolumeClaims for Postgres and MinIO (parameterized in `values.yaml`).

Example Helm install (requires configured values/secrets):

```bash
helm install drive-clone helm/drive-clone --values my-values.yaml
```

Notes for production:

- Provide Kubernetes `Secret` values for DB and MinIO (the Helm chart will create a Secret when `values.secrets` are set).
- Configure storage classes and PVC sizes appropriate to your cluster.
- Ensure `JWT_SECRET` and OAuth client secrets are injected securely (not in plain YAML).

## Features

- JWT authentication + OAuth (Google, GitHub)
- File & folder metadata with Prisma models
- Resumable multipart uploads (uses MinIO S3 multipart API)
- Background processing via BullMQ and a worker
- Sharing and ACLs per-file
- Signed URLs for direct object access
- Docker Compose + Kubernetes + Helm manifests
- Unit & integration tests + CI workflows

## Caveats & Next steps

- The worker currently writes files to local `tmp` during processing — in production, use streaming and ephemeral storage or cloud-native processors.
- OAuth flows require valid client IDs/secrets and correct callback URLs.
- Consider adding health-check wait logic to CI/integration scripts to avoid flakiness when services are slow to start.

## Where to look in the repo

- API entry: `src/app.ts` and `src/index.ts` ([src/app.ts](src/app.ts#L1), [src/index.ts](src/index.ts#L1))
- Prisma schema: `prisma/schema.prisma` (see model definitions)
- Upload APIs & ACLs: `src/routes/files.ts` ([src/routes/files.ts](src/routes/files.ts#L1))
- Auth & OAuth: `src/routes/auth.ts`, `src/passport.ts` ([src/passport.ts](src/passport.ts#L1))
- Worker: `src/worker.ts` ([src/worker.ts](src/worker.ts#L1))
- Helm chart: `helm/drive-clone/` (templates and `values.yaml`)

---

If you'd like, I can also:

- Add a rendered SVG of the Mermaid diagram into the repo (pre-rendered for README viewers that don't support mermaid).
- Populate `values.yaml` example with production-ready defaults.
- Add a short troubleshooting section for common startup issues.

