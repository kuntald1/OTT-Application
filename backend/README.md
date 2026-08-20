# theomy backend

FastAPI backend for theomy — registration, login, and Google/Facebook social login.

## What this gives you

- `POST /api/auth/register` — name, email, password (min 8 chars), phone (optional), role
- `POST /api/auth/login` — email + password → JWT
- `GET  /api/auth/me` — current user, requires `Authorization: Bearer <token>`
- `GET  /api/auth/google/login` — redirects to Google's consent screen
- `GET  /api/auth/google/callback` — Google redirects here after consent
- `GET  /api/auth/facebook/login` — redirects to Facebook's consent screen
- `GET  /api/auth/facebook/callback` — Facebook redirects here after consent
- `GET  /api/health` — health check

Passwords are hashed with bcrypt before touching the database. No endpoint
ever returns `hashed_password` — the `UserOut` schema doesn't have that field
at all, so it physically cannot appear in a response payload.

## Local setup (Windows, PowerShell)

```powershell
cd D:\Kuntal\movix-hero\movix-hero
mkdir backend
# copy all these files into D:\Kuntal\movix-hero\movix-hero\backend

cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

copy .env.example .env
# edit .env with real values (Google/Facebook secrets, DB password)
```

For local testing, the backend can point at the same remote Postgres on the
server (`DB_HOST=200.234.40.38`) if you open port 5432 to your IP, or you can
run a local Postgres for dev and point `DB_HOST=localhost`.

Run it locally:
```powershell
uvicorn app.main:app --reload --port 8010
```

## Deploying to the server

```bash
cd /var/www/movix-src
git pull origin main
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
nano .env   # fill in real secrets — DB_HOST=localhost since Postgres is on this same server
```

### Run as a systemd service (so it survives reboots/crashes)

Create `/etc/systemd/system/theomy-backend.service`:

```ini
[Unit]
Description=theomy FastAPI backend
After=network.target postgresql.service

[Service]
User=rednose
WorkingDirectory=/var/www/movix-src/backend
Environment="PATH=/var/www/movix-src/backend/venv/bin"
ExecStart=/var/www/movix-src/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8010
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable theomy-backend
sudo systemctl start theomy-backend
sudo systemctl status theomy-backend
```

### Add to Nginx config (`/etc/nginx/sites-available/theomy.com`)

Add this block **inside** the existing `server { ... }` block, alongside the
existing `location /` block that serves the frontend:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8010/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

After this, `https://theomy.com/api/auth/register` etc. will reach the
backend, and `https://theomy.com/api/auth/google/callback` will match what
you configured in the Google/Facebook OAuth consoles.

## Frontend integration notes

- Registration form should `POST` to `/api/auth/register` with
  `{ name, email, password, phone, role }`.
- "Continue with Google" button should navigate the browser to
  `/api/auth/google/login` (a full page redirect, not a fetch call).
- Same for Facebook → `/api/auth/facebook/login`.
- After a successful social login, the backend redirects to
  `https://theomy.com/auth/callback?token=...` — the frontend needs a route
  at `/auth/callback` that reads the `token` query param, stores it, and
  redirects the user into the app.
