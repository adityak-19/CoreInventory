# CoreInventory — Inventory Management System

A full-featured Inventory Management System built with **FastAPI**, **SQLAlchemy**, **SQLite**, and **Jinja2** templates.

## Problem Statement

A modular Inventory Management System (IMS) that digitizes and streamlines all stock-related operations within a business. The goal is to replace manual registers, Excel sheets, and scattered tracking methods with a centralized, real-time, easy-to-use app.

## Target Users

- **Inventory Managers** – manage incoming & outgoing stock.
- **Warehouse Staff** – perform transfers, picking, shelving, and counting.

---

## Features

- **Authentication** — Sign up / login with JWT tokens in cookies, OTP-based password reset
- **Dashboard** — KPIs (Total Products, Low Stock, Pending Operations), smart filters
- **Products** — Catalog with stock levels, SKU search, categories, reorder rules
- **Receipts** — Receive goods from suppliers, auto-increase stock on validation
- **Deliveries** — Ship goods to customers, auto-decrease stock on validation
- **Internal Transfers** — Move stock between warehouses/locations
- **Stock Adjustments** — Fix physical count mismatches
- **Move History** — Full stock ledger with filterable log
- **Settings** — Warehouse management, reorder rules view
- **Multi-warehouse support** — Stock tracked per product per warehouse
- **Alerts** — Low stock and out-of-stock alerts
- **Profile** — Manage user profile setting

---

## Inventory Flow Example

1. **Receive Goods from Vendor** (e.g., receive 100 kg Steel → Stock: +100)
2. **Internal Transfer** (e.g., Main Store → Production Rack)
3. **Deliver Finished Goods** (e.g., Ship out 20 units → Stock: -20)
4. **Stock Adjustments** (e.g., 3 kg material damaged → Stock: -3)

All operations are sequentially logged in the Stock Ledger.

## Mockup Reference

- [Excalidraw Design](https://link.excalidraw.com/l/65VNwvy7c4X/3ENvQFu9o8R)

---

## Project Structure

```
coreinventory/
├── main.py                   # FastAPI app entry point
├── requirements.txt
├── app/
│   ├── models.py             # SQLAlchemy ORM models
│   ├── database.py           # DB engine, session, init
│   ├── auth.py               # JWT auth helpers
│   ├── seed.py               # Demo data seeder
│   ├── routers/
│   │   ├── auth.py           # /login /signup /logout
│   │   ├── dashboard.py      # / (dashboard)
│   │   ├── products.py       # /products/
│   │   ├── operations.py     # /receipts /deliveries /transfers
│   │   ├── adjustments.py    # /adjustments /history /settings
│   │   └── api.py            # /api/* JSON endpoints
│   ├── templates/
│   │   ├── base.html
│   │   ├── login.html
│   │   ├── signup.html
│   │   ├── dashboard.html
│   │   ├── products.html
│   │   ├── product_detail.html
│   │   ├── receipts.html
│   │   ├── deliveries.html
│   │   ├── transfers.html
│   │   ├── adjustments.html
│   │   ├── history.html
│   │   └── settings.html
│   └── static/
│       ├── css/main.css
│       └── js/main.js
```

---

## Setup & Run

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the server

```bash
uvicorn main:app --reload
```

### 3. Open in browser

```
http://localhost:8000
```

### Demo credentials

| Role    | Email            | Password  |
|---------|-----------------|-----------|
| Manager | admin@core.com  | admin123  |
| Staff   | staff@core.com  | staff123  |

The database is seeded automatically on first run with sample products, warehouses, and operations.

---

## Tech Stack

| Layer      | Technology                        |
|------------|-----------------------------------|
| Backend    | FastAPI (Python)                  |
| ORM        | SQLAlchemy 2.0                    |
| Database   | SQLite (swap to PostgreSQL easily)|
| Templates  | Jinja2                            |
| Auth       | JWT (python-jose) + bcrypt        |
| Styling    | Custom CSS (IBM Plex Sans/Mono)   |

---

## Switching to PostgreSQL

Change `DATABASE_URL` in `app/database.py`:

```python
DATABASE_URL = "postgresql://user:password@localhost/coreinventory"
```

And install: `pip install psycopg2-binary`
