# CodeLens

CodeLens is a full-stack web application that generates structured code explanations using the OpenAI Responses API.

The project consists of a Next.js frontend and an Express backend. Users submit source code, select an explanation level, and receive a markdown-formatted breakdown covering summary, step-by-step reasoning, key concepts, and potential improvements.

## Technical Summary

- Frontend: Next.js 16, React 19, Tailwind CSS 4
- Backend: Express 5
- AI integration: OpenAI Responses API
- Runtime: Node.js 18+
- Verification: backend tests, frontend lint, frontend production build

## Features

- Structured code explanations generated from arbitrary source code input
- Configurable explanation depth: `beginner`, `intermediate`, `advanced`
- Language selection with `auto` fallback
- Markdown rendering in the frontend with copy-to-clipboard support
- Request validation, timeout handling, request IDs, and basic in-memory rate limiting

## Architecture

```text
codelens/
|- backend/
|  |- app.js
|  |- app.test.js
|  |- server.js
|  `- .env
|- frontend/
|  |- app/
|  |  |- globals.css
|  |  |- layout.tsx
|  |  `- page.tsx
|- package.json
`- README.md
```

Request flow:

1. The frontend sends a `POST /explain` request to the backend.
2. The backend validates the payload and enforces request limits.
3. The backend constructs a structured prompt.
4. The backend calls the OpenAI Responses API.
5. The backend extracts markdown content from the API response.
6. The frontend renders the result for the user.

## Configuration

Create `backend/.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3001
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TIMEOUT_MS=30000
MAX_CODE_LENGTH=20000
ALLOWED_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20
```

Example file:

[backend/.env.example](c:\Users\jinki\OneDrive\Bilder\Desktop\CODElens\codelens\backend\.env.example)

Optional frontend configuration:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
```

## Installation

Install root dependencies:

```bash
npm install
```

Install application dependencies:

```bash
cd backend
npm install
```

```bash
cd frontend
npm install
```

## Local Development

Start both services from the repository root:

```bash
npm run dev
```

Application endpoints:

- Frontend: `http://localhost:3000`
- Backend health endpoint: `http://localhost:3001/health`

Available root scripts:

- `npm run dev`
- `npm run dev:backend`
- `npm run dev:frontend`
- `npm run test`
- `npm run lint`
- `npm run build`
- `npm run verify`

## API

### `GET /health`

Example response:

```json
{
  "status": "ok",
  "model": "gpt-4.1-mini",
  "maxCodeLength": 20000,
  "requestId": "..."
}
```

### `POST /explain`

Request body:

```json
{
  "code": "const sum = (a, b) => a + b;",
  "level": "beginner",
  "language": "javascript"
}
```

Request fields:

- `code`: required
- `level`: optional, one of `beginner`, `intermediate`, `advanced`
- `language`: optional, one of `auto`, `javascript`, `typescript`, `python`, `java`, `cpp`, `csharp`

Success response:

```json
{
  "text": "# Code Explanation\n...",
  "meta": {
    "model": "gpt-4.1-mini",
    "level": "beginner",
    "language": "javascript",
    "characters": 29,
    "requestId": "..."
  }
}
```

Primary error responses:

- `400` invalid or missing input
- `413` input exceeds `MAX_CODE_LENGTH`
- `429` rate limit exceeded
- `500` upstream or internal failure
- `504` upstream timeout

Example request:

```bash
curl -X POST http://localhost:3001/explain \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"const sum = (a, b) => a + b;\",\"level\":\"beginner\",\"language\":\"javascript\"}"
```

## Quality and Verification

The current repository includes:

- backend tests in [backend/app.test.js](c:\Users\jinki\OneDrive\Bilder\Desktop\CODElens\codelens\backend\app.test.js)
- frontend linting
- frontend production build validation
- local end-to-end smoke verification through the development workflow

Run the full local verification set:

```bash
npm run verify
```

## Operational Notes

- OpenAI credentials remain server-side in `backend/.env`
- CORS is controlled via `ALLOWED_ORIGIN`
- Request size is limited with `MAX_CODE_LENGTH`
- OpenAI request duration is bounded by `OPENAI_TIMEOUT_MS`
- Each request receives a request ID for debugging
- `/explain` is protected by a basic in-memory rate limiter

## Repository References

- Backend entrypoint: [backend/server.js](c:\Users\jinki\OneDrive\Bilder\Desktop\CODElens\codelens\backend\server.js)
- Backend application factory: [backend/app.js](c:\Users\jinki\OneDrive\Bilder\Desktop\CODElens\codelens\backend\app.js)
- Frontend page: [frontend/app/page.tsx](c:\Users\jinki\OneDrive\Bilder\Desktop\CODElens\codelens\frontend\app\page.tsx)
- Frontend global styles: [frontend/app/globals.css](c:\Users\jinki\OneDrive\Bilder\Desktop\CODElens\codelens\frontend\app\globals.css)

## Current Limitations

This project is in a strong local-development and portfolio-ready state, but it is not a complete production system. Areas not yet covered include:

- persistent or distributed rate limiting
- authentication and user management
- centralized logging and observability
- deployment and infrastructure configuration
- browser-level E2E automation

## License

No license file is currently included in this repository.
