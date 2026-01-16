import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { squashMerge, isGitRepo } from "@/lib/git";
import type { Status } from "@/lib/types";

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

  // Verify card is in test status
  if (card.status !== "test") {
    return NextResponse.json(
      { error: "Merge is only available for cards in Human Test column" },
      { status: 400 }
    );
  }

  // Verify card has a git branch
  if (!card.gitBranchName) {
    return NextResponse.json(
      { error: "Card has no git branch to merge" },
      { status: 400 }
    );
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

  // Verify it's a git repo
  const isRepo = await isGitRepo(workingDir);
  if (!isRepo) {
    return NextResponse.json(
      { error: "Project directory is not a git repository" },
      { status: 400 }
    );
  }

  console.log(`[Merge] Starting squash merge for card ${id}`);
  console.log(`[Merge] Branch: ${card.gitBranchName}`);
  console.log(`[Merge] Working dir: ${workingDir}`);

  // Build commit message
  const displayId = project
    ? `${project.idPrefix}-${card.taskNumber}`
    : `TASK-${card.taskNumber || "X"}`;

  const commitMessage = `feat(${displayId}): ${card.title}\n\nSquash merge from branch: ${card.gitBranchName}`;

  try {
    const result = await squashMerge(workingDir, card.gitBranchName, commitMessage);

    if (!result.success) {
      console.error(`[Merge] Failed: ${result.error}`);
      return NextResponse.json(
        { error: `Merge failed: ${result.error}` },
        { status: 500 }
      );
    }

    console.log(`[Merge] Success - branch merged and deleted`);

    // Update card - move to completed, clear git info
    const updatedAt = new Date().toISOString();
    const newStatus: Status = "completed";

    db.update(schema.cards)
      .set({
        status: newStatus,
        // Keep gitBranchName for reference, update status
        gitBranchStatus: "merged",
        updatedAt,
      })
      .where(eq(schema.cards.id, id))
      .run();

    return NextResponse.json({
      success: true,
      cardId: id,
      newStatus,
      message: `Branch ${card.gitBranchName} merged and deleted`,
    });
  } catch (error) {
    console.error("[Merge] Error:", error);
    return NextResponse.json(
      {
        error: "Merge failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
