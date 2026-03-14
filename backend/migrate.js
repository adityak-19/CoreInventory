/**
 * CoreInventory — Database Migration & Seed Script
 * Run once: npm run db:migrate
 *
 * Safe to re-run (all inserts use ON CONFLICT DO NOTHING).
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./db.js";
import {
  seedProducts,
  seedWarehouses,
  seedLocations,
  seedStockByLocation,
  seedOperations,
  seedLedger,
} from "./seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function applySchema(client) {
  const sql = await readFile(resolve(__dirname, "schema.sql"), "utf8");
  await client.query(sql);
  console.log("✓ Schema applied");
}

async function seedAll(client) {
  // Products
  for (const p of seedProducts) {
    await client.query(
      `INSERT INTO products (id, name, sku, category, uom, reorder_level, cost_per_unit)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.sku, p.category, p.uom, p.reorderLevel, p.costPerUnit],
    );
  }
  console.log(`✓ Products seeded (${seedProducts.length})`);

  // Warehouses
  for (const w of seedWarehouses) {
    await client.query(
      `INSERT INTO warehouses (id, name, code, address)
       VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [w.id, w.name, w.code, w.address],
    );
  }
  console.log(`✓ Warehouses seeded (${seedWarehouses.length})`);

  // Locations
  for (const l of seedLocations) {
    await client.query(
      `INSERT INTO locations (id, name, code, warehouse_id)
       VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [l.id, l.name, l.code, l.warehouseId],
    );
  }
  console.log(`✓ Locations seeded (${seedLocations.length})`);

  // Stock by location
  for (const [productId, whMap] of Object.entries(seedStockByLocation)) {
    for (const [warehouseId, qty] of Object.entries(whMap)) {
      await client.query(
        `INSERT INTO stock_by_location (product_id, warehouse_id, qty)
         VALUES ($1,$2,$3) ON CONFLICT (product_id, warehouse_id) DO NOTHING`,
        [productId, warehouseId, qty],
      );
    }
  }
  console.log("✓ Stock by location seeded");

  // Operations + items
  for (const op of seedOperations) {
    await client.query(
      `INSERT INTO operations
         (id, type, status, warehouse_id, from_warehouse_id, to_warehouse_id,
          contact, schedule_date, responsible, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [
        op.id, op.type, op.status,
        op.warehouseId || null, op.fromWarehouseId || null, op.toWarehouseId || null,
        op.contact, op.scheduleDate, op.responsible, op.createdAt,
      ],
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
  console.log(`✓ Operations seeded (${seedOperations.length})`);

  // Ledger
  for (const entry of seedLedger) {
    await client.query(
      `INSERT INTO ledger
         (id, reference, type, product_id, qty_delta, from_location,
          to_location, contact, date, note, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO NOTHING`,
      [
        entry.id, entry.reference, entry.type, entry.productId,
        entry.qtyDelta, entry.from, entry.to, entry.contact,
        entry.date, entry.note, entry.status,
      ],
    );
  }
  console.log(`✓ Ledger seeded (${seedLedger.length})`);
}

async function ensureDemoUser(client) {
  const { rows } = await client.query(
    "SELECT id FROM users WHERE email = $1",
    ["demo@coreinventory.app"],
  );
  const passwordHash = await bcrypt.hash("Demo@1234!", 10);

  if (rows.length === 0) {
    await client.query(
      `INSERT INTO users (id, name, email, role, password_hash)
       VALUES ($1,$2,$3,$4,$5)`,
      [`u-${randomUUID()}`, "Demo Manager", "demo@coreinventory.app", "manager", passwordHash],
    );
    console.log("✓ Demo user created");
  } else {
    await client.query(
      "UPDATE users SET password_hash = $1, name = 'Demo Manager' WHERE email = $2",
      [passwordHash, "demo@coreinventory.app"],
    );
    console.log("✓ Demo user password reset to Demo@1234!");
  }
}

async function main() {
  console.log("\n🚀 CoreInventory — Running database migrations\n");

  const client = await pool.connect();
  try {
    await applySchema(client);
    await seedAll(client);
    await ensureDemoUser(client);
    console.log("\n✅ Migration complete. You can now run: npm run dev:full\n");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Migration failed:", err.message);
  console.error(err);
  process.exit(1);
});
