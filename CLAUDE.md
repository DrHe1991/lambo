# BitLink — Project Guide for Claude Code

## What Is This?

BitLink is a crypto-native social media platform where "liking = investing." Early likers of quality content earn revenue as the content gains more likes. Think Twitter/X meets Bitcoin investment mechanics.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, Zustand 5, TipTap 3 |
| API | Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic |
| Pay Service | Python 3.12, FastAPI, tronpy (TRON), python-binance |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Mobile | Capacitor (Android, app ID: `com.bitlink.app`) |
| Infra | Docker Compose |

## Project Structure

```
lambo/
├── api/                  # Main backend (FastAPI)
│   ├── app/
│   │   ├── main.py       # Entry point
│   │   ├── config.py     # Settings (pydantic-settings)
│   │   ├── models/       # SQLAlchemy models
│   │   ├── routes/       # API route handlers
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── services/     # Business logic
│   │   └── tasks/        # Background tasks
│   └── alembic/          # DB migrations
├── pay/                  # Crypto payment microservice (FastAPI)
│   ├── app/
│   │   ├── models/       # Wallet, Deposit, Withdrawal, Exchange models
│   │   ├── routes/       # Payment endpoints
│   │   └── services/     # TRON, HD wallet, exchange, CEX, scheduler
│   └── alembic/
├── ui/                   # React frontend
│   ├── App.tsx           # Main app (state-based view routing, no React Router)
│   ├── api/client.ts     # All HTTP calls
│   ├── components/       # UI components
│   ├── stores/           # Zustand stores (user, post, chat, wallet)
│   └── hooks/            # Custom hooks (e.g., useChatWebSocket)
├── simulator/            # Simulation tool (not a service)
├── x-agent/              # X/Twitter agent (not a running service)
└── docker-compose.yml    # Orchestrates all services
```

## Running the Project

```bash
docker-compose up                    # Full stack (postgres:5435, redis:6380, api:8003, ui:3003, pay:8005)
cd ui && npm run dev                 # Frontend only (port 3003)
cd api && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload  # API only
```

## Key Conventions

- **No auth enforced yet** — user ID is passed as query param (`?user_id=1`). Google OAuth + JWT planned.
- **Frontend routing** — state-based views in App.tsx, NOT React Router.
- **API prefix** — all main API routes under `/api/...`.
- **Pay service** — separate microservice; API calls it internally via `PAY_SERVICE_URL`.
- **DB tables** — API models use no prefix; pay models use `pay_` prefix. Both share the same PostgreSQL database.
- **Migrations** — Alembic in both `api/alembic/` and `pay/alembic/`.
- **Like mechanics** — likes have dynamic cost, 1-hour lock, weight components, and settlement via cron.
- **Chat** — WebSocket at `/api/chat/ws/{user_id}` with auto-reconnect and 30s keep-alive pings.

## Important Files

- `api/app/config.py` — API settings (DB, Redis, pay URL, AI keys)
- `pay/app/config.py` — Pay settings (TRON, Binance, reserve ratios)
- `ui/api/client.ts` — All frontend API calls in one file
- `ui/types.ts` — Shared TypeScript types
- `docker-compose.yml` — Service definitions and ports

## Background Tasks

- **Cron container**: Every 60s → `POST /api/settlement/settle-likes?batch_size=100`
- **Pay deposit monitor**: Polls every 10s for new TRON deposits
- **Pay scheduler**: Reserve rebalance (12h), reserve snapshot (5m)

## Design Context

### Users
Broad spectrum: crypto-native Gen Z/Millennials, mainstream social users, content creators, and investors. Mobile-first, casual-but-consequential context — every tap has real monetary weight.

### Brand Personality
**Bold. Rebellious. Real.** Anti-establishment social platform with swagger. Confidence of early Bitcoin culture + addictiveness of a great social feed. Not a bank, not a DeFi dashboard.

### Aesthetic Direction
- **Tone**: Bold, high-contrast, opinionated — between streetwear brand and premium social app
- **Theme**: Dark mode default (warm, tinted — not pure black), light mode supported
- **Colors**: Orange/amber brand accent. Warm-tinted neutrals. No cyan-on-dark or purple gradients
- **Typography**: Distinctive font pairing needed (NOT Inter/Roboto/Open Sans)
- **Anti-references**: Generic DeFi dashboards, childish gamification, minimalist-to-empty
- **Channel**: Cash App confidence, early Twitter energy, Medium editorial quality, crypto culture edge

### Design Principles
1. **Every tap has weight** — actions matter, clear feedback, honest microcopy
2. **Distinctive, not decorative** — no gratuitous gradients/glows. Every element earns its place
3. **Mobile-first, touch-native** — thumbs not mice, generous tap targets, no hover-dependence
4. **Warm rebellion** — dark mode = warm and inviting, not cold/techy. Cool friend, not hacker terminal
5. **Trust through consistency** — same action looks the same everywhere. Financial UX demands reliability
