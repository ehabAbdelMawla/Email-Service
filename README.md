# Email Service

A simple email management and sending application built with **NestJS**, **PostgreSQL**, and **RabbitMQ**. Compose HTML emails, organize recipients into groups, send asynchronously through a message queue, and track delivery status per recipient — with automatic retries, configurable delay, and message priorities.

## Features

- **Groups CRUD** — create, edit, delete and list email groups
- **Receivers** — add/remove addresses per group, duplicate protection, receiver count per group
- **HTML email composer** — subject + raw HTML body, select one or multiple groups as recipients
- **Asynchronous sending** — `POST /emails/send` returns a job ID immediately; delivery happens through RabbitMQ
- **Job tracking** — per-job and per-recipient status (`pending` → `sent` / `failed`), live-updating in the UI
- **Retry policy** — configurable retry count and delay; only successful sends are acknowledged, failures are requeued with a **lower priority** than first-time messages
- **Local SMTP testing** — all mail lands in MailHog's inbox UI
- **Web UI** — plain HTML/JS frontend for the whole cycle (no build step, no framework)

## Architecture

```
Browser ──▶ Frontend (static HTML/JS)
              │
              ▼
        NestJS API :3000 ──▶ PostgreSQL
              │
              ▼ publish
        RabbitMQ queue "email.send" (x-max-priority: 10)
              │
              ▼ consume
        Consumer ──▶ SMTP ──▶ MailHog :1025  (inbox UI :8025)
              │
              └── updates job/recipient status in PostgreSQL
```

## Tech Stack

| Layer      | Technology                                   |
|------------|----------------------------------------------|
| API        | NestJS 10, TypeORM                           |
| Database   | PostgreSQL 16                                |
| Queue      | RabbitMQ 3 (management plugin)               |
| SMTP test  | MailHog                                      |
| Frontend   | Plain HTML + vanilla JavaScript              |
| Runtime    | Docker Compose                               |

## Quick Start

```bash
git clone <your-repo-url>
cd <repo-folder>

# start PostgreSQL, RabbitMQ, MailHog and the backend
docker compose up -d --build

# serve the frontend (any static server works)
cd frontend/public
python3 -m http.server 3002
```

Then open:

| Service            | URL                          |
|--------------------|------------------------------|
| Frontend           | http://localhost:3002        |
| REST API           | http://localhost:3000        |
| MailHog inbox      | http://localhost:8025        |
| RabbitMQ management| http://localhost:15672 (guest/guest) |

### Try the full flow

1. **Groups** → create a group, open it, add receiver emails
2. **Send Email** → subject, select group checkboxes, HTML body → *Send Email*
3. You get a job ID immediately; the job page auto-refreshes until `completed`
4. Open http://localhost:8025 to see the delivered email
5. Stop MailHog (`docker compose stop mailhog`) and send again to watch retries:
   the job stays `processing`, each attempt is requeued after the configured delay,
   until it finally becomes `failed` (or succeeds again after you `start mailhog`)

## API

### Groups

| Method | Endpoint              | Description                         |
|--------|-----------------------|-------------------------------------|
| GET    | `/groups`             | List groups with receiver counts    |
| POST   | `/groups`             | Create group `{name, description}`  |
| GET    | `/groups/:id`         | Get group with receivers            |
| PUT    | `/groups/:id`         | Update group                        |
| DELETE | `/groups/:id`         | Delete group and its receivers      |

### Receivers

| Method | Endpoint                                   | Description            |
|--------|--------------------------------------------|------------------------|
| GET    | `/groups/:groupId/receivers`               | List receivers         |
| POST   | `/groups/:groupId/receivers`               | Add `{email}`          |
| DELETE | `/groups/:groupId/receivers/:receiverId`   | Remove receiver        |

### Emails

| Method | Endpoint          | Description                                             |
|--------|-------------------|---------------------------------------------------------|
| POST   | `/emails/send`    | Queue an email → `{jobId, status, receiverCount}`       |
| GET    | `/emails/:jobId`  | Job status + per-recipient list (`status`, `error`)     |

Example:

```bash
curl -X POST http://localhost:3000/emails/send \
  -H "Content-Type: application/json" \
  -d '{"subject":"Hello","html":"<h1>Hi</h1>","groupIds":[1,2]}'
```

## Retry Policy

- Only **successful** sends are `ack`ed — a message is removed from the queue only when it is delivered, permanently failed, or unparseable.
- On a retryable failure the message is **requeued with a lower priority** than first-time messages, after a configurable delay, carrying an `x-retry-count` header.
- After `EMAIL_MAX_RETRIES` attempts the recipient is marked `failed` and the job is finalized (`completed` / `completed_with_errors` / `failed`).
- The queue is declared with `x-max-priority: 10`, so fresh messages (`EMAIL_FIRST_PRIORITY`) are always consumed before retries (`EMAIL_RETRY_PRIORITY`).

### Configuration

Environment variables (defaults set in `docker-compose.yml`):

| Variable                | Default | Description                                    |
|-------------------------|---------|------------------------------------------------|
| `DATABASE_HOST`         | postgres| PostgreSQL host                                |
| `DATABASE_PORT`         | 5432    | PostgreSQL port                                |
| `DATABASE_NAME`         | email_service | Database name                            |
| `DATABASE_USER`         | postgres| Database user                                  |
| `DATABASE_PASSWORD`     | postgres| Database password                              |
| `RABBITMQ_URL`          | amqp://rabbitmq:5672 | AMQP connection string            |
| `SMTP_HOST`             | mailhog | SMTP relay host                                |
| `SMTP_PORT`             | 1025    | SMTP relay port                                |
| `EMAIL_MAX_RETRIES`     | 3       | Retry attempts after the first try             |
| `EMAIL_RETRY_DELAY_MS`  | 5000    | Delay between retries                          |
| `EMAIL_FIRST_PRIORITY`  | 5       | Queue priority of first-time messages          |
| `EMAIL_RETRY_PRIORITY`  | 1       | Queue priority of retries (must be lower)      |

## Project Structure

```
├── docker-compose.yml          # postgres + rabbitmq + mailhog + backend
├── Dockerfile                  # backend image
├── frontend/
│   └── public/
│       ├── index.html          # plain HTML/CSS UI shell
│       └── app.js              # vanilla JS (fetch + .then), routing, rendering
└── src/
    ├── main.ts                 # bootstrap + CORS
    ├── app.module.ts           # TypeORM + controllers/providers
    ├── groups/                 # groups CRUD
    ├── receivers/              # receivers CRUD
    ├── emails/                 # send API, job/recipient entities
    └── rabbitmq/
        ├── rabbitmq.config.ts  # queue name, priorities, retry env config
        ├── rabbitmq.service.ts # publisher
        └── rabbitmq.consumer.ts# consumer: SMTP send + retry/finalize logic
```

## Development

```bash
# local (requires local postgres/rabbitmq) — see .env
npm install --legacy-peer-deps
npm run start:dev        # watch mode
npm run build            # compile
npm run lint             # eslint

# rebuild only the backend after code changes
docker compose up -d --build backend
```

## Notes

- No authentication — intended as a learning/demo project.
- The consumer and producer reconnect to RabbitMQ with a 5s retry loop, and `docker-compose` healthchecks guarantee the backend starts only after PostgreSQL and RabbitMQ are healthy.

## License

MIT
