import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creationsTable = pgTable("studio_creations", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  kind: text("kind").notNull(),
  audience: text("audience").notNull(),
  aspectRatio: text("aspect_ratio").notNull(),
  status: text("status").notNull().default("generating"),
  model: text("model").notNull(),
  objectPath: text("object_path"),
  error: text("error"),
  generationMetadata: jsonb("generation_metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertCreationSchema = createInsertSchema(creationsTable).omit({ createdAt: true });
export type StudioCreation = typeof creationsTable.$inferSelect;
export type InsertStudioCreation = z.infer<typeof insertCreationSchema>;

export const brandTable = pgTable("studio_brands", {
  ownerId: text("owner_id").primaryKey(),
  tagline: text("tagline").notNull(),
  website: text("website").notNull(),
  tone: text("tone").notNull(),
  logoPath: text("logo_path"),
});

export const uploadsTable = pgTable("studio_uploads", {
  objectPath: text("object_path").primaryKey(),
  ownerId: text("owner_id").notNull(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: text("size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
