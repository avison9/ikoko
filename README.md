# ìkókó

A baby name flashcard app for discovering, saving, and sharing meaningful names with pronunciation and cultural context.

## What it does

- **Create flashcard decks** for each baby, each containing name entries with meaning, phonetic spelling, passage/reference, and audio pronunciation
- **Interactive flip cards** — tap to reveal the meaning on the back
- **Audio playback** — hear the correct pronunciation for each name
- **Download cards** — export any name as an animated GIF (front flips to back in 5 seconds)
- **Share decks** — generate a shareable link + QR code for friends and family to view your name collection
- **Reactions** — react to shared decks with 12 emoji options (up to 10 per emoji per user); right-click to undo
- **Comments** — leave comments on any shared deck; owners see all feedback in the analytics page
- **Analytics dashboard** — view stats (names created, shared decks with view counts), manage collaborators, and browse all comments and reactions
- **Collaborators** — invite other users by username to co-edit a deck (add/edit/delete names)
- **Dark mode** — full light/dark theme toggle, persisted across sessions
- **Admin panel** — super-admin dashboard at `/admin` powered by SQLAdmin with full CRUD for all models (users, decks, names, comments, reactions, collaborators, view analytics); protected by session-based login with configurable credentials

## Architecture

```
                         +-----------+
                         |  Browser  |
                         +-----+-----+
                               |
                       HTTPS / Port 80,443
                               |
                   +-----------+-----------+
                   |        Nginx          |
                   |  (reverse proxy +     |
                   |   static file server) |
                   +-----------+-----------+
                        |             |
               /static/ |             | /api/*
           +---+---+    |    +--------+--------+
           |       |    |    |                  |
   +-------+--+ +--+---++  ++--------+         |
   | HTML     | | CSS   |  | FastAPI |         |
   | Pages    | | + JS  |  | (async) |         |
   |          | |       |  | Port 8000         |
   +----------+ +-------+  +---+-----+---------+
                                |     |
                   +------------+     +------------+
                   |                               |
           +-------+--------+            +--------+--------+
           |  PostgreSQL 16  |            |   MinIO / S3    |
           |                 |            |                 |
           |  - users        |            |  names-audio/   |
           |  - parents      |            |  (audio files)  |
           |  - children     |            |                 |
           +-----------------+            +-----------------+
```

### Frontend (vanilla HTML/CSS/JS)

No framework, no build step. Plain static files served by Nginx.

| Page             | File             | Purpose                                          |
|------------------|------------------|--------------------------------------------------|
| Login            | `login.html`     | JWT auth via HttpOnly cookie                     |
| Register         | `register.html`  | Account creation with country picker             |
| Dashboard        | `dashboard.html` | Grid of baby decks, CRUD, pagination             |
| Add Names        | `add.html`       | Add/edit name entries + audio upload              |
| View Flashcards  | `view.html`      | Flip cards, download GIF, share, react, comment  |
| Analytics        | `analytics.html` | Stats, collaborator management, feedback feed    |
| Guide            | `guide.html`     | How-to walkthrough                               |

### Backend (Python / FastAPI)

Async API with SQLAlchemy 2.0 + asyncpg.

| Module               | Purpose                                    |
|----------------------|--------------------------------------------|
| `app/main.py`        | FastAPI app entrypoint                     |
| `app/config.py`      | pydantic-settings (DB, JWT, S3, cookies, admin) |
| `app/models.py`      | SQLAlchemy models (User, Parent, Child, ParentView, Collaborator, Comment, Reaction) |
| `app/schemas.py`     | Pydantic request/response schemas          |
| `app/auth.py`        | Password hashing (argon2) + JWT creation   |
| `app/database.py`    | Async session factory                      |
| `app/dependencies.py`| Auth middleware (cookie → current user)    |
| `app/s3.py`          | S3/MinIO presigned URL + upload helpers    |
| `app/admin.py`       | SQLAdmin panel (auth + model views)        |
| `routers/auth_routes.py`   | Register, Login, Logout, Me         |
| `routers/parent_routes.py` | Baby deck CRUD, comments, reactions, collaborators |
| `routers/child_routes.py`  | Name entry CRUD + audio upload (owner + collaborator) |
| `routers/analytics_routes.py` | Analytics summary + feedback feed  |
| `routers/profile_routes.py`   | User profile management             |

### Data model

```
User (id, full_name, email, country, username, password_hash)
  |
  +--< Parent (id, user_id, label, created_at, updated_at)
  |     |
  |     +--< Child (id, parent_id, name, phonetic, meaning, passage, audio_key, sort_order)
  |     +--< Collaborator (id, user_id, parent_id)
  |     +--< Comment (id, user_id, parent_id, text, created_at)
  |     +--< Reaction (id, user_id, parent_id, emoji, created_at)  — up to 10 per user per emoji
  |     +--< ParentView (id, user_id, parent_id, viewed_at)  — view tracking for analytics
```

### Infrastructure

| Service    | Technology       | Purpose                            |
|------------|------------------|------------------------------------|
| Web server | Nginx            | Static files + reverse proxy       |
| API        | FastAPI + Uvicorn| REST API on port 8000              |
| Database   | PostgreSQL 16    | User data, decks, name entries     |
| Storage    | MinIO / AWS S3   | Audio pronunciation files          |
| Migrations | Alembic          | Database schema migrations         |
| Admin      | SQLAdmin         | Super-admin CRUD panel at `/admin` |

## Local development

```bash
# Start Postgres + MinIO + Nginx
cd local-deployment
docker compose up -d

# Set up backend
cd ../backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt

# Run migrations
alembic upgrade head

# (Optional) Seed sample data
python seed_data.py

# Start API server
uvicorn app.main:app --reload --port 8000
```

Then open `http://localhost` in your browser.

## Production deployment

- Nginx serves the frontend and proxies `/api/` to Uvicorn
- TLS via Let's Encrypt (see `nginx/names.conf`)
- Environment variables configured in `backend/.env`

## Tech stack

| Layer     | Technology                                           |
|-----------|------------------------------------------------------|
| Frontend  | HTML, CSS (custom properties), vanilla JavaScript    |
| Backend   | Python 3.11, FastAPI, SQLAlchemy 2.0 (async)        |
| Database  | PostgreSQL 16                                        |
| Storage   | AWS S3 / MinIO                                       |
| Auth      | JWT (HttpOnly cookies), argon2 password hashing      |
| Admin     | SQLAdmin (session-based auth, full CRUD)             |
| Infra     | Docker Compose, Nginx, Alembic                       |
| CDN libs  | html2canvas, gif.js, qrcode (view page only)        |
