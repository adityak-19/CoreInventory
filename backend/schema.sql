-- CoreInventory PostgreSQL Schema
-- Safe to run multiple times (idempotent via IF NOT EXISTS / ON CONFLICT)

CREATE TABLE IF NOT EXISTS users (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  email        TEXT        UNIQUE NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'manager',
  password_hash TEXT       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reset_otps (
  email      TEXT   PRIMARY KEY,
  otp        TEXT   NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id            TEXT           PRIMARY KEY,
  name          TEXT           NOT NULL,
  sku           TEXT           UNIQUE NOT NULL,
  category      TEXT           NOT NULL DEFAULT 'General',
  uom           TEXT           NOT NULL DEFAULT 'pcs',
  reorder_level INTEGER        NOT NULL DEFAULT 0,
  cost_per_unit NUMERIC(14,2)  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS warehouses (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  code    TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS locations (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  code         TEXT NOT NULL,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_by_location (
  product_id   TEXT    NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  warehouse_id TEXT    NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  qty          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS operations (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'Draft',
  warehouse_id      TEXT,
  from_warehouse_id TEXT,
  to_warehouse_id   TEXT,
  contact           TEXT,
  schedule_date     TEXT,
  responsible       TEXT,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operation_items (
  id           TEXT    PRIMARY KEY,
  operation_id TEXT    NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  product_id   TEXT    NOT NULL,
  qty          INTEGER NOT NULL DEFAULT 0,
  done_qty     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ledger (
  id            TEXT    PRIMARY KEY,
  reference     TEXT,
  type          TEXT    NOT NULL,
  product_id    TEXT,
  qty_delta     INTEGER NOT NULL DEFAULT 0,
  from_location TEXT,
  to_location   TEXT,
  contact       TEXT,
  date          TEXT    NOT NULL,
  note          TEXT,
  status        TEXT    NOT NULL DEFAULT 'Done'
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_operations_type   ON operations(type);
CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
CREATE INDEX IF NOT EXISTS idx_ledger_date       ON ledger(date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_product    ON ledger(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_product     ON stock_by_location(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_warehouse   ON stock_by_location(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_locations_wh      ON locations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_op_items_op       ON operation_items(operation_id);
