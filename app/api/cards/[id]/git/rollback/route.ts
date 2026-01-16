import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { rollback, isGitRepo } from "@/lib/git";
import type { Status } from "@/lib/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Parse request body for options
  let deleteBranch = true;
  try {
    const body = await request.json();
    if (body.deleteBranch === false) {
      deleteBranch = false;
    }
  } catch {
    // No body or invalid JSON - use defaults
  }

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
      { error: "Rollback is only available for cards in Human Test column" },
      { status: 400 }
    );
  }

  // Verify card has a git branch
  if (!card.gitBranchName) {
    return NextResponse.json(
      { error: "Card has no git branch to rollback" },
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

  console.log(`[Rollback] Starting rollback for card ${id}`);
  console.log(`[Rollback] Branch: ${card.gitBranchName}`);
  console.log(`[Rollback] Delete branch: ${deleteBranch}`);
  console.log(`[Rollback] Working dir: ${workingDir}`);

  try {
    const result = await rollback(workingDir, card.gitBranchName, deleteBranch);

    if (!result.success) {
      console.error(`[Rollback] Failed: ${result.error}`);
      return NextResponse.json(
        { error: `Rollback failed: ${result.error}` },
        { status: 500 }
      );
    }

    console.log(`[Rollback] Success - checked out to main${deleteBranch ? ", branch deleted" : ""}`);

    // Update card - move to bugs, clear git info
    const updatedAt = new Date().toISOString();
    const newStatus: Status = "bugs";

    db.update(schema.cards)
      .set({
        status: newStatus,
        // Keep gitBranchName for reference, update status
        gitBranchStatus: "rolled_back",
        // Clear test scenarios since test failed
        testScenarios: "",
        updatedAt,
      })
      .where(eq(schema.cards.id, id))
      .run();

    return NextResponse.json({
      success: true,
      cardId: id,
      newStatus,
      branchDeleted: deleteBranch,
      message: deleteBranch
        ? `Rolled back to main, branch ${card.gitBranchName} deleted`
        : `Rolled back to main, branch ${card.gitBranchName} preserved`,
    });
  } catch (error) {
    console.error("[Rollback] Error:", error);
    return NextResponse.json(
      {
        error: "Rollback failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
