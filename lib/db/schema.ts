import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Projects tablosu
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  folderPath: text("folder_path").notNull(),
  idPrefix: text("id_prefix").notNull(),
  nextTaskNumber: integer("next_task_number").notNull().default(1),
  color: text("color").notNull().default("#5e6ad2"),
  isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(false),
  documentPaths: text("document_paths"), // JSON array of custom document paths, null = smart discovery
  narrativePath: text("narrative_path"), // Relative path to narrative file, null = use default (docs/product-narrative.md)
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type ProjectRecord = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// Cards tablosu
export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  solutionSummary: text("solution_summary").notNull().default(""),
  testScenarios: text("test_scenarios").notNull().default(""),
  aiOpinion: text("ai_opinion").notNull().default(""),
  status: text("status").notNull().default("backlog"),
  complexity: text("complexity").notNull().default("medium"),
  priority: text("priority").notNull().default("medium"),
  projectFolder: text("project_folder").notNull().default(""),
  projectId: text("project_id"),
  taskNumber: integer("task_number"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  completedAt: text("completed_at"),  // ISO date string, null if not completed
});

export type CardRecord = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;

// Settings tablosu - key-value store
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type SettingRecord = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
