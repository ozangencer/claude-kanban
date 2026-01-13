import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import * as schema from "../lib/db/schema";

const dbPath = path.join(process.cwd(), "data", "kanban.db");
const sqlite = new Database(dbPath);
const db = drizzle(sqlite, { schema });

interface FolderProject {
  id: string;
  prefix: string;
  counter: number;
}

async function migrateProjects() {
  console.log("Starting project migration...");

  // Get all cards
  const allCards = db.select().from(schema.cards).all();
  console.log(`Found ${allCards.length} cards`);

  // Get unique project folders (non-empty)
  const uniqueFolders = [
    ...new Set(allCards.map((c) => c.projectFolder).filter(Boolean)),
  ];
  console.log(`Found ${uniqueFolders.length} unique project folders`);

  if (uniqueFolders.length === 0) {
    console.log("No project folders to migrate. Done.");
    return;
  }

  const now = new Date().toISOString();
  const folderToProject: Record<string, FolderProject> = {};

  // Create projects for each unique folder
  for (const folder of uniqueFolders) {
    const name = folder.split("/").pop() || folder;
    // Generate prefix from name (first 3 letters, uppercase)
    const prefix = name
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 3)
      .toUpperCase() || "PRJ";
    const projectId = uuidv4();

    console.log(`Creating project: ${name} (${prefix}) for folder: ${folder}`);

    db.insert(schema.projects)
      .values({
        id: projectId,
        name,
        folderPath: folder,
        idPrefix: prefix,
        nextTaskNumber: 1,
        color: "#5e6ad2",
        isPinned: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    folderToProject[folder] = { id: projectId, prefix, counter: 1 };
  }

  // Update cards with projectId and taskNumber
  // Sort by createdAt to assign task numbers in order
  const sortedCards = [...allCards]
    .filter((c) => c.projectFolder)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  for (const card of sortedCards) {
    if (card.projectFolder && folderToProject[card.projectFolder]) {
      const proj = folderToProject[card.projectFolder];
      console.log(
        `Updating card "${card.title}" -> ${proj.prefix}-${proj.counter}`
      );

      db.update(schema.cards)
        .set({
          projectId: proj.id,
          taskNumber: proj.counter,
        })
        .where(eq(schema.cards.id, card.id))
        .run();

      proj.counter++;
    }
  }

  // Update nextTaskNumber for each project
  for (const [folder, proj] of Object.entries(folderToProject)) {
    db.update(schema.projects)
      .set({ nextTaskNumber: proj.counter })
      .where(eq(schema.projects.id, proj.id))
      .run();
    console.log(`Project ${proj.prefix} nextTaskNumber set to ${proj.counter}`);
  }

  console.log("Migration completed successfully!");
}

migrateProjects().catch(console.error);
