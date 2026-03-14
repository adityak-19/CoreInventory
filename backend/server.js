/**
 * CoreInventory — Express API Server (PostgreSQL backend)
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, withTransaction } from "./db.js";
import {
  seedProducts,
  seedWarehouses,
  seedLocations,
  seedStockByLocation,
  seedOperations,
  seedLedger,
} from "./seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const JWT_SECRET = process.env.JWT_SECRET || "coreinventory-dev-secret";

// ── Auth rate-limiting ──────────────────────────────────────────────────────
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 20;
const authHitMap = new Map();

function authRateLimit(req, res, next) {
  const now = Date.now();
  const key = `${req.ip}:${req.path}`;
  const entry = authHitMap.get(key) || { count: 0, resetAt: now + AUTH_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + AUTH_WINDOW_MS; }
  entry.count += 1;
  authHitMap.set(key, entry);
  if (entry.count > AUTH_MAX_ATTEMPTS) {
    return res.status(429).json({ error: "Too many auth requests. Please retry shortly." });
  }
  return next();
}

// ── Input helpers ───────────────────────────────────────────────────────────
function sanitizeText(value, maxLen = 120) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}
function isStrongPassword(pw) {
  const s = String(pw || "");
  return s.length >= 8 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /[^A-Za-z0-9]/.test(s);
}
function isValidLoginId(id) { return /^[A-Za-z0-9]{6,12}$/.test(String(id || "")); }
function isObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

// ── JWT helpers ─────────────────────────────────────────────────────────────
function createToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name, role: user.role || "manager" },
    JWT_SECRET,
    { expiresIn: "8h" },
  );
}
function sanitizeUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role || "manager", createdAt: user.created_at };
}
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing access token" });
  try { req.user = jwt.verify(token, JWT_SECRET); return next(); }
  catch { return res.status(401).json({ error: "Invalid or expired access token" }); }
}

// ── App setup ───────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ── Health (includes DB status) ─────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  let dbOk = false;
  try { await pool.query("SELECT 1"); dbOk = true; } catch { /* intentional */ }
  res.json({ ok: dbOk, service: "coreinventory-backend", db: "postgresql", time: new Date().toISOString() });
});

// ── Auth: Sign up ───────────────────────────────────────────────────────────
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password)
      return res.status(400).json({ error: "name, email and password are required" });
    const loginId = sanitizeText(name, 20);
    if (!isValidLoginId(loginId))
      return res.status(400).json({ error: "Login ID must be 6-12 alphanumeric characters" });
    if (!isStrongPassword(password))
      return res.status(400).json({ error: "Password must be 8+ chars with uppercase, lowercase and special character" });
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (rows.length > 0) return res.status(409).json({ error: "User already exists" });
    const passwordHash = await bcrypt.hash(String(password), 10);
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (id, name, email, role, password_hash)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, created_at`,
      [`u-${randomUUID()}`, loginId, normalizedEmail, role || "manager", passwordHash],
    );
    return res.status(201).json({ user: sanitizeUser(user), token: createToken(user) });
  } catch (err) {
    console.error("/signup error:", err.message);
    return res.status(500).json({ error: "Server error during sign-up" });
  }
});

// ── Auth: Login ─────────────────────────────────────────────────────────────
app.post("/api/auth/login", authRateLimit, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query(
      "SELECT id, name, email, role, password_hash, created_at FROM users WHERE email = $1",
      [normalizedEmail],
    );
    if (rows.length === 0) return res.status(401).json({ error: "Invalid credentials" });
    const user = rows[0];
    const valid = await bcrypt.compare(String(password), user.password_hash || "");
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    return res.json({ user: sanitizeUser(user), token: createToken(user) });
  } catch (err) {
    console.error("/login error:", err.message);
    return res.status(500).json({ error: "Server error during login" });
  }
});

// ── Auth: Request password reset OTP ─────────────────────────────────────────
app.post("/api/auth/request-reset", authRateLimit, async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "email is required" });
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (rows.length === 0) return res.status(404).json({ error: "User not found" });
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + 5 * 60 * 1000;
    await pool.query(
      `INSERT INTO reset_otps (email, otp, expires_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET otp = $2, expires_at = $3`,
      [normalizedEmail, otp, expiresAt],
    );
    return res.json({ message: "OTP generated", otp, expiresInSeconds: 300 });
  } catch (err) {
    console.error("/request-reset error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Auth: Verify OTP and reset password ──────────────────────────────────────
app.post("/api/auth/verify-reset", authRateLimit, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword)
      return res.status(400).json({ error: "email, otp and newPassword are required" });
    if (!isStrongPassword(newPassword))
      return res.status(400).json({ error: "New password does not meet complexity requirements" });
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await pool.query("SELECT otp, expires_at FROM reset_otps WHERE email = $1", [normalizedEmail]);
    if (rows.length === 0 || rows[0].otp !== String(otp) || Date.now() > Number(rows[0].expires_at))
      return res.status(400).json({ error: "Invalid or expired OTP" });
    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [passwordHash, normalizedEmail]);
    await pool.query("DELETE FROM reset_otps WHERE email = $1", [normalizedEmail]);
    return res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error("/verify-reset error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Inventory helpers ─────────────────────────────────────────────────────────
async function readInventoryState() {
  const [
    { rows: products },
    { rows: warehouses },
    { rows: locations },
    { rows: stockRows },
    { rows: operations },
    { rows: opItems },
    { rows: ledger },
  ] = await Promise.all([
    pool.query(`SELECT id, name, sku, category, uom,
                       reorder_level AS "reorderLevel",
                       cost_per_unit AS "costPerUnit"
                FROM products ORDER BY name`),
    pool.query(`SELECT id, name, code, address FROM warehouses ORDER BY name`),
    pool.query(`SELECT id, name, code, warehouse_id AS "warehouseId" FROM locations ORDER BY name`),
    pool.query(`SELECT product_id AS "productId", warehouse_id AS "warehouseId", qty FROM stock_by_location`),
    pool.query(`SELECT id, type, status,
                       warehouse_id      AS "warehouseId",
                       from_warehouse_id AS "fromWarehouseId",
                       to_warehouse_id   AS "toWarehouseId",
                       contact, schedule_date AS "scheduleDate",
                       responsible, created_at AS "createdAt"
                FROM operations ORDER BY created_at DESC`),
    pool.query(`SELECT id, operation_id AS "operationId", product_id AS "productId",
                       qty, done_qty AS "doneQty"
                FROM operation_items`),
    pool.query(`SELECT id, reference, type, product_id AS "productId",
                       qty_delta     AS "qtyDelta",
                       from_location AS "from",
                       to_location   AS "to",
                       contact, date, note, status
                FROM ledger ORDER BY date DESC`),
  ]);

  const stockByLocation = {};
  for (const row of stockRows) {
    if (!stockByLocation[row.productId]) stockByLocation[row.productId] = {};
    stockByLocation[row.productId][row.warehouseId] = Number(row.qty);
  }

  const opsWithItems = operations.map((op) => ({
    ...op,
    items: opItems
      .filter((i) => i.operationId === op.id)
      .map(({ operationId: _id, ...rest }) => ({ ...rest, qty: Number(rest.qty), doneQty: Number(rest.doneQty) })),
  }));

  return { products, warehouses, locations, stockByLocation, operations: opsWithItems, ledger };
}

// ── GET /api/inventory/state ──────────────────────────────────────────────────
app.get("/api/inventory/state", requireAuth, async (_req, res) => {
  try {
    return res.json(await readInventoryState());
  } catch (err) {
    console.error("GET /api/inventory/state:", err.message);
    return res.status(500).json({ error: "Failed to read inventory state" });
  }
});

// ── PUT /api/inventory/state (full transactional sync) ───────────────────────
app.put("/api/inventory/state", requireAuth, async (req, res) => {
  try {
    const { products, warehouses, locations, stockByLocation, operations, ledger } = req.body || {};
    if (
      !Array.isArray(products) || !Array.isArray(warehouses) || !Array.isArray(locations) ||
      !isObject(stockByLocation) || !Array.isArray(operations) || !Array.isArray(ledger)
    ) return res.status(400).json({ error: "Invalid inventory state payload" });
    if (products.length > 10000 || warehouses.length > 200 || locations.length > 2000 ||
        operations.length > 50000 || ledger.length > 200000)
      return res.status(413).json({ error: "Payload exceeds allowed size limits" });

    await withTransaction(async (client) => {
      // Clear in safe dependency order
      await client.query("DELETE FROM ledger");
      await client.query("DELETE FROM operation_items");
      await client.query("DELETE FROM operations");
      await client.query("DELETE FROM stock_by_location");
      await client.query("DELETE FROM locations");
      await client.query("DELETE FROM warehouses");
      await client.query("DELETE FROM products");

      for (const p of products) {
        await client.query(
          `INSERT INTO products (id, name, sku, category, uom, reorder_level, cost_per_unit) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [p.id, sanitizeText(p.name), sanitizeText(p.sku, 50), sanitizeText(p.category || "General"),
           sanitizeText(p.uom || "pcs", 20), Number(p.reorderLevel) || 0, Number(p.costPerUnit) || 0],
        );
      }
      for (const w of warehouses) {
        await client.query(
          `INSERT INTO warehouses (id, name, code, address) VALUES ($1,$2,$3,$4)`,
          [w.id, sanitizeText(w.name), sanitizeText(w.code, 50), sanitizeText(w.address || "")],
        );
      }
      for (const l of locations) {
        await client.query(
          `INSERT INTO locations (id, name, code, warehouse_id) VALUES ($1,$2,$3,$4)`,
          [l.id, sanitizeText(l.name), sanitizeText(l.code, 50), l.warehouseId],
        );
      }
      for (const [productId, whMap] of Object.entries(stockByLocation)) {
        if (!isObject(whMap)) continue;
        for (const [warehouseId, qty] of Object.entries(whMap)) {
          await client.query(
            `INSERT INTO stock_by_location (product_id, warehouse_id, qty) VALUES ($1,$2,$3)`,
            [productId, warehouseId, Number(qty) || 0],
          );
        }
      }
      for (const op of operations) {
        await client.query(
          `INSERT INTO operations
             (id, type, status, warehouse_id, from_warehouse_id, to_warehouse_id,
              contact, schedule_date, responsible, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [op.id, op.type, op.status,
           op.warehouseId || null, op.fromWarehouseId || null, op.toWarehouseId || null,
           sanitizeText(op.contact || ""), sanitizeText(op.scheduleDate || ""),
           sanitizeText(op.responsible || ""), op.createdAt || new Date().toISOString()],
        );
        for (const item of op.items || []) {
          const itemId = item.id || `${op.id}::${item.productId}::${randomUUID().slice(0, 8)}`;
          await client.query(
            `INSERT INTO operation_items (id, operation_id, product_id, qty, done_qty) VALUES ($1,$2,$3,$4,$5)`,
            [itemId, op.id, item.productId, Number(item.qty) || 0, Number(item.doneQty) || 0],
          );
        }
      }
      for (const entry of ledger) {
        await client.query(
          `INSERT INTO ledger (id, reference, type, product_id, qty_delta,
                               from_location, to_location, contact, date, note, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [entry.id, entry.reference || null, entry.type, entry.productId || null,
           Number(entry.qtyDelta) || 0, entry.from || null, entry.to || null,
           entry.contact || null, entry.date, entry.note || null, entry.status || "Done"],
        );
      }
    });

    return res.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("PUT /api/inventory/state:", err.message);
    return res.status(500).json({ error: "Failed to persist inventory state" });
  }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("[Unhandled]", err);
  res.status(500).json({ error: "Unexpected server error" });
});

// ── Bootstrap: schema + seed + demo user ─────────────────────────────────────
async function applySchema() {
  const sql = await readFile(resolve(__dirname, "schema.sql"), "utf8");
  await pool.query(sql);
}

async function ensureSeedData() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM products");
  if (rows[0].count > 0) return;
  console.log("  Seeding initial data...");

  await withTransaction(async (client) => {
    for (const p of seedProducts) {
      await client.query(
        `INSERT INTO products (id, name, sku, category, uom, reorder_level, cost_per_unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
        [p.id, p.name, p.sku, p.category, p.uom, p.reorderLevel, p.costPerUnit],
      );
    }
    for (const w of seedWarehouses) {
      await client.query(
        `INSERT INTO warehouses (id, name, code, address) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
        [w.id, w.name, w.code, w.address],
      );
    }
    for (const l of seedLocations) {
      await client.query(
        `INSERT INTO locations (id, name, code, warehouse_id) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
        [l.id, l.name, l.code, l.warehouseId],
      );
    }
    for (const [productId, whMap] of Object.entries(seedStockByLocation)) {
      for (const [warehouseId, qty] of Object.entries(whMap)) {
        await client.query(
          `INSERT INTO stock_by_location (product_id, warehouse_id, qty)
           VALUES ($1,$2,$3) ON CONFLICT (product_id, warehouse_id) DO NOTHING`,
          [productId, warehouseId, qty],
        );
      }
    }
    for (const op of seedOperations) {
      await client.query(
        `INSERT INTO operations
           (id, type, status, warehouse_id, from_warehouse_id, to_warehouse_id,
            contact, schedule_date, responsible, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
        [op.id, op.type, op.status,
         op.warehouseId || null, op.fromWarehouseId || null, op.toWarehouseId || null,
         op.contact, op.scheduleDate, op.responsible, op.createdAt],
      );
      for (const item of op.items || []) {
        const itemId = `${op.id}::${item.productId}`;
        await client.query(
          `INSERT INTO operation_items (id, operation_id, product_id, qty, done_qty)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
          [itemId, op.id, item.productId, item.qty, item.doneQty || 0],
        );
      }
    }
    for (const entry of seedLedger) {
      await client.query(
        `INSERT INTO ledger (id, reference, type, product_id, qty_delta,
                             from_location, to_location, contact, date, note, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
        [entry.id, entry.reference, entry.type, entry.productId, entry.qtyDelta,
         entry.from, entry.to, entry.contact, entry.date, entry.note, entry.status],
      );
    }
  });
  console.log("  ✓ Initial data seeded");
}

async function ensureDemoUser() {
  const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", ["demo@coreinventory.app"]);
  const passwordHash = await bcrypt.hash("Demo@1234!", 10);
  if (rows.length === 0) {
    await pool.query(
      `INSERT INTO users (id, name, email, role, password_hash) VALUES ($1,$2,$3,$4,$5)`,
      [`u-${randomUUID()}`, "Demo Manager", "demo@coreinventory.app", "manager", passwordHash],
    );
  } else {
    await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [passwordHash, "demo@coreinventory.app"]);
  }
  console.log("  ✓ Demo user ready (demo@coreinventory.app / Demo@1234!)");
}

async function bootstrap() {
  console.log("\nCoreInventory backend starting...");
  try {
    await pool.query("SELECT 1");
    console.log("  ✓ PostgreSQL connected");
  } catch (err) {
    console.error("\n❌ Cannot connect to PostgreSQL:", err.message);
    console.error("  Ensure PostgreSQL is running and .env credentials are correct.");
    console.error("  See README.md → Database Setup\n");
    process.exit(1);
  }
  try {
    await applySchema();
    console.log("  ✓ Schema ready");
    await ensureSeedData();
    await ensureDemoUser();
  } catch (err) {
    console.error("Bootstrap error:", err.message);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log(`\n  CoreInventory backend  →  http://localhost:${PORT}\n`);
  });
}

bootstrap();