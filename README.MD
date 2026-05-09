# Reelwright

Reelwright turns any product URL into a short-form video ad using an AI agent.

## Local development

Backend:

```bash
cd apps/backend
uvicorn main:app --host 0.0.0.0 --port 8084 --reload
```

Frontend:

```bash
cd apps/frontend
npm run dev
```

## VPS Deployment Plan

Target ports:

- Frontend: `3004`
- Backend: `8084`

### What changed in the project

- The backend reads `HOST`, `PORT`, `RELOAD`, and `CORS_ORIGINS` from the environment.
- The frontend reads `NEXT_PUBLIC_API_BASE_URL` so it can point to the backend instead of a hardcoded localhost URL.
- The frontend scripts bind to `0.0.0.0:3004`.

### Server environment

Set these variables on the VPS:

```bash
GROQ_API_KEY=your_key_here
RUNWAY_API_KEY=your_key_here
FIRECRAWL_API_KEY=your_key_here
HOST=0.0.0.0
PORT=8084
RELOAD=false
CORS_ORIGINS=http://your-server-domain:3004,http://127.0.0.1:3004
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8084
```

### Suggested run order

1. Start the backend on `8084`.
2. Build the frontend with `NEXT_PUBLIC_API_BASE_URL` set.
3. Start the frontend on `3004`.
4. Put Nginx in front if you want TLS or public routing.

### Docker Deployment

The repo includes Dockerfiles for both apps and a root `docker-compose.yml` that publishes the services on localhost ports only:

- Backend: `127.0.0.1:8084`
- Frontend: `127.0.0.1:3004`

Use this flow on the VPS:

```bash
cp .env.example .env
docker compose build
docker compose up -d
```

Set `GROQ_API_KEY` in `.env` before starting the stack. If you use Nginx, proxy `/` to the frontend container and `/health` to the backend container.

### Notes

- Do not run the backend with reload enabled in production.
- If you use a domain for the frontend, add it to backend CORS.
- Keep API keys only on the server.
