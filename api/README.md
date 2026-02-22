# BitLink API

Python FastAPI backend for BitLink social platform.

## Quick Start

### With Docker (Recommended)

```bash
# From project root
docker compose up -d

# API runs at http://localhost:8001
# Swagger docs at http://localhost:8001/docs
```

### Local Development

```bash
cd api

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start Postgres and Redis (via Docker)
docker compose up -d postgres redis

# Run migrations
alembic upgrade head

# Start dev server
uvicorn app.main:app --reload
```

## Project Structure

```
api/
├── app/
│   ├── main.py           # FastAPI app entry point
│   ├── config.py         # Settings from environment
│   ├── db/
│   │   └── database.py   # SQLAlchemy setup
│   ├── models/           # SQLAlchemy models
│   │   ├── user.py
│   │   ├── post.py
│   │   └── chat.py
│   ├── routes/           # API endpoints
│   │   ├── users.py
│   │   ├── posts.py
│   │   └── chat.py
│   └── schemas/          # Pydantic schemas
│       ├── user.py
│       ├── post.py
│       └── chat.py
├── alembic/              # Database migrations
├── tests/                # Pytest tests
├── requirements.txt
└── Dockerfile
```

## API Endpoints

### Users
- `POST /api/users` - Create user
- `GET /api/users/{id}` - Get user by ID
- `GET /api/users/handle/{handle}` - Get user by handle
- `PATCH /api/users/{id}` - Update user
- `POST /api/users/{id}/follow` - Follow user
- `DELETE /api/users/{id}/follow` - Unfollow user
- `GET /api/users/{id}/followers` - Get followers
- `GET /api/users/{id}/following` - Get following

### Posts
- `POST /api/posts` - Create post
- `GET /api/posts` - List posts (with filters)
- `GET /api/posts/feed` - Get following feed
- `GET /api/posts/{id}` - Get single post
- `PATCH /api/posts/{id}` - Update post
- `DELETE /api/posts/{id}` - Delete post
- `POST /api/posts/{id}/comments` - Add comment
- `GET /api/posts/{id}/comments` - Get comments
- `POST /api/posts/{id}/like` - Like post

### Chat
- `POST /api/chat/sessions` - Create chat session
- `GET /api/chat/sessions` - List user's sessions
- `GET /api/chat/sessions/{id}` - Get session details
- `POST /api/chat/sessions/{id}/messages` - Send message
- `GET /api/chat/sessions/{id}/messages` - Get messages

## Commands

```bash
# Linting
ruff check .
ruff format .

# Tests
pytest -v

# Migrations
alembic revision --autogenerate -m "description"
alembic upgrade head
alembic downgrade -1
```

## Environment Variables

See `.env.example` for all available options.
