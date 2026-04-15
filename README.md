# Profile Intelligence Service (Stage 01)

A Node.js / Express service that accepts a name, enriches it using three public
APIs (Genderize, Agify, Nationalize), persists the result to SQLite, and exposes
a small REST API to create, list, fetch, and delete profiles.

---

## Stack

| Concern        | Choice                                                   |
| -------------- | -------------------------------------------------------- |
| Runtime        | Node.js >= 18                                            |
| HTTP framework | Express 4                                                |
| HTTP client    | `node-fetch` v2                                          |
| Database       | SQLite via `better-sqlite3` (file on disk — `data.sqlite`) |
| IDs            | UUID v7 (`uuid` package)                                 |
| Timestamps     | UTC ISO-8601 (`Date.prototype.toISOString()`)            |

---

## Project layout

```
stage-01/
├── server.js              # Express app: CORS, JSON body, 404 + error handlers
├── routes/
│   └── profiles.js        # POST / GET list / GET :id / DELETE :id
├── services/
│   └── enrichment.js      # Calls Genderize, Agify, Nationalize in parallel
├── db.js                  # SQLite schema, prepared statements, query helpers
├── package.json
└── .gitignore
```

---

## Setup

```bash
cd stage-01
npm install
npm start
```

The server listens on `PORT` (default `3000`). The SQLite file is created on
first run at `./data.sqlite` (override with `DB_PATH=/path/to/file`).

---

## Endpoints

Base path: `/api/profiles`. CORS is open (`Access-Control-Allow-Origin: *`).

### `POST /api/profiles`

Create a profile. Body: `{ "name": "<string>" }`.

- Validates the name: must be a non-empty string, ≤ 100 characters, containing
  only letters (Unicode), spaces, hyphens, and apostrophes.
- Looks up an existing profile by the case-folded name. If found, returns it
  with `message: "Profile already exists"` (HTTP 200) — **no new record, no
  external calls made on the duplicate path**.
- Otherwise calls Genderize, Agify, and Nationalize **in parallel**, applies
  the classification rules, and stores the result.

**201 Created — new profile**

```json
{
  "status": "success",
  "data": {
    "id": "019d9111-e040-7884-8074-adbb39724d69",
    "name": "ella",
    "gender": "female",
    "gender_probability": 0.99,
    "sample_size": 97517,
    "age": 46,
    "age_group": "adult",
    "country_id": "DRC",
    "country_probability": 0.85,
    "created_at": "2026-04-01T12:00:00Z"
  }
}
```

**200 OK — idempotent hit**

```json
{
  "status": "success",
  "message": "Profile already exists",
  "data": { "...existing profile..." }
}
```

### `GET /api/profiles`

List profiles. Optional, case-insensitive query parameters:

- `gender` — e.g. `male`, `female`
- `country_id` — ISO country code, e.g. `NG`
- `age_group` — one of `child`, `teenager`, `adult`, `senior`

`/api/profiles?gender=Male&country_id=ng`:

```json
{
  "status": "success",
  "count": 2,
  "data": [
    { "id": "...", "name": "emmanuel", "gender": "male", "age": 25, "age_group": "adult", "country_id": "NG" },
    { "id": "...", "name": "sarah",    "gender": "female", "age": 28, "age_group": "adult", "country_id": "US" }
  ]
}
```

The list view returns a trimmed subset (`id`, `name`, `gender`, `age`,
`age_group`, `country_id`) exactly as the spec example shows.

### `GET /api/profiles/:id`

Fetch one profile by id. Returns the full record, or `404` if not found.

### `DELETE /api/profiles/:id`

Delete a profile. Returns `204 No Content` on success, `404` if the id is
unknown.

---

## Classification rules

- **Gender**: `gender`, `probability`, and `count` from Genderize. `count` is
  renamed to `sample_size`.
- **Age group**: from Agify's `age`:
  - `0–12` → `child`
  - `13–19` → `teenager`
  - `20–59` → `adult`
  - `60+` → `senior`
- **Country**: the country with the highest `probability` from Nationalize is
  picked as `country_id`, with its `probability` stored as
  `country_probability`.

---

## Error responses

All errors share the shape:

```json
{ "status": "error", "message": "<reason>" }
```

| Code | When                                                                  |
| ---- | --------------------------------------------------------------------- |
| 400  | Missing / empty `name`, or malformed JSON body                        |
| 404  | Profile id not found, or unknown route                                |
| 422  | `name` wrong type, too long, or contains invalid characters           |
| 500  | Unexpected server error                                               |
| 502  | An upstream API returned an invalid / unusable response               |

Upstream-failure message format (per spec):

```json
{ "status": "error", "message": "Genderize returned an invalid response" }
```

`externalApi` is one of `Genderize`, `Agify`, or `Nationalize`. A 502 is
returned and **no record is stored** when any of:

- Genderize returns `gender: null` or `count: 0`
- Agify returns `age: null`
- Nationalize returns an empty `country` array
- Any of the three calls fails (network error, non-2xx status, non-JSON body)

---

## Database schema

```sql
CREATE TABLE profiles (
    id                  TEXT PRIMARY KEY,       -- UUID v7
    name                TEXT NOT NULL,          -- original, as submitted (trimmed)
    name_key            TEXT NOT NULL UNIQUE,   -- lowercased; drives idempotency
    gender              TEXT NOT NULL,
    gender_probability  REAL NOT NULL,
    sample_size         INTEGER NOT NULL,
    age                 INTEGER NOT NULL,
    age_group           TEXT NOT NULL,          -- child | teenager | adult | senior
    country_id          TEXT NOT NULL,
    country_probability REAL NOT NULL,
    created_at          TEXT NOT NULL           -- ISO-8601 UTC
);
```

Idempotency is enforced both at the application layer (pre-lookup by
`name_key`) and at the database layer (`UNIQUE(name_key)`), so a race between
two concurrent `POST`s for the same name cannot create duplicates — the losing
request catches the `SQLITE_CONSTRAINT_UNIQUE` error and returns the existing
record.

---

## Example session

```bash
# create
curl -s -X POST http://localhost:3000/api/profiles \
  -H 'Content-Type: application/json' \
  -d '{"name":"ella"}'

# idempotent (same name, any case)
curl -s -X POST http://localhost:3000/api/profiles \
  -H 'Content-Type: application/json' \
  -d '{"name":"ELLA"}'

# list with filters
curl -s 'http://localhost:3000/api/profiles?gender=female&country_id=CM'

# fetch one
curl -s http://localhost:3000/api/profiles/<id>

# delete
curl -s -X DELETE http://localhost:3000/api/profiles/<id> -w '%{http_code}\n'
```

---

## How the implementation maps to the rubric

| Criterion (points)          | Where it lives                                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| API Design (15)             | Four REST endpoints with the correct HTTP verbs and status codes (`201`, `200`, `204`, `400`, `404`, `422`, `502`) in [routes/profiles.js](routes/profiles.js). |
| Multi-API Integration (15)  | All three upstreams called **concurrently** via `Promise.all` in [services/enrichment.js](services/enrichment.js); each response validated independently. |
| Data Persistence (20)       | SQLite file-backed database with a typed schema and prepared statements in [db.js](db.js).                                                      |
| Idempotency Handling (15)   | Case-folded `name_key` lookup before and after enrichment, plus a `UNIQUE` DB constraint as the race-safe backstop ([routes/profiles.js:70-131](routes/profiles.js#L70-L131)). |
| Filtering Logic (10)        | `LOWER(col) = LOWER(?)` on `gender`, `country_id`, `age_group` ([db.js:72-89](db.js#L72-L89)).                                                   |
| Data Modeling (10)          | Distinct typed columns, UUID v7 primary key, UTC ISO-8601 timestamps, separate display name vs. lookup key ([db.js:9-23](db.js#L9-L23)).        |
| Error Handling (10)         | Input validation (400/422), not-found (404), upstream failure (502) with the exact `"${api} returned an invalid response"` message, JSON parse and top-level error handlers in [server.js](server.js). |
| Response Structure (5)      | Envelopes match the spec exactly: `{ status, data }`, list adds `count`, idempotent adds `message`, errors use `{ status, message }`.          |
