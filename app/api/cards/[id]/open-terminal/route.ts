import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec } from "child_process";
import { writeFileSync, unlinkSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Get the card from database
  const card = db
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.id, id))
    .get();

  if (!card) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  // Get project for working directory
  const project = card.projectId
    ? db
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.id, card.projectId))
        .get()
    : null;

  const workingDir = project?.folderPath || card.projectFolder || process.cwd();
  const prompt = stripHtml(card.description);

  if (!prompt) {
    return NextResponse.json(
      { error: "Card has no description to use as prompt" },
      { status: 400 }
    );
  }

  try {
    // Create a temporary script file
    const scriptPath = join(tmpdir(), `claude-task-${id}.sh`);

    const scriptContent = `#!/bin/bash
cd "${workingDir}"
claude "${prompt.replace(/"/g, '\\"')}" --permission-mode plan
# Keep terminal open after completion
exec bash
`;

    writeFileSync(scriptPath, scriptContent);
    chmodSync(scriptPath, "755");

    console.log(`[Open Terminal] Script: ${scriptPath}`);
    console.log(`[Open Terminal] Working dir: ${workingDir}`);
    console.log(`[Open Terminal] Prompt: ${prompt}`);

    // Open Ghostty with the script
    const ghosttyCommand = `open -na Ghostty.app --args -e "${scriptPath}"`;

    exec(ghosttyCommand, (error) => {
      if (error) {
        console.error(`[Open Terminal] Error: ${error.message}`);
      }
      // Clean up script after a delay
      setTimeout(() => {
        try {
          unlinkSync(scriptPath);
        } catch {
          // Ignore cleanup errors
        }
      }, 5000);
    });

    return NextResponse.json({
      success: true,
      cardId: id,
      workingDir,
      prompt,
    });
  } catch (error) {
    console.error("Open terminal error:", error);
    return NextResponse.json(
      {
        error: "Failed to open terminal",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
