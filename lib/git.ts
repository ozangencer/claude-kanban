import { exec } from "child_process";
import { promisify } from "util";
import { existsSync, mkdirSync } from "fs";
import { join, basename } from "path";

const execAsync = promisify(exec);

/**
 * Slugify a string for use in branch names
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

/**
 * Generate a branch name for a kanban card
 */
export function generateBranchName(
  idPrefix: string,
  taskNumber: number,
  title: string
): string {
  const slug = slugify(title);
  return `kanban/${idPrefix}-${taskNumber}-${slug}`;
}

/**
 * Check if a directory is a git repository
 */
export async function isGitRepo(projectPath: string): Promise<boolean> {
  try {
    await execAsync("git rev-parse --git-dir", { cwd: projectPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(projectPath: string): Promise<string> {
  const { stdout } = await execAsync("git branch --show-current", {
    cwd: projectPath,
  });
  return stdout.trim();
}

/**
 * Check if a branch exists (locally)
 */
export async function branchExists(
  projectPath: string,
  branchName: string
): Promise<boolean> {
  try {
    await execAsync(`git show-ref --verify --quiet refs/heads/${branchName}`, {
      cwd: projectPath,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Create and checkout a new branch from main/master
 * Automatically stashes uncommitted changes and restores them after
 */
export async function createBranch(
  projectPath: string,
  branchName: string
): Promise<{ success: boolean; error?: string; stashApplied?: boolean }> {
  let didStash = false;

  try {
    // Check if there are uncommitted changes FIRST
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: projectPath,
    });

    const hasChanges = statusOutput.trim() !== "";

    // Stash changes if needed
    if (hasChanges) {
      console.log("[Git] Stashing uncommitted changes...");
      await execAsync("git stash push -m 'kanban-auto-stash'", {
        cwd: projectPath,
      });
      didStash = true;
    }

    // Get the default branch
    const defaultBranch = await getDefaultBranch(projectPath);

    // Checkout to the default branch
    await execAsync(`git checkout ${defaultBranch}`, { cwd: projectPath });

    // Create and checkout the new branch
    await execAsync(`git checkout -b ${branchName}`, { cwd: projectPath });

    // Pop stash if we stashed
    if (didStash) {
      console.log("[Git] Restoring stashed changes...");
      try {
        await execAsync("git stash pop", { cwd: projectPath });
      } catch (stashError) {
        // Stash pop failed - likely conflicts
        console.error("[Git] Stash pop failed, changes remain in stash");
        return {
          success: true,
          stashApplied: false,
          error: "Branch created but stash could not be applied. Run 'git stash pop' manually.",
        };
      }
    }

    return { success: true, stashApplied: didStash };
  } catch (error) {
    // If we stashed but failed, try to restore
    if (didStash) {
      try {
        await execAsync("git stash pop", { cwd: projectPath });
      } catch {
        console.error("[Git] Could not restore stash after failure");
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get the default branch (main or master)
 */
export async function getDefaultBranch(projectPath: string): Promise<string> {
  try {
    // Try to get from remote
    const { stdout } = await execAsync(
      "git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo 'refs/heads/main'",
      { cwd: projectPath }
    );
    const ref = stdout.trim();
    return ref.replace("refs/remotes/origin/", "").replace("refs/heads/", "");
  } catch {
    // Fallback: check if main exists, otherwise use master
    try {
      await execAsync("git show-ref --verify --quiet refs/heads/main", {
        cwd: projectPath,
      });
      return "main";
    } catch {
      return "master";
    }
  }
}

/**
 * Squash merge a branch into main/master and delete the branch
 * Automatically stashes uncommitted changes and restores them after
 */
export async function squashMerge(
  projectPath: string,
  branchName: string,
  commitMessage: string
): Promise<{ success: boolean; error?: string }> {
  let didStash = false;

  try {
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: projectPath,
    });

    const hasChanges = statusOutput.trim() !== "";

    // Stash changes if needed
    if (hasChanges) {
      console.log("[Git] Stashing uncommitted changes before merge...");
      await execAsync("git stash push -m 'kanban-merge-stash'", {
        cwd: projectPath,
      });
      didStash = true;
    }

    const defaultBranch = await getDefaultBranch(projectPath);
    const currentBranch = await getCurrentBranch(projectPath);

    // If we're on the feature branch, checkout to default branch first
    if (currentBranch === branchName) {
      await execAsync(`git checkout ${defaultBranch}`, { cwd: projectPath });
    }

    // Squash merge
    await execAsync(`git merge --squash ${branchName}`, { cwd: projectPath });

    // Check if there are STAGED changes to commit after squash merge
    // git diff --cached --quiet exits with 1 if there are staged changes, 0 if none
    let hasStagedChanges = false;
    try {
      await execAsync("git diff --cached --quiet", { cwd: projectPath });
      hasStagedChanges = false;
    } catch {
      hasStagedChanges = true;
    }

    if (hasStagedChanges) {
      // Commit the squashed changes
      // Split message into title and body, use multiple -m flags for proper formatting
      const [title, ...bodyParts] = commitMessage.split('\n\n');
      const body = bodyParts.join('\n\n');
      const escapedTitle = title.replace(/"/g, '\\"');
      const escapedBody = body.replace(/"/g, '\\"');

      const commitCmd = body
        ? `git commit -m "${escapedTitle}" -m "${escapedBody}"`
        : `git commit -m "${escapedTitle}"`;

      await execAsync(commitCmd, { cwd: projectPath });
      console.log("[Git] Squash merge committed successfully");
    } else {
      console.log("[Git] No changes to commit after squash merge (branch may have no unique commits)");
    }

    // Delete the feature branch (use -D because squash merge doesn't mark as merged)
    await execAsync(`git branch -D ${branchName}`, { cwd: projectPath });

    // Pop stash if we stashed
    if (didStash) {
      console.log("[Git] Restoring stashed changes after merge...");
      try {
        await execAsync("git stash pop", { cwd: projectPath });
      } catch {
        console.error("[Git] Stash pop failed after merge, changes remain in stash");
      }
    }

    return { success: true };
  } catch (error) {
    // Try to restore stash on failure
    if (didStash) {
      try {
        await execAsync("git stash pop", { cwd: projectPath });
      } catch {
        console.error("[Git] Could not restore stash after failure");
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Rollback: checkout to main/master and optionally delete the feature branch
 * Automatically stashes uncommitted changes and restores them after
 */
export async function rollback(
  projectPath: string,
  branchName: string,
  deleteBranch: boolean
): Promise<{ success: boolean; error?: string }> {
  let didStash = false;

  try {
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: projectPath,
    });

    const hasChanges = statusOutput.trim() !== "";

    // Stash changes if needed
    if (hasChanges) {
      console.log("[Git] Stashing uncommitted changes before rollback...");
      await execAsync("git stash push -m 'kanban-rollback-stash'", {
        cwd: projectPath,
      });
      didStash = true;
    }

    const defaultBranch = await getDefaultBranch(projectPath);

    // Checkout to default branch
    await execAsync(`git checkout ${defaultBranch}`, { cwd: projectPath });

    // Optionally delete the feature branch
    if (deleteBranch) {
      // Use -D to force delete (in case of unmerged changes)
      await execAsync(`git branch -D ${branchName}`, { cwd: projectPath });
    }

    // Pop stash if we stashed
    if (didStash) {
      console.log("[Git] Restoring stashed changes after rollback...");
      try {
        await execAsync("git stash pop", { cwd: projectPath });
      } catch {
        console.error("[Git] Stash pop failed after rollback, changes remain in stash");
      }
    }

    return { success: true };
  } catch (error) {
    // Try to restore stash on failure
    if (didStash) {
      try {
        await execAsync("git stash pop", { cwd: projectPath });
      } catch {
        console.error("[Git] Could not restore stash after failure");
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get branch status (ahead/behind main)
 */
export async function getBranchStatus(
  projectPath: string,
  branchName: string
): Promise<{ ahead: number; behind: number; exists: boolean }> {
  try {
    const defaultBranch = await getDefaultBranch(projectPath);

    // Check if branch exists
    const exists = await branchExists(projectPath, branchName);
    if (!exists) {
      return { ahead: 0, behind: 0, exists: false };
    }

    // Get ahead/behind count
    const { stdout } = await execAsync(
      `git rev-list --left-right --count ${defaultBranch}...${branchName}`,
      { cwd: projectPath }
    );

    const [behind, ahead] = stdout.trim().split(/\s+/).map(Number);

    return { ahead: ahead || 0, behind: behind || 0, exists: true };
  } catch {
    return { ahead: 0, behind: 0, exists: false };
  }
}

/**
 * Checkout to an existing branch
 * Automatically stashes uncommitted changes and restores them after
 */
export async function checkoutBranch(
  projectPath: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  let didStash = false;

  try {
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: projectPath,
    });

    const hasChanges = statusOutput.trim() !== "";

    // Stash changes if needed
    if (hasChanges) {
      console.log("[Git] Stashing uncommitted changes before checkout...");
      await execAsync("git stash push -m 'kanban-checkout-stash'", {
        cwd: projectPath,
      });
      didStash = true;
    }

    await execAsync(`git checkout ${branchName}`, { cwd: projectPath });

    // Pop stash if we stashed
    if (didStash) {
      console.log("[Git] Restoring stashed changes after checkout...");
      try {
        await execAsync("git stash pop", { cwd: projectPath });
      } catch {
        console.error("[Git] Stash pop failed after checkout, changes remain in stash");
      }
    }

    return { success: true };
  } catch (error) {
    // Try to restore stash on failure
    if (didStash) {
      try {
        await execAsync("git stash pop", { cwd: projectPath });
      } catch {
        console.error("[Git] Could not restore stash after failure");
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// Git Worktree Functions
// ============================================

/**
 * Get the base directory for worktrees
 * Returns: /project/.worktrees/kanban
 */
export function getWorktreeBaseDir(projectPath: string): string {
  return join(projectPath, ".worktrees", "kanban");
}

/**
 * Get the worktree path for a specific branch
 * Example: /project/.worktrees/kanban/KAN-1-add-auth
 */
export function getWorktreePath(projectPath: string, branchName: string): string {
  // Extract the branch name part after "kanban/" prefix
  const branchPart = branchName.startsWith("kanban/")
    ? branchName.slice(7) // Remove "kanban/" prefix
    : branchName;

  return join(getWorktreeBaseDir(projectPath), branchPart);
}

/**
 * Check if a worktree exists at the given path
 */
export async function worktreeExists(
  projectPath: string,
  worktreePath: string
): Promise<boolean> {
  try {
    // Check if directory exists
    if (!existsSync(worktreePath)) {
      return false;
    }

    // Verify it's a valid worktree by listing worktrees
    const { stdout } = await execAsync("git worktree list --porcelain", {
      cwd: projectPath,
    });

    return stdout.includes(`worktree ${worktreePath}`);
  } catch {
    return false;
  }
}

interface WorktreeInfo {
  path: string;
  branch: string | null;
  commit: string;
  isLocked: boolean;
  isPrunable: boolean;
}

/**
 * List all worktrees for a project
 */
export async function listWorktrees(projectPath: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execAsync("git worktree list --porcelain", {
      cwd: projectPath,
    });

    const worktrees: WorktreeInfo[] = [];
    const entries = stdout.trim().split("\n\n");

    for (const entry of entries) {
      if (!entry.trim()) continue;

      const lines = entry.split("\n");
      const info: Partial<WorktreeInfo> = {
        isLocked: false,
        isPrunable: false,
      };

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          info.path = line.slice(9);
        } else if (line.startsWith("HEAD ")) {
          info.commit = line.slice(5);
        } else if (line.startsWith("branch refs/heads/")) {
          info.branch = line.slice(18);
        } else if (line === "locked") {
          info.isLocked = true;
        } else if (line === "prunable") {
          info.isPrunable = true;
        }
      }

      if (info.path && info.commit) {
        worktrees.push(info as WorktreeInfo);
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}

/**
 * Create a new worktree for a branch
 * If the branch doesn't exist, creates it from the default branch
 */
export async function createWorktree(
  projectPath: string,
  branchName: string
): Promise<{ success: boolean; worktreePath: string; error?: string }> {
  const worktreePath = getWorktreePath(projectPath, branchName);
  const baseDir = getWorktreeBaseDir(projectPath);

  try {
    // Ensure base directory exists
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
      console.log(`[Git Worktree] Created base directory: ${baseDir}`);
    }

    // Check if worktree already exists
    const exists = await worktreeExists(projectPath, worktreePath);
    if (exists) {
      console.log(`[Git Worktree] Worktree already exists: ${worktreePath}`);
      return { success: true, worktreePath };
    }

    // Check if branch exists
    const branchExistsResult = await branchExists(projectPath, branchName);

    if (branchExistsResult) {
      // Branch exists - create worktree with existing branch
      console.log(`[Git Worktree] Creating worktree for existing branch: ${branchName}`);
      await execAsync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: projectPath,
      });
    } else {
      // Branch doesn't exist - create new branch and worktree
      const defaultBranch = await getDefaultBranch(projectPath);
      console.log(`[Git Worktree] Creating new branch and worktree: ${branchName} from ${defaultBranch}`);
      await execAsync(`git worktree add -b ${branchName} "${worktreePath}" ${defaultBranch}`, {
        cwd: projectPath,
      });
    }

    console.log(`[Git Worktree] Created worktree at: ${worktreePath}`);
    return { success: true, worktreePath };
  } catch (error) {
    console.error(`[Git Worktree] Failed to create worktree:`, error);
    return {
      success: false,
      worktreePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Remove a worktree
 */
export async function removeWorktree(
  projectPath: string,
  worktreePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if worktree exists
    const exists = await worktreeExists(projectPath, worktreePath);
    if (!exists) {
      console.log(`[Git Worktree] Worktree doesn't exist, skipping removal: ${worktreePath}`);
      return { success: true };
    }

    // Remove the worktree (force to handle uncommitted changes)
    console.log(`[Git Worktree] Removing worktree: ${worktreePath}`);
    await execAsync(`git worktree remove --force "${worktreePath}"`, {
      cwd: projectPath,
    });

    console.log(`[Git Worktree] Worktree removed successfully`);
    return { success: true };
  } catch (error) {
    console.error(`[Git Worktree] Failed to remove worktree:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Prune orphan worktrees (cleanup stale worktree references)
 */
export async function pruneWorktrees(
  projectPath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Git Worktree] Pruning stale worktrees...`);
    await execAsync("git worktree prune", { cwd: projectPath });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Squash merge from a worktree branch into the default branch
 * Works from the main repository, not the worktree
 */
export async function squashMergeFromWorktree(
  projectPath: string,
  branchName: string,
  commitMessage: string
): Promise<{ success: boolean; error?: string; uncommittedInMain?: boolean }> {
  try {
    // Check for uncommitted changes in main repo
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: projectPath,
    });

    const hasChanges = statusOutput.trim() !== "";

    // Block merge if there are uncommitted changes
    if (hasChanges) {
      console.log("[Git Worktree] Uncommitted changes found in main repo, blocking merge");
      return {
        success: false,
        error: "There are uncommitted changes in the main repository. Please commit your changes first.",
        uncommittedInMain: true,
      };
    }

    const defaultBranch = await getDefaultBranch(projectPath);
    const currentBranch = await getCurrentBranch(projectPath);

    // If we're not on the default branch, checkout to it
    if (currentBranch !== defaultBranch) {
      console.log(`[Git Worktree] Checking out to ${defaultBranch}...`);
      await execAsync(`git checkout ${defaultBranch}`, { cwd: projectPath });
    }

    // Squash merge the branch
    console.log(`[Git Worktree] Squash merging ${branchName}...`);
    await execAsync(`git merge --squash ${branchName}`, { cwd: projectPath });

    // Check if there are staged changes to commit
    let hasStagedChanges = false;
    try {
      await execAsync("git diff --cached --quiet", { cwd: projectPath });
      hasStagedChanges = false;
    } catch {
      hasStagedChanges = true;
    }

    if (hasStagedChanges) {
      // Commit the squashed changes
      const [title, ...bodyParts] = commitMessage.split("\n\n");
      const body = bodyParts.join("\n\n");
      const escapedTitle = title.replace(/"/g, '\\"');
      const escapedBody = body.replace(/"/g, '\\"');

      const commitCmd = body
        ? `git commit -m "${escapedTitle}" -m "${escapedBody}"`
        : `git commit -m "${escapedTitle}"`;

      await execAsync(commitCmd, { cwd: projectPath });
      console.log("[Git Worktree] Squash merge committed successfully");
      return { success: true };
    } else {
      console.log("[Git Worktree] No changes to commit - branch has no commits different from main");
      return {
        success: false,
        error: "No changes to merge - branch has no commits different from main",
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
