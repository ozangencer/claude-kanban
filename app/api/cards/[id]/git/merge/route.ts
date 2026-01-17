import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { squashMergeFromWorktree, isGitRepo, removeWorktree, pruneWorktrees, getDefaultBranch } from "@/lib/git";
import { existsSync } from "fs";
import { stopDevServer, isProcessRunning } from "@/lib/dev-server";
import { exec } from "child_process";
import { promisify } from "util";
import type { Status } from "@/lib/types";

const execAsync = promisify(exec);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Parse request body for options
  let commitFirst = false;
  try {
    const body = await request.json();
    commitFirst = body.commitFirst === true;
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

  // Stop dev server if running
  if (card.devServerPid && isProcessRunning(card.devServerPid)) {
    console.log(`[Merge] Stopping dev server with PID ${card.devServerPid}`);
    stopDevServer(card.devServerPid);
  }

  // Build commit message
  const displayId = project
    ? `${project.idPrefix}-${card.taskNumber}`
    : `TASK-${card.taskNumber || "X"}`;

  const commitMessage = `feat(${displayId}): ${card.title}\n\nSquash merge from branch: ${card.gitBranchName}`;

  try {
    // Step 1: Auto-commit uncommitted changes in worktree
    if (card.gitWorktreePath && existsSync(card.gitWorktreePath)) {
      console.log(`[Merge] Checking for uncommitted changes in worktree: ${card.gitWorktreePath}`);
      try {
        const { stdout: worktreeStatus } = await execAsync("git status --porcelain", {
          cwd: card.gitWorktreePath,
        });
        if (worktreeStatus.trim()) {
          console.log(`[Merge] Found uncommitted changes, auto-committing...`);
          // Stage all changes
          await execAsync("git add -A", { cwd: card.gitWorktreePath });
          // Commit with a descriptive message
          const autoCommitMessage = `feat(${displayId}): Work in progress changes`;
          await execAsync(`git commit -m "${autoCommitMessage}"`, { cwd: card.gitWorktreePath });
          console.log(`[Merge] Auto-committed changes successfully`);
        }
      } catch (statusError) {
        console.warn(`[Merge] Could not auto-commit worktree changes: ${statusError}`);
        // Continue anyway - worktree might be in a bad state or nothing to commit
      }
    }

    // Step 2: Check if branch has commits different from main
    const defaultBranch = await getDefaultBranch(workingDir);
    console.log(`[Merge] Checking commit count between ${defaultBranch} and ${card.gitBranchName}`);
    try {
      const { stdout: commitCount } = await execAsync(
        `git rev-list --count ${defaultBranch}..${card.gitBranchName}`,
        { cwd: workingDir }
      );
      const count = parseInt(commitCount.trim(), 10);
      console.log(`[Merge] Branch has ${count} commits ahead of ${defaultBranch}`);
      if (count === 0) {
        return NextResponse.json(
          {
            error: "No commits to merge - branch has no changes.",
            noCommits: true,
          },
          { status: 400 }
        );
      }
    } catch (countError) {
      console.warn(`[Merge] Could not check commit count: ${countError}`);
      // Continue anyway - we'll let the squash merge handle it
    }

    // Step 3: Check for uncommitted changes in main repo
    const { stdout: mainStatus } = await execAsync("git status --porcelain", { cwd: workingDir });
    if (mainStatus.trim()) {
      if (commitFirst) {
        // User requested to commit first
        console.log(`[Merge] Committing uncommitted changes in main repo...`);
        await execAsync("git add -A", { cwd: workingDir });
        await execAsync(`git commit -m "chore: Work in progress before merge"`, { cwd: workingDir });
        console.log(`[Merge] Main repo changes committed`);
      } else {
        // Return error with option to commit
        console.log(`[Merge] Uncommitted changes in main repo, asking user`);
        return NextResponse.json(
          {
            error: "There are uncommitted changes in the main repository.",
            uncommittedInMain: true,
          },
          { status: 400 }
        );
      }
    }

    // Step 4: Squash merge the branch into main (from the main repo)
    console.log(`[Merge] Squash merging branch: ${card.gitBranchName}`);
    const result = await squashMergeFromWorktree(workingDir, card.gitBranchName, commitMessage);

    if (!result.success) {
      console.error(`[Merge] Failed: ${result.error}`);
      return NextResponse.json(
        { error: `Merge failed: ${result.error}` },
        { status: 500 }
      );
    }

    // Step 4: Remove worktree AFTER successful merge
    if (card.gitWorktreePath) {
      console.log(`[Merge] Removing worktree: ${card.gitWorktreePath}`);
      const removeResult = await removeWorktree(workingDir, card.gitWorktreePath);
      if (!removeResult.success) {
        console.warn(`[Merge] Failed to remove worktree: ${removeResult.error}`);
        // Continue anyway - the worktree might have been deleted manually
      }
    }

    // Step 5: Delete the branch AFTER successful merge
    console.log(`[Merge] Deleting branch: ${card.gitBranchName}`);
    try {
      await execAsync(`git branch -D ${card.gitBranchName}`, { cwd: workingDir });
    } catch (branchError) {
      console.warn(`[Merge] Failed to delete branch: ${branchError}`);
      // Continue anyway - branch deletion is not critical
    }

    // Step 6: Prune any orphan worktrees
    await pruneWorktrees(workingDir);

    console.log(`[Merge] Success - branch merged, worktree removed, branch deleted`);

    // Update card - move to completed, clear git info
    const updatedAt = new Date().toISOString();
    const completedAt = new Date().toISOString();
    const newStatus: Status = "completed";

    db.update(schema.cards)
      .set({
        status: newStatus,
        // Keep gitBranchName for reference, update status
        gitBranchStatus: "merged",
        gitWorktreeStatus: "removed",
        // Clear dev server info
        devServerPort: null,
        devServerPid: null,
        updatedAt,
        completedAt,
      })
      .where(eq(schema.cards.id, id))
      .run();

    return NextResponse.json({
      success: true,
      cardId: id,
      newStatus,
      message: `Branch ${card.gitBranchName} merged, worktree removed, branch deleted`,
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
