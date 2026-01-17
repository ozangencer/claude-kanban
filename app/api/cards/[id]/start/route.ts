import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";
import { marked } from "marked";
import type { Status } from "@/lib/types";
import {
  generateBranchName,
  isGitRepo,
  branchExists,
  createWorktree,
  worktreeExists,
  getWorktreePath,
} from "@/lib/git";

const execAsync = promisify(exec);

interface ClaudeResponse {
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  is_error?: boolean;
  num_turns?: number;
  session_id?: string;
}

type Phase = "planning" | "implementation" | "retest";

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Convert marked checkbox output to TipTap TaskList format
function convertToTipTapTaskList(html: string): string {
  // marked outputs: <li><input disabled="" type="checkbox"> text</li>
  // TipTap expects: <ul data-type="taskList"><li data-type="taskItem" data-checked="false">text</li></ul>

  // First, convert checked items (must come before unchecked to avoid false positives)
  let result = html
    // Checked: <li><input checked="" ...> → <li data-type="taskItem" data-checked="true">
    .replace(/<li><input[^>]*checked[^>]*>\s*/gi, '<li data-type="taskItem" data-checked="true">')
    // Unchecked: <li><input ...> (no checked) → <li data-type="taskItem" data-checked="false">
    .replace(/<li><input[^>]*type="checkbox"[^>]*>\s*/gi, '<li data-type="taskItem" data-checked="false">');

  // Convert <ul> containing taskItems to taskList
  result = result.replace(/<ul>(\s*<li data-type="taskItem")/g, '<ul data-type="taskList">$1');

  return result;
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function detectPhase(card: { solutionSummary: string | null; testScenarios: string | null }): Phase {
  const hasSolution = card.solutionSummary && stripHtml(card.solutionSummary) !== "";
  const hasTests = card.testScenarios && stripHtml(card.testScenarios) !== "";

  if (!hasSolution) return "planning";
  if (!hasTests) return "implementation";
  return "retest";
}

function buildPrompt(
  phase: Phase,
  card: { id: string; title: string; description: string; solutionSummary: string | null; testScenarios: string | null }
): string {
  const title = stripHtml(card.title);

  switch (phase) {
    case "planning":
      return `Kanban: ${card.id}

Read card via MCP (mcp__kanban__get_card). Review title, description, and any existing notes.

Task: Create implementation plan for "${title}".

Plan format:
- Files to Modify
- Implementation Steps
- Edge Cases
- Dependencies

Must include at the end:
[COMPLEXITY: trivial/low/medium/high/very_high]
[PRIORITY: low/medium/high]

Do NOT implement yet - plan only.`;

    case "implementation":
      return `Kanban: ${card.id}

Read card via MCP (mcp__kanban__get_card). Follow the approved plan in solutionSummary.

Task: Implement "${title}".

After coding, write test scenarios:
### Happy Path
- [ ] Test case

### Edge Cases
- [ ] Test case

### Regression
- [ ] Existing feature still works

Write code, then output only test scenarios.`;

    case "retest":
      return `Kanban: ${card.id}

Read card via MCP (mcp__kanban__get_card). Review previous implementation and test scenarios.

Task: "${title}" failed during testing.

User will describe the error - wait and fix.`;
  }
}

function getNewStatus(phase: Phase, currentStatus: Status): Status {
  switch (phase) {
    case "planning":
      return "progress";
    case "implementation":
      return "test";
    case "retest":
      return currentStatus; // Stay in current status
  }
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

  if (!card.description || stripHtml(card.description) === "") {
    return NextResponse.json(
      { error: "Card has no description to use as prompt" },
      { status: 400 }
    );
  }

  // Detect current phase
  const phase = detectPhase(card);
  const prompt = buildPrompt(phase, card);
  const newStatus = getNewStatus(phase, card.status as Status);

  console.log(`[Claude CLI] Phase: ${phase}`);
  console.log(`[Claude CLI] Current status: ${card.status} → New status: ${newStatus}`);

  // Handle git branch and worktree for implementation phase
  let gitBranchName = card.gitBranchName;
  let gitBranchStatus = card.gitBranchStatus;
  let gitWorktreePath = card.gitWorktreePath;
  let gitWorktreeStatus = card.gitWorktreeStatus;
  let actualWorkingDir = workingDir;

  if (phase === "implementation" && project && card.taskNumber) {
    const isRepo = await isGitRepo(workingDir);

    if (isRepo) {
      // Determine branch name
      let branchName = card.gitBranchName;
      if (!branchName) {
        branchName = generateBranchName(
          project.idPrefix,
          card.taskNumber,
          card.title
        );
      }

      // Check if worktree exists or needs to be created
      const expectedWorktreePath = getWorktreePath(workingDir, branchName);
      const worktreeExistsResult = await worktreeExists(workingDir, expectedWorktreePath);

      if (worktreeExistsResult) {
        // Worktree exists - use it
        console.log(`[Git Worktree] Using existing worktree: ${expectedWorktreePath}`);
        actualWorkingDir = expectedWorktreePath;
        gitWorktreePath = expectedWorktreePath;
        gitWorktreeStatus = "active";
        gitBranchName = branchName;
        gitBranchStatus = "active";
      } else {
        // Create new worktree (this also creates the branch if needed)
        console.log(`[Git Worktree] Creating worktree for branch: ${branchName}`);
        const worktreeResult = await createWorktree(workingDir, branchName);

        if (worktreeResult.success) {
          actualWorkingDir = worktreeResult.worktreePath;
          gitWorktreePath = worktreeResult.worktreePath;
          gitWorktreeStatus = "active";
          gitBranchName = branchName;
          gitBranchStatus = "active";
          console.log(`[Git Worktree] Created worktree at: ${worktreeResult.worktreePath}`);
        } else {
          console.error(`[Git Worktree] Failed to create worktree: ${worktreeResult.error}`);
          return NextResponse.json(
            { error: `Failed to create git worktree: ${worktreeResult.error}` },
            { status: 500 }
          );
        }
      }
    }
  } else if ((phase === "implementation" || phase === "retest") && card.gitWorktreePath) {
    // For retest or subsequent implementation runs, use existing worktree
    const worktreeExistsResult = await worktreeExists(workingDir, card.gitWorktreePath);
    if (worktreeExistsResult) {
      actualWorkingDir = card.gitWorktreePath;
      console.log(`[Git Worktree] Using existing worktree: ${actualWorkingDir}`);
    }
  }

  try {
    // Run Claude CLI in the appropriate directory (worktree for implementation)
    const result = await runClaudeCli(prompt, actualWorkingDir, phase);

    // Convert markdown response to HTML for TipTap editor
    const markedHtml = await marked(result.response);
    // Convert checkbox format for TipTap TaskList compatibility
    const htmlResponse = convertToTipTapTaskList(markedHtml);

    // Extract complexity and priority from planning phase response
    let complexity: string | null = null;
    let priority: string | null = null;

    if (phase === "planning") {
      const complexityMatch = result.response.match(/\[COMPLEXITY:\s*(trivial|low|medium|high|very_high)\]/i);
      if (complexityMatch) {
        complexity = complexityMatch[1].toLowerCase();
        console.log(`[Claude CLI] Extracted complexity: ${complexity}`);
      }

      const priorityMatch = result.response.match(/\[PRIORITY:\s*(low|medium|high)\]/i);
      if (priorityMatch) {
        priority = priorityMatch[1].toLowerCase();
        console.log(`[Claude CLI] Extracted priority: ${priority}`);
      }
    }

    // Prepare database updates based on phase
    const updatedAt = new Date().toISOString();
    const updates: Record<string, string | null> = {
      status: newStatus,
      updatedAt,
      gitBranchName,
      gitBranchStatus,
      gitWorktreePath,
      gitWorktreeStatus,
    };

    switch (phase) {
      case "planning":
        updates.solutionSummary = htmlResponse;
        // Add complexity and priority if extracted
        if (complexity) updates.complexity = complexity;
        if (priority) updates.priority = priority;
        break;
      case "implementation":
        updates.testScenarios = htmlResponse;
        break;
      case "retest":
        // Update testScenarios with results
        updates.testScenarios = htmlResponse;
        break;
    }

    // Update database
    db.update(schema.cards)
      .set(updates)
      .where(eq(schema.cards.id, id))
      .run();

    return NextResponse.json({
      success: true,
      cardId: id,
      phase,
      newStatus,
      response: htmlResponse,
      complexity,
      priority,
      cost: result.cost,
      duration: result.duration,
      gitBranchName,
      gitBranchStatus,
      gitWorktreePath,
      gitWorktreeStatus,
    });
  } catch (error) {
    console.error("Claude CLI error:", error);
    return NextResponse.json(
      {
        error: "Failed to run Claude CLI",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function runClaudeCli(
  prompt: string,
  cwd: string,
  phase: Phase
): Promise<{ response: string; cost?: number; duration?: number }> {
  const escapedPrompt = escapeShellArg(prompt);

  // Planning phase uses dontAsk for safety (read-only exploration)
  // Implementation and retest need full permissions to write code
  const permissionFlag = phase === "planning"
    ? "--permission-mode dontAsk"
    : "--dangerously-skip-permissions";

  const command = `CI=true claude -p ${escapedPrompt} ${permissionFlag} --output-format json < /dev/null`;

  console.log(`[Claude CLI] Running in ${cwd}:`);
  console.log(`[Claude CLI] Prompt length: ${prompt.length} chars`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 10 * 60 * 1000, // 10 minute timeout for implementation
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr) {
      console.log(`[Claude CLI] stderr: ${stderr}`);
    }

    console.log(`[Claude CLI] stdout length: ${stdout.length}`);

    try {
      const response: ClaudeResponse = JSON.parse(stdout);

      if (response.is_error) {
        throw new Error(response.result || "Claude returned an error");
      }

      return {
        response: response.result || "",
        cost: response.cost_usd,
        duration: response.duration_ms,
      };
    } catch {
      console.log(`[Claude CLI] JSON parse failed, using raw output`);
      return { response: stdout.trim() };
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("TIMEOUT")) {
      throw new Error("Claude CLI timed out after 10 minutes");
    }
    throw error;
  }
}
