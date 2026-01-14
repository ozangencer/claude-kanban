import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";
import { marked } from "marked";
import type { Status } from "@/lib/types";

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

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Convert marked checkbox output to TipTap TaskList format
function convertToTipTapTaskList(html: string): string {
  let result = html
    .replace(/<li><input[^>]*checked[^>]*>\s*/gi, '<li data-type="taskItem" data-checked="true">')
    .replace(/<li><input[^>]*type="checkbox"[^>]*>\s*/gi, '<li data-type="taskItem" data-checked="false">');

  result = result.replace(/<ul>(\s*<li data-type="taskItem")/g, '<ul data-type="taskList">$1');
  return result;
}

function escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

function buildQuickFixPrompt(card: { title: string; description: string }): string {
  const title = stripHtml(card.title);
  const description = stripHtml(card.description);

  return `You are a senior developer. Fix this bug quickly and efficiently.

## Bug Report
${title}

## Description
${description}

## Instructions
1. Analyze the bug description
2. Find the root cause in the codebase
3. Implement the fix
4. Verify the fix works

## Output Requirements
After fixing the bug, provide a brief summary in this format:

## Quick Fix Summary
- **Root Cause:** Brief description of what caused the bug
- **Fix Applied:** What was changed to fix it
- **Files Modified:** List of files that were changed

## Test Scenarios
- [ ] Bug no longer reproduces
- [ ] Related functionality still works
- [ ] No regression in existing tests

Focus on fixing the bug efficiently. Do NOT write extensive documentation or plans.`;
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

  // Verify card is in bugs status
  if (card.status !== "bugs") {
    return NextResponse.json(
      { error: "Quick fix is only available for cards in Bugs column" },
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

  if (!card.description || stripHtml(card.description) === "") {
    return NextResponse.json(
      { error: "Card has no description to use as prompt" },
      { status: 400 }
    );
  }

  console.log(`[Quick Fix] Starting quick fix for card ${id}`);
  console.log(`[Quick Fix] Working dir: ${workingDir}`);

  try {
    const prompt = buildQuickFixPrompt(card);
    const escapedPrompt = escapeShellArg(prompt);

    // Quick fix uses --dangerously-skip-permissions for full access
    // No plan mode - direct implementation
    const command = `CI=true claude -p ${escapedPrompt} --dangerously-skip-permissions --output-format json < /dev/null`;

    console.log(`[Quick Fix] Prompt length: ${prompt.length} chars`);

    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: 10 * 60 * 1000, // 10 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr) {
      console.log(`[Quick Fix] stderr: ${stderr}`);
    }

    let responseText = stdout.trim();
    let cost: number | undefined;
    let duration: number | undefined;

    try {
      const response: ClaudeResponse = JSON.parse(stdout);
      if (response.is_error) {
        throw new Error(response.result || "Claude returned an error");
      }
      responseText = response.result || "";
      cost = response.cost_usd;
      duration = response.duration_ms;
    } catch {
      console.log(`[Quick Fix] JSON parse failed, using raw output`);
    }

    // Convert markdown response to HTML for TipTap editor
    const markedHtml = await marked(responseText);
    const htmlResponse = convertToTipTapTaskList(markedHtml);

    // Parse response to extract summary and tests
    const summaryMatch = responseText.match(/## Quick Fix Summary[\s\S]*?(?=## Test Scenarios|$)/i);
    const testsMatch = responseText.match(/## Test Scenarios[\s\S]*/i);

    const solutionSummary = summaryMatch
      ? convertToTipTapTaskList(await marked(summaryMatch[0]))
      : htmlResponse;

    const testScenarios = testsMatch
      ? convertToTipTapTaskList(await marked(testsMatch[0]))
      : convertToTipTapTaskList(await marked("## Test Scenarios\n- [ ] Bug fix verified\n- [ ] No regression"));

    // Update database - move to test status
    const updatedAt = new Date().toISOString();
    const newStatus: Status = "test";

    db.update(schema.cards)
      .set({
        status: newStatus,
        solutionSummary,
        testScenarios,
        updatedAt,
      })
      .where(eq(schema.cards.id, id))
      .run();

    return NextResponse.json({
      success: true,
      cardId: id,
      newStatus,
      solutionSummary,
      testScenarios,
      cost,
      duration,
    });
  } catch (error) {
    console.error("Quick Fix error:", error);
    return NextResponse.json(
      {
        error: "Failed to run quick fix",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
