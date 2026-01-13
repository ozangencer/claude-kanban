import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import fs from "fs";
import path from "path";
import { DocumentFile } from "@/lib/types";

function findMarkdownFiles(
  dir: string,
  baseDir: string,
  maxDepth: number = 3,
  currentDepth: number = 0
): DocumentFile[] {
  const files: DocumentFile[] = [];

  if (currentDepth > maxDepth) return files;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip common non-relevant directories
        if (
          entry.name.startsWith(".") ||
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === "build"
        ) {
          continue;
        }

        // Recurse into docs/ directory at any level, or notes/
        if (entry.name === "docs" || entry.name === "notes") {
          files.push(...findMarkdownFiles(fullPath, baseDir, maxDepth, currentDepth + 1));
        }
      } else if (entry.name.endsWith(".md")) {
        const relativePath = path.relative(baseDir, fullPath);
        files.push({
          name: entry.name,
          path: fullPath,
          relativePath,
          isClaudeMd: entry.name === "CLAUDE.md",
        });
      }
    }
  } catch (error) {
    console.error("Error reading directory:", dir, error);
  }

  return files;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const project = db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check if folder exists
    if (!fs.existsSync(project.folderPath)) {
      return NextResponse.json([]);
    }

    const documents: DocumentFile[] = [];

    // Find all .md files in root directory
    try {
      const rootEntries = fs.readdirSync(project.folderPath, { withFileTypes: true });
      for (const entry of rootEntries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const fullPath = path.join(project.folderPath, entry.name);
          documents.push({
            name: entry.name,
            path: fullPath,
            relativePath: entry.name,
            isClaudeMd: entry.name === "CLAUDE.md",
          });
        }
      }
    } catch (error) {
      console.error("Error reading root directory:", error);
    }

    // Find all .md files in docs/ folder
    const docsDir = path.join(project.folderPath, "docs");
    if (fs.existsSync(docsDir)) {
      documents.push(...findMarkdownFiles(docsDir, project.folderPath));
    }

    // Find all .md files in notes/ folder
    const notesDir = path.join(project.folderPath, "notes");
    if (fs.existsSync(notesDir)) {
      documents.push(...findMarkdownFiles(notesDir, project.folderPath));
    }

    // Sort: CLAUDE.md first, then alphabetically
    documents.sort((a, b) => {
      if (a.isClaudeMd) return -1;
      if (b.isClaudeMd) return 1;
      return a.relativePath.localeCompare(b.relativePath);
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error("Failed to fetch documents:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}
