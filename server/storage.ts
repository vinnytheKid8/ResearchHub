import { collections, items } from '@shared/schema';
import type { Collection, InsertCollection, Item, InsertItem } from '@shared/schema';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { eq, asc } from 'drizzle-orm';
import path from 'node:path';
import fs from 'node:fs';

// Data directory: configurable via HUB_DATA_DIR. Defaults to project cwd for backward compat.
export const DATA_DIR = path.resolve(process.env.HUB_DATA_DIR || process.cwd());
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'data.db');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
console.log(`[hub] data dir: ${DATA_DIR}`);

// Bootstrap tables (drizzle migrations not wired in template)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#06b6d4',
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    mime_type TEXT,
    size INTEGER,
    content TEXT,
    is_text INTEGER NOT NULL DEFAULT 1,
    storage_path TEXT,
    url TEXT,
    collection_id INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    tagged_users TEXT NOT NULL DEFAULT '[]',
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_collection ON items(collection_id);
  CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind);
`);

// Lazy migration for existing DBs created before storage_path existed.
try {
  const cols = sqlite.prepare("PRAGMA table_info(items)").all() as { name: string }[];
  if (!cols.some((c) => c.name === 'storage_path')) {
    sqlite.exec(`ALTER TABLE items ADD COLUMN storage_path TEXT`);
    console.log('[hub] migrated items table: added storage_path');
  }
  if (!cols.some((c) => c.name === 'tagged_users')) {
    sqlite.exec(`ALTER TABLE items ADD COLUMN tagged_users TEXT NOT NULL DEFAULT '[]'`);
    console.log('[hub] migrated items table: added tagged_users');
  }
} catch (err) {
  console.error('[hub] migration check failed:', err);
}

export const db = drizzle(sqlite);

// Item shape returned to clients without heavy `content` payload
export type ItemSummary = Omit<Item, 'content'>;

function summarize(row: Item): ItemSummary {
  const { content: _content, ...rest } = row;
  return rest;
}

// Resolve a storage_path stored in the DB to an absolute path under UPLOADS_DIR.
// Refuses paths that escape the uploads dir (defense-in-depth against tampered DBs).
export function resolveStoragePath(storagePath: string): string {
  const abs = path.resolve(UPLOADS_DIR, storagePath);
  if (!abs.startsWith(UPLOADS_DIR + path.sep) && abs !== UPLOADS_DIR) {
    throw new Error(`storage path escapes uploads dir: ${storagePath}`);
  }
  return abs;
}

export interface IStorage {
  listCollections(): Promise<Collection[]>;
  getCollection(id: number): Promise<Collection | undefined>;
  createCollection(c: InsertCollection): Promise<Collection>;
  updateCollection(id: number, patch: Partial<InsertCollection>): Promise<Collection | undefined>;
  deleteCollection(id: number): Promise<void>;

  listItems(filter?: { collectionId?: number | null; kind?: 'file' | 'link' }): Promise<ItemSummary[]>;
  listItemsForCollection(collectionId: number): Promise<ItemSummary[]>;
  getItem(id: number): Promise<Item | undefined>;
  createItem(i: InsertItem): Promise<Item>;
  updateItem(id: number, patch: Partial<InsertItem>): Promise<Item | undefined>;
  deleteItem(id: number): Promise<void>;
  reorderItems(ids: number[]): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async listCollections() {
    return db
      .select()
      .from(collections)
      .orderBy(asc(collections.position), asc(collections.id))
      .all();
  }
  async getCollection(id: number) {
    return db.select().from(collections).where(eq(collections.id, id)).get();
  }
  async createCollection(c: InsertCollection) {
    const max = db
      .select({ p: collections.position })
      .from(collections)
      .orderBy(asc(collections.position))
      .all();
    const nextPos = max.length ? max[max.length - 1].p + 1 : 0;
    return db
      .insert(collections)
      .values({ ...c, position: nextPos, createdAt: Date.now() })
      .returning()
      .get();
  }
  async updateCollection(id: number, patch: Partial<InsertCollection>) {
    return db
      .update(collections)
      .set(patch)
      .where(eq(collections.id, id))
      .returning()
      .get();
  }
  async deleteCollection(id: number) {
    // Items in this collection get unfiled (collection_id -> null)
    db.update(items).set({ collectionId: null }).where(eq(items.collectionId, id)).run();
    db.delete(collections).where(eq(collections.id, id)).run();
  }

  async listItems(filter?: { collectionId?: number | null; kind?: 'file' | 'link' }) {
    let rows = db
      .select()
      .from(items)
      .orderBy(asc(items.position), asc(items.id))
      .all();
    if (filter?.collectionId !== undefined) {
      rows = rows.filter((r) =>
        filter.collectionId === null ? r.collectionId === null : r.collectionId === filter.collectionId,
      );
    }
    if (filter?.kind) rows = rows.filter((r) => r.kind === filter.kind);
    return rows.map(summarize);
  }
  async listItemsForCollection(collectionId: number) {
    const rows = db
      .select()
      .from(items)
      .where(eq(items.collectionId, collectionId))
      .orderBy(asc(items.position), asc(items.id))
      .all();
    return rows.map(summarize);
  }
  async getItem(id: number) {
    return db.select().from(items).where(eq(items.id, id)).get();
  }
  async createItem(i: InsertItem) {
    const all = db.select({ p: items.position }).from(items).all();
    const nextPos = all.length ? Math.max(...all.map((r) => r.p)) + 1 : 0;
    const now = Date.now();
    return db
      .insert(items)
      .values({ ...i, position: nextPos, createdAt: now, updatedAt: now })
      .returning()
      .get();
  }
  async updateItem(id: number, patch: Partial<InsertItem>) {
    return db
      .update(items)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(items.id, id))
      .returning()
      .get();
  }
  async deleteItem(id: number) {
    // Clean up on-disk file if any
    const row = db.select().from(items).where(eq(items.id, id)).get();
    if (row?.storagePath) {
      try {
        fs.unlinkSync(resolveStoragePath(row.storagePath));
      } catch (err: any) {
        if (err?.code !== 'ENOENT') console.error('[hub] failed to delete file', row.storagePath, err);
      }
    }
    db.delete(items).where(eq(items.id, id)).run();
  }
  async reorderItems(ids: number[]) {
    const now = Date.now();
    const tx = sqlite.transaction((idArr: number[]) => {
      idArr.forEach((id, idx) => {
        db.update(items).set({ position: idx, updatedAt: now }).where(eq(items.id, id)).run();
      });
    });
    tx(ids);
  }
}

export const storage = new DatabaseStorage();
