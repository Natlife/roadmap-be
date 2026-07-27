# User Administration API

All routes are under `/api/v1` and return the standard envelope:
`{ code, message, data, timestamp, meta? }` (success `code = 1000`).
Auth: send `Authorization: Bearer <jwt>`. Admin-only routes require an ADMIN token.

## Roles & plans
- Roles: `ADMIN` (role_id 1), `USER` (role_id 2).
- Plans: `FREE`, `PREMIUM`, `GROUP`.
- Account state: `active` (boolean). **Soft delete = `active = false`** (deactivate,
  reversible). Hard delete removes the row permanently.

---

## List users — `GET /users`  (ADMIN)
Server-side search / filter / sort / pagination.

Query params (all optional):
| param | values | default |
| ----- | ------ | ------- |
| `page` | ≥ 1 | 1 |
| `pageSize` | 1–200 | 20 |
| `search` | matches email / username / full name | — |
| `role` | `ADMIN` \| `USER` | all |
| `plan` | `FREE` \| `PREMIUM` \| `GROUP` | all |
| `status` | `active` \| `inactive` \| `all` | all |
| `sortBy` | `fullName` \| `email` \| `username` \| `plan` \| `role` \| `active` \| `createdAt` | `createdAt` |
| `sortOrder` | `asc` \| `desc` | `desc` |

Response: `data` = array of users; `meta` = `{ page, pageSize, total, totalPages }`.

## Create user — `POST /admin/users`  (ADMIN)
```json
{ "email": "a@x.io", "username": "alice", "password": "secret1",
  "fullName": "Alice", "role": "ADMIN", "plan": "GROUP" }
```
- `email`, `password` (≥6), `fullName` required. `username` optional (≥3 chars,
  `[a-zA-Z0-9._-]`; derived from email if omitted).
- `role` accepts the string form; `roleId` (1/2) is also accepted.
- Rejects duplicate email / username (`409`).
- Returns `201` with the created user.

## Update user — `PUT /users/:id`
Admin can change: `fullName`, `role`, `plan`, `active`, `password` (reset).
A standard user may edit only their own `fullName` / `password`.
`email` and `username` are immutable via this API.
All fields optional (partial update); only provided fields are written.

## Deactivate (soft delete) — `PUT /users/:id` `{ "active": false }`
Reactivate with `{ "active": true }`.

## Delete permanently — `DELETE /users/:id`  (ADMIN)
Hard delete. Prefer deactivation.

---

## Validation
`400` with per-field detail:
`{ "code": 400, "message": "Validation failed", "details": { "fields": { "email": "Email is invalid", ... } } }`

## Business guardrails
- An admin cannot deactivate or demote **their own** account.
- The **last active admin** cannot be demoted, deactivated, or deleted.
- Duplicate email / username are rejected.

## Notes
- No DB migration required — soft delete reuses the existing `active` column.
- Passwords are hashed with bcrypt (10 rounds). `password` is never returned.
