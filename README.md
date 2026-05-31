# Palnect Backend

> **Voice-first, low-latency AI tutoring platform backend**

Built with Node.js, TypeScript, Express, Supabase, Redis, WebSockets, and Gemini Live API.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT                                  │
│              (WebSocket /realtime + REST API)                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ JWT Auth
┌────────────────────────────▼────────────────────────────────────┐
│                      EXPRESS SERVER                             │
│  POST /auth/signup   POST /auth/login   GET /auth/google        │
│  POST /session/create  GET /session/:id  POST /session/end      │
│  GET /profile         POST /profile/onboard                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│               WEBSOCKET SERVER  (/realtime)                     │
│  auth → session_start → audio_chunk/text_input → interruption  │
│  ← ai_audio_chunk / ai_token / partial_transcript              │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│               TUTOR ORCHESTRATOR (AI Brain)                     │
│  • Builds system prompts from memory + profile                  │
│  • Detects confusion / engagement signals                       │
│  • Adapts teaching mode: explain→simplify→quiz→motivate         │
└────────────┬───────────────────────────────────────┬────────────┘
             │                                       │
┌────────────▼───────────┐             ┌────────────▼────────────┐
│   GEMINI LIVE PROVIDER │             │      REDIS SESSION      │
│  gemini-3.1-flash-live │             │  • Active context       │
│  • Audio streaming     │             │  • Stream buffer        │
│  • VAD interruption    │             │  • Interruption signals │
│  • Auto transcription  │             │  • Auth cache           │
└────────────────────────┘             └─────────────────────────┘
                                                    │
                                       ┌────────────▼────────────┐
                                       │      SUPABASE (PG)      │
                                       │  • Users & profiles     │
                                       │  • Session history      │
                                       │  • Messages & analyses  │
                                       │  • Study plans          │
                                       └─────────────────────────┘

AGENTS (background services):
  OnboardingAgent → initializes learning profile
  StudyPlanAgent  → generates 4-week learning paths
  SessionAnalyzer → evaluates comprehension post-session
  RetentionAgent  → re-engagement messages for inactive users
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
# Fill in your keys
```

### 3. Set up database
```bash
npm run db:migrate
# Or paste the SQL from scripts/migrate.ts into Supabase SQL editor
```

### 4. Start Redis
```bash
docker run -d -p 6379:6379 redis:alpine
```

### 5. Run in development
```bash
npm run dev
```

---

## WebSocket Protocol

Connect to `ws://localhost:3000/realtime`

### Message format
```json
{ "type": "event_type", "sessionId": "...", "payload": {}, "timestamp": 1234567890 }
```

### Flow
```
Client                          Server
  │──── { type: "auth",           │
  │       payload: { token } } ──►│
  │◄─── { type: "auth_success" } ─│
  │                               │
  │──── { type: "session_start",  │
  │       payload: {              │
  │         subject: "Math",      │
  │         topic: "Algebra" } }─►│
  │◄─── { type: "session_start", ─│  (Gemini Live session created)
  │       payload: { sessionId } }│
  │                               │
  │──── { type: "audio_chunk",    │
  │       sessionId: "...",       │
  │       payload: { data: "..." │  (base64 PCM audio)
  │         mimeType: "..."} } ──►│──► Gemini Live
  │                               │◄── AI speaks
  │◄─── { type:"ai_audio_chunk" } │  (base64 PCM 24kHz)
  │◄─── { type:"partial_transcript"│  (real-time text)
  │                               │
  │  (user interrupts)            │
  │──── { type: "interruption" }─►│──► Redis signal
  │◄─── { type: "interruption",  ─│  (acknowledged)
  │       payload: {ack: true} }  │
```

### All event types
| Type | Direction | Description |
|------|-----------|-------------|
| `auth` | C→S | Send JWT token |
| `auth_success` | S→C | Auth confirmed |
| `auth_error` | S→C | Auth failed |
| `session_start` | C→S | Start tutoring session |
| `session_end` | C→S | End session |
| `audio_chunk` | C→S | Send PCM audio chunk (base64) |
| `audio_stream_end` | C→S | Signal end of audio stream |
| `text_input` | C→S | Send text message |
| `interruption` | C→S | User interrupted AI |
| `ai_audio_chunk` | S→C | AI audio response (base64 PCM) |
| `ai_token` | S→C | AI text token (streaming) |
| `ai_turn_complete` | S→C | AI finished speaking |
| `partial_transcript` | S→C | Real-time speech transcript |
| `final_transcript` | S→C | Final transcript for a turn |
| `mode_change` | S→C | Orchestrator changed teaching mode |
| `confusion_detected` | S→C | Confusion signal detected |
| `error` | S→C | Error event |
| `ping`/`pong` | both | Heartbeat |

---

## REST API

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/signup` | Email/password registration |
| POST | `/auth/login` | Email/password login |
| POST | `/auth/refresh` | Refresh JWT tokens |
| POST | `/auth/logout` | Invalidate session |
| GET | `/auth/me` | Get current user |
| GET | `/auth/google` | Initiate Google OAuth |
| GET | `/auth/google/callback` | Google OAuth callback |

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/session/create` | Pre-create session (then connect WS) |
| GET | `/session/:id` | Get session + messages |
| POST | `/session/end` | End session |
| GET | `/session` | List user's sessions |
| GET | `/session/active/check` | Check for active session |

### Profile
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/profile` | Get learning profile |
| POST | `/profile/onboard` | Complete onboarding |
| GET | `/profile/study-plan` | Get/generate study plan |

---

## TutorOrchestrator Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| `explain` | Default | Clear explanations with examples |
| `simplify` | Confusion score > 0.5 | Ultra-simple, short sentences |
| `quiz` | Engagement > 0.7 + 6+ messages | Tests understanding |
| `motivate` | Engagement < 0.3 | Energetic re-engagement |
| `practice` | Manual | Hands-on problem solving |
| `review` | Manual | Recap and reinforce |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key |
| `REDIS_URL` | ✅ | Redis connection URL |
| `JWT_SECRET` | ✅ | JWT signing secret |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token secret |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth secret |

---

## Audio Format

- **Input (client → server):** Raw PCM, 16-bit, mono, 16kHz, base64 encoded
- **Output (server → client):** Raw PCM, 16-bit, mono, 24kHz, base64 encoded
- **MIME type in:** `audio/pcm;rate=16000`
- **MIME type out:** Provided in `ai_audio_chunk` payload

---

## Project Structure

```
src/
├── index.ts                    # Entry point
├── config/index.ts             # Env config
├── types/index.ts              # All TypeScript types
├── auth/
│   ├── jwt.ts                  # JWT sign/verify
│   ├── password.ts             # bcrypt utils
│   └── google.ts               # Google OAuth setup
├── middleware/
│   ├── auth.middleware.ts      # JWT authentication
│   ├── error.middleware.ts     # Error handling
│   └── validate.middleware.ts  # Joi validation
├── validators/
│   ├── auth.validator.ts
│   └── session.validator.ts
├── db/
│   ├── redis/
│   │   ├── client.ts           # Redis connection
│   │   └── session-store.ts    # Session, context, buffer stores
│   └── supabase/
│       ├── client.ts           # Supabase connection
│       └── repositories.ts     # All DB operations
├── orchestrator/
│   └── tutor-orchestrator.ts   # AI Brain — mode selection, prompts
├── ai/
│   ├── providers/
│   │   └── gemini-live.provider.ts  # Gemini Live integration
│   ├── stt/
│   │   └── stt.abstraction.ts
│   └── tts/
│       └── tts.abstraction.ts
├── websocket/
│   ├── ws-server.ts            # WS server + auth
│   └── session.handler.ts      # Session lifecycle + AI bridging
├── routes/
│   ├── auth.routes.ts
│   ├── session.routes.ts
│   └── profile.routes.ts
├── agents/
│   ├── onboarding.agent.ts
│   ├── study-plan.agent.ts
│   ├── session-analyzer.agent.ts
│   └── retention.agent.ts
└── utils/
    ├── logger.ts
    └── response.ts
```