import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Collections — colored folders for organizing items
export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#06b6d4"),
  description: text("description"),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

// Items — either an uploaded HTML/file or a web link
// kind: 'file' | 'link'
// For files: content holds raw HTML (or base64 for binary), mimeType set
// For links: url holds the destination
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(), // 'file' | 'link'
  name: text("name").notNull(),
  description: text("description"),

  // File-only fields
  mimeType: text("mime_type"),
  size: integer("size"),
  content: text("content"), // raw text for HTML/text, base64 for binary (small files & legacy)
  storagePath: text("storage_path"), // when set, file lives on disk under HUB_DATA_DIR/uploads/<path>
  isText: integer("is_text").notNull().default(1),

  // Link-only field
  url: text("url"),

  // Organization
  collectionId: integer("collection_id"),
  tags: text("tags").notNull().default("[]"), // JSON array
  taggedUsers: text("tagged_users").notNull().default("[]"), // JSON array of free-form user names (@-style)
  position: integer("position").notNull().default(0),

  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true,
  createdAt: true,
  position: true,
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  position: true,
});

export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type Item = typeof items.$inferSelect;
export type InsertItem = z.infer<typeof insertItemSchema>;
