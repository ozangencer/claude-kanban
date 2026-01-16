import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { createBackup } from "@/lib/backup";
import { ExportData } from "../export/route";

// POST /api/backup/import - Import data from JSON
export async function POST(request: NextRequest) {
  try {
    const data: ExportData = await request.json();

    // Validate the import data
    if (!data.version || !data.cards || !data.projects) {
      return NextResponse.json(
        { error: "Invalid import file format" },
        { status: 400 }
      );
    }

    // Create a backup before import
    const preImportBackup = createBackup();

    // Clear existing data and import new
    // Using transactions would be ideal but better-sqlite3 in drizzle handles this well

    // 1. Delete all existing data
    db.delete(schema.cards).run();
    db.delete(schema.projects).run();
    db.delete(schema.settings).run();

    // 2. Import projects first (cards depend on projects)
    for (const project of data.projects) {
      db.insert(schema.projects).values({
        id: project.id,
        name: project.name,
        folderPath: project.folderPath,
        idPrefix: project.idPrefix,
        nextTaskNumber: project.nextTaskNumber,
        color: project.color,
        isPinned: project.isPinned,
        documentPaths: project.documentPaths,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      }).run();
    }

    // 3. Import cards
    for (const card of data.cards) {
      db.insert(schema.cards).values({
        id: card.id,
        title: card.title,
        description: card.description,
        solutionSummary: card.solutionSummary,
        testScenarios: card.testScenarios,
        aiOpinion: card.aiOpinion,
        status: card.status,
        complexity: card.complexity,
        priority: card.priority,
        projectFolder: card.projectFolder,
        projectId: card.projectId,
        taskNumber: card.taskNumber,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
        completedAt: card.completedAt,
      }).run();
    }

    // 4. Import settings
    if (data.settings) {
      for (const setting of data.settings) {
        db.insert(schema.settings).values({
          key: setting.key,
          value: setting.value,
          updatedAt: setting.updatedAt,
        }).run();
      }
    }

    return NextResponse.json({
      success: true,
      imported: {
        cards: data.cards.length,
        projects: data.projects.length,
        settings: data.settings?.length || 0,
      },
      preImportBackup: preImportBackup.filename,
    });
  } catch (error) {
    console.error("Failed to import data:", error);
    return NextResponse.json(
      { error: "Failed to import data" },
      { status: 500 }
    );
  }
}
