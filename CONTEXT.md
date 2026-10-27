# Backend project context

Last updated: 27 October 2026. This is the single maintained source of backend setup, architecture, decisions, and verification context. Update it when those change.

Use Node.js 22.17.1 or newer and MongoDB. Copy `.env.example` to `.env`, set the active credentials, then run `npm ci` and `npm run dev`. The local backend listens on port 5000.

## Deployment configuration

`src/config/credential-config.js` reads exactly these environment settings:

| Setting | Purpose |
| --- | --- |
| `MONGO_URL` | MongoDB connection URL. |
| `ADMIN_API_TOKEN` | Server-only Bearer credential for contact administration. At least 32 random characters; blank disables admin access. |
| `ZEPTOMAIL_ALERTS_PASSWORD` | The one active SMTP credential for `alerts@proveniencex.com`. |
| `CONTACT_TO_EMAIL` | Comma-separated enquiry recipients; currently `info@techieamigos.com`. |

`src/config/global.server.config.js` holds the non-secret settings in code: `nodeEnv: "development"`, `port: 5000`, and `mongoDatabase: "proveniencex"`. Set `nodeEnv` to `"production"` there when deploying; it controls secure cookies and development-only origins.

Keep `.env` out of Git. Invitation/activation sender credentials, alternate provider settings, legacy database aliases, and origin settings are not used or required.

## Application routing and origins

API routers are mounted in `src/app.js`, following the existing pt-live structure. The frontend's `baseApiUrl` is the domain root `https://www.proveniencex.com`; endpoint paths are separate from that setting. The current router mount is `/api`, serving contact, authentication, hazard-report, and health routes.

The production origin allowlist is defined directly in `src/app.js`:

- `https://www.proveniencex.com`
- `https://proveniencexai.com`
- `https://techieamigos.com`

Origin headers have no trailing slash. Development additionally permits localhost and 127.0.0.1 on port 5173. Credentialed requests allow `Content-Type` and `Authorization` headers. There is no `CORS_ORIGIN` setting in `.env`.

DevOps should route the API paths on the public website origin to this backend and the page/static paths to the frontend. Keep the public Host header when reverse proxying. In production, use HTTPS and set `globalConfig.nodeEnv` to `"production"` so session cookies are Secure.

## Database and API behavior

`src/config/mongodb.server.config.js` implements pt-live's `getConnection(dbName)` contract, returning `{ db, client }`. Pending connections are cached and reset on failure. Contact models attach to that native client through Mongoose without an extra pool. `src/config/database.server.js` initializes user/session/report indexes on the same backend pool.

Authentication and hazard-report services live only in this backend. Sessions use hashed tokens, HttpOnly cookies, and explicit expiry checks. Report previews contain only the first recommendation; unlocking requires a valid session and matching report ownership. Reports expire after 30 days.

`POST /api/contact` validates and stores enquiries. Contact GET/DELETE endpoints require the admin Bearer credential. Notification failure does not discard a stored enquiry.

## ZeptoMail

All email uses `src/utils/send-mail.js` with the one configured alerts sender. There are no unused role selectors, compatibility wrappers, or extra sender credentials. SMTP uses `smtp.zeptomail.in`, port 587, user `emailapikey`, mandatory STARTTLS, and certificate verification. The system resolver supplies its IPv4 address while TLS verifies the original hostname. Operations have a ten-second deadline; there is no provider fallback. Credentials and message bodies are not logged.

Contact text is escaped before inclusion in HTML. `npm run mail:verify` checks SMTP authentication without sending a message. Authentication alone does not establish inbox delivery.

## Verification

Run `npm test` with local MongoDB available, or set the test-only `MONGODB_TEST_URI`. Tests create random disposable databases and remove them afterward; SMTP delivery is mocked. The suite covers contact CRUD and access control, production CORS, connection recovery, authentication/session expiry, report ownership, the Express service adapter, and mail behavior.

## Repositories and reference structure

Backend: https://github.com/nans7/provenienceXAI-backend (`main`). Frontend: https://github.com/nans7/nexus-viz-23 (`main`, normally the sibling `nexus-viz-23` checkout). Express serves APIs; React/TanStack serves pages. The read-only reference project is `C:\Techie Amigos\ai.proveniencex\pt-live\ai-proveniencex-backend`. Follow its configuration/MongoDB/ZeptoMail structure without modifying it or copying unrelated credentials.

## Source map and contracts

| Location | Responsibility |
| --- | --- |
| `src/server.js` | Startup, listener, database initialization, graceful shutdown |
| `src/app.js` | Express mode, approved origins, body parsers, `/api` mount, error middleware |
| `src/config/credential-config.js` | Loads the four active environment settings and combines code settings |
| `src/config/global.server.config.js` | Mode, port 5000, database `proveniencex` |
| `src/config/mongodb.server.config.js` | Shared cached MongoClient with retry after failed initialization |
| `src/config/db.js` | Attaches Mongoose contact models to the same native client |
| `src/config/database.server.js` | Native auth/report collections and unique/TTL indexes |
| `src/services/auth.service.js` | Signup, login, session lookup, logout, password hashing and cookies |
| `src/services/hazard.service.js` | Validated briefs, stored monitoring templates, report ownership/access |
| `src/config/hazard-options.js` | Allowed hazard and frequency values, mirrored by public frontend options |
| `src/controllers`, `src/models/Contact.js`, `src/routes` | Contact CRUD and health routing |
| `src/middlewares/webHandler.js` | Express adapter for Web Request/Response service handlers |
| `src/middlewares/requireAdmin.js` | Constant-time admin Bearer token comparison |
| `src/utils/validation.js`, `src/utils/http.js` | Validation, bounded object JSON parsing, response/origin helpers |
| `src/utils/send-mail.js`, `src/utils/sendContactEmail.js` | The sole ZeptoMail transport and contact notification |
| `scripts/verify-mail.js` | SMTP connection/authentication check without delivery |
| `tests` | Six regression files; disposable MongoDB databases and mocked SMTP |

Local `MONGO_URL` is `mongodb://localhost:27017`. The code-selected database has `contacts`, `users`, `sessions`, and `hazardPlans`. No database URI or SMTP secret belongs in frontend configuration. `.env.example` contains safe placeholders only; keep real credentials out of commits and logs.

| Endpoint | Access and behavior |
| --- | --- |
| `GET /api/health` | Public process/database health |
| `POST /api/contact` | Public validated enquiry; mail failure does not undo storage |
| `GET /api/contact`, `GET /api/contact/:id`, `DELETE /api/contact/:id` | Admin Bearer token required |
| `POST /api/auth/signup`, `POST /api/auth/login` | Validated account details; creates a seven-day session |
| `GET /api/auth/session`, `POST /api/auth/logout` | Session lookup/revocation |
| `POST /api/hazard/plans` | Saves a brief and server-generated monitoring template |
| `GET /api/hazard/plans/:id` | Checks ownership and expiry; anonymous previews stay partial |
| `POST /api/hazard/plans/:id/unlock` | Requires login and atomically claims an anonymous report or verifies its owner |

## Established fixes and constraints

Contact administration fails closed without a valid configured token. Auth and report mutations check request origins. Email syntax rules match the frontend (including local/domain lengths and dot/hyphen restrictions); input normalization never silently clips values. Syntax checks do not prove mailbox ownership.

Passwords use salted scrypt; stored session tokens are SHA-256 hashes. Cookies are HttpOnly and SameSite=Lax, with Secure enabled for HTTPS or production code mode. Logout awaits deletion and returns a handled error when revocation fails. Database connection/index setup can recover after initial failure. Explicit expiry checks apply before TTL cleanup.

Report recommendations use deterministic monitoring templates, with conditions, area, frequency, exposed people, and existing controls. No external AI service is configured. Full recommendation text stays server-side until authorized. JSON null/arrays/malformed bodies return client errors; Express preserves safe parser error statuses rather than turning them into 500 responses.

All backend source modules and dependencies have active callers and are retained. Unused mail roles, credentials, wrappers, and the obsolete `env.js` have already been removed. Do not reintroduce another mail provider, frontend secret files, or environment variables for mode, port, database name, or origins.

## Verification record

The regression suite has 34 tests covering real local MongoDB lifecycle/retry, contact validation/administration, JSON parser failures, production CORS, session/authentication behavior, report ownership and expiry, and ZeptoMail behavior with mocked transport. Test databases are separate from normal `proveniencex` data and cleaned up. SMTP authentication has been verified separately; no real test message was sent. The companion frontend has six tests plus TypeScript, lint, and a production build.

Keep tests and the SMTP verification script: both have active operational use. Do not run real delivery tests without an explicit request to send a message.
