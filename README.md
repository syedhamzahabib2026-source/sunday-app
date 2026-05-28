# Sunday V1

Sunday is an AI-powered weekly planning assistant that integrates with Slack to help teams reflect, prioritize, and plan their week.

## Project Structure

```
sunday-app/
├── backend/        # Python FastAPI service
│   ├── app/
│   │   ├── models/     # SQLAlchemy database models
│   │   ├── routers/    # FastAPI route handlers
│   │   ├── engines/    # AI/planning logic engines
│   │   └── slack/      # Slack Bolt event handlers
│   ├── main.py         # App entrypoint (port 8080)
│   ├── requirements.txt
│   └── .env.example
└── frontend/       # Next.js 14 app (TypeScript + Tailwind + shadcn/ui)
```

## Backend

### Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
cp .env.example .env         # fill in your credentials
uvicorn main:app --reload --port 8080
```

### Health check

```
GET http://localhost:8080/health
→ {"status": "ok"}
```

## Frontend

### Setup

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:3000`.

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable              | Description                        |
|-----------------------|------------------------------------|
| `SLACK_BOT_TOKEN`     | OAuth bot token from Slack app     |
| `SLACK_SIGNING_SECRET`| Signing secret from Slack app      |
| `DATABASE_URL`        | PostgreSQL connection string       |
