import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const templateIdeasTable = pgTable("studio_template_ideas", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  prompt: text("prompt").notNull(),
  audience: text("audience").notNull(),
  kind: text("kind").notNull(),
  category: text("category").notNull(),
  feature: text("feature").notNull(),
  angle: text("angle").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("suggested"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertTemplateIdeaSchema = createInsertSchema(templateIdeasTable).omit({ createdAt: true });
export type TemplateIdeaRow = typeof templateIdeasTable.$inferSelect;
export type InsertTemplateIdea = z.infer<typeof insertTemplateIdeaSchema>;
