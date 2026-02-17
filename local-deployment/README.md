# Local Deployment Guide

Run the full stack locally using Docker (Postgres, MinIO, nginx) with the backend on your host machine.

## Prerequisites

- **Docker Desktop** (with Docker Compose)
- **Python 3.11+**
- **Git Bash** or similar Unix-compatible shell on Windows

## Step 1: Start Infrastructure

```bash
cd local-deployment
docker compose up -d
```

This starts:
- **Postgres** on `localhost:5432` (user: `names`, password: `names`, db: `names`)
- **MinIO** on `localhost:9000` (API) and `localhost:9001` (web console)
- **nginx** on `localhost:80` (serves frontend, proxies `/api/` to backend)

The `minio-init` container automatically creates the `names-audio` bucket.

## Step 2: Set Up Python Environment

```bash
cd ../backend
python -m venv venv
source venv/Scripts/activate   # Windows Git Bash
# source venv/bin/activate     # Linux/Mac
pip install -r requirements.txt
```

## Step 3: Copy Environment File

```bash
cp ../local-deployment/.env .env
```

This configures the backend to use the local Postgres, MinIO, and disables secure cookies for HTTP.

## Step 4: Run Database Migrations

```bash
alembic upgrade head
```

## Step 5: Start the Backend

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Step 6: Open the App

Go to **http://localhost** in your browser.

- Register a new account
- Create a baby and add names
- Test the flashcard view, sharing, audio upload, etc.

## Useful URLs

| Service         | URL                        |
|-----------------|----------------------------|
| App             | http://localhost            |
| API docs        | http://localhost:8000/docs  |
| MinIO Console   | http://localhost:9001       |
| Health check    | http://localhost/api/health |

## Stopping

```bash
# Stop all containers (data is preserved in Docker volumes)
cd local-deployment
docker compose down

# To also wipe all data (Postgres + MinIO)
docker compose down -v
```

## Troubleshooting

**Login not working / cookie not sticking?**
Make sure the `.env` in `backend/` has `COOKIE_SECURE=false`. The `secure` cookie flag requires HTTPS, which we don't use locally.

**MinIO bucket not created?**
Check that the `minio-init` container ran: `docker compose logs minio-init`. You can also create it manually via the MinIO Console at http://localhost:9001 (login: `minioadmin` / `minioadmin`).

**"Connection refused" on API calls?**
Make sure uvicorn is running on port 8000. nginx proxies `/api/` to `host.docker.internal:8000` which resolves to your host machine.

**Port conflicts?**
If 5432, 9000, 9001, or 80 are already in use, update the port mappings in `docker-compose.yml`.
