import { exec } from "child_process";
import { promisify } from "util";

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
 */
export async function squashMerge(
  projectPath: string,
  branchName: string,
  commitMessage: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const defaultBranch = await getDefaultBranch(projectPath);
    const currentBranch = await getCurrentBranch(projectPath);

    // If we're on the feature branch, checkout to default branch first
    if (currentBranch === branchName) {
      await execAsync(`git checkout ${defaultBranch}`, { cwd: projectPath });
    }

    // Squash merge
    await execAsync(`git merge --squash ${branchName}`, { cwd: projectPath });

    // Commit the squashed changes
    const escapedMessage = commitMessage.replace(/"/g, '\\"');
    await execAsync(`git commit -m "${escapedMessage}"`, { cwd: projectPath });

    // Delete the feature branch
    await execAsync(`git branch -d ${branchName}`, { cwd: projectPath });

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Rollback: checkout to main/master and optionally delete the feature branch
 */
export async function rollback(
  projectPath: string,
  branchName: string,
  deleteBranch: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const defaultBranch = await getDefaultBranch(projectPath);

    // Checkout to default branch
    await execAsync(`git checkout ${defaultBranch}`, { cwd: projectPath });

    // Optionally delete the feature branch
    if (deleteBranch) {
      // Use -D to force delete (in case of unmerged changes)
      await execAsync(`git branch -D ${branchName}`, { cwd: projectPath });
    }

    return { success: true };
  } catch (error) {
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
 */
export async function checkoutBranch(
  projectPath: string,
  branchName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check for uncommitted changes
    const { stdout: statusOutput } = await execAsync("git status --porcelain", {
      cwd: projectPath,
    });

    if (statusOutput.trim()) {
      return {
        success: false,
        error: "Uncommitted changes exist. Please commit or stash them first.",
      };
    }

    await execAsync(`git checkout ${branchName}`, { cwd: projectPath });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
