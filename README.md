# WapiSend — WhatsApp SaaS Platform

Multi-tenant WhatsApp Business SaaS platform for small businesses.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, React Query, Zustand |
| Backend | FastAPI, SQLAlchemy (async), Pydantic v2 |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis 7, Celery |
| Messaging | Meta WhatsApp Cloud API |
| Storage | Cloudflare R2 |
| Billing | Razorpay |
| Infra | Docker, Nginx, AWS |

---

## Project Structure

```
wapisend/
├── backend/
│   └── app/
│       ├── main.py              # FastAPI entry point
│       ├── core/config.py       # Settings (env vars)
│       ├── database/
│       │   ├── models.py        # All SQLAlchemy models
│       │   └── session.py       # Async DB session
│       ├── auth/                # JWT auth, signup, login
│       ├── whatsapp/            # Meta Cloud API + webhook
│       ├── bot/engine.py        # Menu bot + FAQ engine
│       ├── leads/               # Lead pipeline CRUD
│       ├── campaigns/           # Broadcast campaigns
│       ├── analytics/           # Dashboard metrics
│       ├── chat/                # Live agent inbox (Phase 3)
│       ├── faq/                 # FAQ management (Phase 2)
│       ├── forms/               # Lead form builder (Phase 2)
│       ├── tenants/             # Tenant settings (Phase 1)
│       └── subscriptions/       # Razorpay billing (Phase 4)
├── frontend/
│   └── src/
│       ├── app/                 # Next.js App Router pages
│       ├── services/api.ts      # Axios client + all API calls
│       ├── store/auth.store.ts  # Zustand auth state
│       ├── components/          # Shared UI components
│       ├── modules/             # Feature modules
│       └── hooks/               # Custom React hooks
├── infra/
│   ├── docker/
│   └── nginx/nginx.conf
└── docker-compose.yml
```

---

## Quick Start

### 1. Clone and configure

```bash
git clone <repo>
cd wapisend
cp backend/.env.example backend/.env
# Edit backend/.env with your keys
```

### 2. Environment variables (`backend/.env`)

```env
SECRET_KEY=your-secret-key-here
DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/wapisend
REDIS_URL=redis://redis:6379/0

# Meta WhatsApp Cloud API
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token

# Razorpay
RAZORPAY_KEY_ID=rzp_live_xxxxx
RAZORPAY_KEY_SECRET=xxxxx

# Cloudflare R2
R2_ACCOUNT_ID=xxxxx
R2_ACCESS_KEY=xxxxx
R2_SECRET_KEY=xxxxx
R2_BUCKET_NAME=wapisend-media
```

### 3. Start with Docker

```bash
docker-compose up -d
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/api/docs (debug mode only)
- Nginx: http://localhost:80

### 4. Local development (without Docker)

**Backend:**
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register tenant + owner |
| POST | `/api/auth/login` | Login → JWT tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/password-reset/request` | Request reset email |
| POST | `/api/auth/password-reset/confirm` | Confirm reset |

### Leads
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/leads/` | List leads (filterable) |
| GET | `/api/leads/stats` | Pipeline stage counts |
| POST | `/api/leads/` | Create lead |
| PATCH | `/api/leads/{id}` | Update stage/notes |
| DELETE | `/api/leads/{id}` | Delete lead |

### Campaigns
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/campaigns/` | List campaigns |
| POST | `/api/campaigns/` | Create campaign |
| PATCH | `/api/campaigns/{id}` | Update draft |
| POST | `/api/campaigns/{id}/send` | Trigger broadcast |
| DELETE | `/api/campaigns/{id}` | Delete campaign |

### WhatsApp
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/whatsapp/webhook` | Meta webhook verification |
| POST | `/api/whatsapp/webhook` | Receive messages/status |
| GET | `/api/whatsapp/accounts` | List WA accounts |
| POST | `/api/whatsapp/accounts` | Connect WA account |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics/dashboard` | Key metrics |
| GET | `/api/analytics/agent-performance` | Per-agent stats |
| GET | `/api/analytics/faq-performance` | FAQ hit counts |

---

## Database Schema (Core Tables)

```
tenants          — Company workspaces (multi-tenant root)
users            — Agents, admins, owners per tenant
whatsapp_accounts — Meta WABA connections
contacts         — WhatsApp contacts per tenant
conversations    — Bot/agent conversation threads
messages         — All messages (inbound + outbound)
bot_flows        — Menu bot flow JSON
faqs             — FAQ question/answer/keywords
forms            — Lead form definitions
form_fields      — Individual form fields
form_responses   — Submitted form data
leads            — Lead pipeline records
campaigns        — Broadcast campaign records
subscriptions    — Razorpay billing per tenant
```

---

## MVP Development Phases

### Phase 1 — Foundation ✅ (this PR)
- [x] Multi-tenant architecture
- [x] JWT auth (signup, login, refresh, password reset)
- [x] Role-based access (owner / admin / agent)
- [x] WhatsApp Cloud API integration
- [x] Webhook ingestion + message storage
- [x] Full database schema

### Phase 2 — Automation
- [ ] Menu bot builder (visual flow editor)
- [ ] FAQ engine management UI
- [ ] Dynamic lead form builder
- [ ] Form → Contact → Lead pipeline

### Phase 3 — Live Chat
- [ ] Real-time inbox (WebSocket or polling)
- [ ] Agent assignment + takeover
- [ ] Internal notes
- [ ] Conversation history

### Phase 4 — Growth
- [ ] Broadcast campaigns
- [ ] Razorpay subscription billing
- [ ] Analytics dashboard
- [ ] Template management

### Phase 5 — White Label
- [ ] Custom domain support
- [ ] Logo + theme customization
- [ ] Email branding

---

## Pricing Plans

| Plan | Price | Agents | Conversations | Numbers |
|---|---|---|---|---|
| Starter | ₹999/mo | 2 | 1,000 | 1 |
| Growth | ₹2,499/mo | 10 | 10,000 | 3 |
| Enterprise | ₹6,999/mo | Unlimited | Unlimited | Unlimited |

---

## WhatsApp Webhook Setup

1. Go to [Meta Developer Portal](https://developers.facebook.com)
2. Create a WhatsApp app
3. Add webhook URL: `https://yourdomain.com/api/whatsapp/webhook`
4. Set verify token to match `WHATSAPP_VERIFY_TOKEN` in `.env`
5. Subscribe to: `messages`, `message_deliveries`, `message_reads`

---

## Roadmap

### V2 — AI Layer
- OpenAI / Claude integration
- AI FAQ answering
- Lead qualification bot
- RAG over knowledge base (PDFs, websites)

### V3 — Multi-Agent Platform
- Sales Agent, Support Agent, Marketing Agent
- Workflow automation (n8n-style)
- Omnichannel (Instagram, Email)
- Voice AI
