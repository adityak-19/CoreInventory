<div align="center">

# CoreInventory

**A production-grade Inventory Management System built with React, Node.js & PostgreSQL**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

CoreInventory replaces spreadsheets and manual registers with a centralised warehouse command centre — handling receipts, deliveries, internal transfers, stock adjustments, and full movement history, all backed by a real PostgreSQL database.

</div>

---

## Features

### Inventory Operations
| Operation | What it does |
|---|---|
| **Receipt** | Record incoming stock from suppliers; validates and increases on-hand qty |
| **Delivery Order** | Record outgoing shipments; warns on short stock; decreases qty on validation |
| **Internal Transfer** | Move stock between warehouses; total qty unchanged, distribution updated |
| **Adjustment** | Correct physical count mismatches; delta logged in ledger |

### Dashboard & Visibility
- Real-time KPI cards — total products, total stock value, low-stock alerts, pending operations
- Recent activity feed with in/out colour coding
- Per-warehouse snapshot cards with live stock and value
- Global filters by document type, status, warehouse, and product category

### Stock Control
- Per-warehouse on-hand and free-to-use (on-hand minus reserved) stock
- Reorder level alerts — visual warnings when stock falls below threshold
- Inline stock editor on the products table
- Stock value column (qty × cost per unit)

### Move History / Ledger
- Immutable record of every stock movement with reference, route, contact, date, and status
- Dual view: table list and Kanban board grouped by operation type
- In/out colour differentiation

### Auth & Security
- JWT-based login (8-hour expiry)
- OTP-based password reset flow
- Strong password policy enforced on backend (8+ chars, upper, lower, special)
- Auth rate limiting (20 req / 10 min per IP)
- Input sanitisation and payload size guards on all endpoints

### Settings
- Warehouse master data management (name, code, address)
- Location master data linked to warehouse

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5 |
| Styling | Custom CSS — light professional theme, Bricolage Grotesque font |
| Backend | Node.js 18+, Express 4 |
| Database | **PostgreSQL 14+** via `node-postgres` (`pg`) |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| Dev tooling | Concurrently, dotenv |

---

## Database Schema

CoreInventory uses a fully normalised PostgreSQL schema. All inventory sync operations run inside a **single ACID transaction** — if anything fails, the entire write rolls back.

```
users              — accounts, bcrypt passwords
reset_otps         — short-lived OTP tokens for password reset
products           — SKU catalogue with cost and reorder level
warehouses         — warehouse registry with codes
locations          — sub-locations per warehouse (FK → warehouses)
stock_by_location  — on-hand qty per product × warehouse (composite PK)
operations         — receipts, deliveries, transfers, adjustments
operation_items    — line items per operation (FK → operations)
ledger             — immutable stock movement history
```

Indexes on `operations.type`, `operations.status`, `ledger.date`, `ledger.product_id`, and all foreign keys ensure fast reads even at scale.

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### 1 — Clone and install

```bash
git clone https://github.com/your-username/coreinventory.git
cd coreinventory
npm install
```

### 2 — Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=coreinventory
PGUSER=postgres
PGPASSWORD=your_postgres_password
JWT_SECRET=change-this-to-a-long-random-string
PORT=4000
```

### 3 — Create the database

```sql
-- in psql or your PostgreSQL client
CREATE DATABASE coreinventory;
```

### 4 — Apply schema and seed data

```bash
npm run db:migrate
```

This is idempotent — safe to run multiple times. It creates all tables, inserts sample products/warehouses/operations, and creates the demo account.

### 5 — Start the app

```bash
npm run dev:full
```

| URL | Service |
|---|---|
| http://localhost:5173 | Frontend (React + Vite) |
| http://localhost:4000 | Backend API (Express) |
| http://localhost:4000/api/health | Health check (includes DB status) |

---

## Demo Account

| Field | Value |
|---|---|
| Email | `demo@coreinventory.app` |
| Password | `Demo@1234!` |

The demo account is created (and its password reset) automatically on every backend startup.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev:full` | Kill ports → start backend + frontend together |
| `npm run db:migrate` | Apply schema migrations and seed initial data |
| `npm run dev:server` | Backend only |
| `npm run dev:client` | Frontend (Vite) only |
| `npm run build` | Production build |
| `npm run kill` | Free ports 4000 / 5173 |

---

## Project Structure

```
coreinventory/
├── backend/
│   ├── db.js          # pg connection pool + withTransaction()
│   ├── schema.sql     # DDL — 9 tables, 8 indexes
│   ├── migrate.js     # Schema + seed runner (npm run db:migrate)
│   ├── server.js      # Express API — auth + inventory routes
│   └── seed.js        # Sample data definitions
├── src/
│   ├── App.jsx        # Entire React SPA — auth, dashboard, ops, products, settings
│   └── App.css        # All styles — light professional theme
├── .env.example       # Environment template
├── vite.config.js
└── package.json
```

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | — | Health check including DB connectivity |
| `POST` | `/api/auth/signup` | — | Register new user |
| `POST` | `/api/auth/login` | — | Login, returns JWT |
| `POST` | `/api/auth/request-reset` | — | Generate OTP for password reset |
| `POST` | `/api/auth/verify-reset` | — | Verify OTP and set new password |
| `GET` | `/api/inventory/state` | JWT | Fetch full inventory state |
| `PUT` | `/api/inventory/state` | JWT | Sync full state (transactional) |

---

## Notes

- The `/api/auth/request-reset` endpoint returns the OTP directly in the response for hackathon demo convenience. In production, replace this with email/SMS delivery.
- Schema migrations run automatically on every server start (`CREATE TABLE IF NOT EXISTS`). The `db:migrate` command is only needed once to seed initial data.
- The frontend uses `normalizeRemoteState()` to handle any legacy data model differences gracefully.

---

## License

MIT