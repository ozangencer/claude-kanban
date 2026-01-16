import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";
import { marked } from "marked";
import type { Status } from "@/lib/types";
import { createBranch, generateBranchName, isGitRepo, checkoutBranch, branchExists } from "@/lib/git";

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
  card: { title: string; description: string; solutionSummary: string | null; testScenarios: string | null }
): string {
  const title = stripHtml(card.title);
  const description = stripHtml(card.description);
  const solution = card.solutionSummary ? stripHtml(card.solutionSummary) : "";
  const tests = card.testScenarios ? stripHtml(card.testScenarios) : "";

  switch (phase) {
    case "planning":
      return `You are a senior software architect. Analyze this task and create a detailed implementation plan.

## Task
${title}

## Description
${description}

## Requirements
1. Identify all files that need to be modified
2. List implementation steps in order
3. Consider edge cases and error handling
4. Note any dependencies or prerequisites

## Output Format
Provide a structured plan in markdown:
- **Files to Modify**: List with brief description
- **Implementation Steps**: Numbered, actionable steps
- **Edge Cases**: Potential issues to handle
- **Dependencies**: Required packages or services
- **Notes**: Any important considerations

## REQUIRED: Assessment Tags
You MUST include these assessment tags at the END of your response:

[COMPLEXITY: trivial/low/medium/high/very_high]
(trivial = few lines, low = simple change, medium = moderate effort, high = significant work, very_high = major undertaking)

[PRIORITY: low/medium/high]
(Based on urgency, impact, and dependencies. Be honest - not everything is high priority!)

Do NOT implement yet - only plan.`;

    case "implementation":
      return `You are a senior developer. Implement the following plan and write test scenarios.

## Task
${title}

## Description
${description}

## Approved Solution Plan
${solution}

## Instructions
1. Implement the solution according to the plan above
2. Follow existing code patterns in the project
3. After implementation, write test scenarios in markdown

## Test Scenarios Output Format
## Test Scenarios for ${title}

### Happy Path
- [ ] Test case 1: Description
- [ ] Test case 2: Description

### Edge Cases
- [ ] Test case 3: Description

### Regression Checks
- [ ] Existing functionality X still works

Implement the code, then output ONLY the test scenarios markdown.`;

    case "retest":
      return `Re-run and verify these test scenarios:

## Task
${title}

## Test Scenarios
${tests}

Run each test and report results. Mark passing tests with ✅ and failing with ❌.`;
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

  // Handle git branch for implementation phase
  let gitBranchName = card.gitBranchName;
  let gitBranchStatus = card.gitBranchStatus;

  if (phase === "implementation" && project && card.taskNumber) {
    const isRepo = await isGitRepo(workingDir);

    if (isRepo) {
      // Check if card already has a branch
      if (!card.gitBranchName) {
        // Create new branch
        const branchName = generateBranchName(
          project.idPrefix,
          card.taskNumber,
          card.title
        );

        console.log(`[Git] Creating branch: ${branchName}`);

        const result = await createBranch(workingDir, branchName);

        if (result.success) {
          gitBranchName = branchName;
          gitBranchStatus = "active";
          console.log(`[Git] Branch created successfully: ${branchName}`);
        } else {
          console.error(`[Git] Failed to create branch: ${result.error}`);
          return NextResponse.json(
            { error: `Failed to create git branch: ${result.error}` },
            { status: 500 }
          );
        }
      } else {
        // Card already has a branch - checkout to it
        const exists = await branchExists(workingDir, card.gitBranchName);

        if (exists) {
          console.log(`[Git] Checking out existing branch: ${card.gitBranchName}`);
          const checkoutResult = await checkoutBranch(workingDir, card.gitBranchName);

          if (!checkoutResult.success) {
            console.error(`[Git] Failed to checkout branch: ${checkoutResult.error}`);
            return NextResponse.json(
              { error: `Failed to checkout git branch: ${checkoutResult.error}` },
              { status: 500 }
            );
          }
        } else {
          console.warn(`[Git] Branch ${card.gitBranchName} no longer exists`);
          // Branch was deleted externally, clear git info
          gitBranchName = null;
          gitBranchStatus = null;
        }
      }
    }
  }

  try {
    // Run Claude CLI
    const result = await runClaudeCli(prompt, workingDir, phase);

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

  // Phase 2 (Implementation) needs full permissions to write code
  // Other phases use dontAsk for safety
  const permissionFlag = phase === "implementation"
    ? "--dangerously-skip-permissions"
    : "--permission-mode dontAsk";

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
