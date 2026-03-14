import fs from "node:fs/promises";
import path from "node:path";
import { seedInventoryState } from "./seed.js";

const dataDir = path.resolve(process.cwd(), "backend", "data");
const dbPath = path.join(dataDir, "db.json");
const tempDbPath = path.join(dataDir, "db.tmp.json");

const fallbackDb = {
  users: [],
  resetOtps: [],
  inventoryState: seedInventoryState(),
};

async function ensureDbFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify(fallbackDb, null, 2), "utf8");
  }
}

let writeQueue = Promise.resolve();

async function readDbFileSafe() {
  const raw = await fs.readFile(dbPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    // Recovery path in case of partial writes from old versions.
    await fs.writeFile(dbPath, JSON.stringify(fallbackDb, null, 2), "utf8");
    return structuredClone(fallbackDb);
  }
}

export async function readDb() {
  await ensureDbFile();
  return readDbFileSafe();
}

export async function writeDb(nextDb) {
  writeQueue = writeQueue.then(async () => {
    await ensureDbFile();
    const payload = JSON.stringify(nextDb, null, 2);
    await fs.writeFile(tempDbPath, payload, "utf8");
    await fs.rename(tempDbPath, dbPath);
  });

  return writeQueue;
}
