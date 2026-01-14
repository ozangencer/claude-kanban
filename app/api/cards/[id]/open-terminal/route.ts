import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec, execSync, spawn } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { TerminalApp, Status } from "@/lib/types";

type Phase = "planning" | "implementation" | "retest";

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
  const description = stripHtml(card.description);
  const solution = card.solutionSummary ? stripHtml(card.solutionSummary) : "";
  const tests = card.testScenarios ? stripHtml(card.testScenarios) : "";

  const mcpInfo = `
## Kanban MCP Tools Available
You have access to kanban MCP tools to save your work:
- mcp__kanban__save_plan - Save solution plan and move card to In Progress
- mcp__kanban__save_tests - Save test scenarios and move card to Human Test
- mcp__kanban__update_card - Update any card field
- mcp__kanban__get_card - Get card details

Card ID for this task: ${card.id}

When you complete a phase, use the appropriate MCP tool to save your work.`;

  switch (phase) {
    case "planning":
      return `You are a senior software architect helping me plan this task.

## Task
${title}

## Description
${description}
${mcpInfo}

Analyze this task and help me create an implementation plan. Ask me questions if anything is unclear.

## CRITICAL: When Plan is Finalized
You MUST save the plan before finishing:
\`\`\`
mcp__kanban__save_plan({ id: "${card.id}", solutionSummary: "..." })
\`\`\`
This moves the card to In Progress. Do NOT end the session without saving the plan.`;

    case "implementation":
      return `You are a senior developer. I need help implementing this plan.

## Task
${title}

## Approved Solution Plan
${solution}
${mcpInfo}

Let's implement this together. Start with the first step and guide me through.

## CRITICAL: When Implementation is Complete
You MUST save test scenarios before finishing:
\`\`\`
mcp__kanban__save_tests({ id: "${card.id}", testScenarios: "..." })
\`\`\`
This moves the card to Human Test. Do NOT end the session without saving tests.`;

    case "retest":
      return `Let's verify these test scenarios together:

${tests}
${mcpInfo}

Start with the first test case.

When tests are complete, you can update the card using mcp__kanban__update_card with card ID ${card.id}.`;
  }
}

function getNewStatus(phase: Phase, currentStatus: Status): Status {
  switch (phase) {
    case "planning":
      return "progress";
    case "implementation":
      return "progress"; // Stay in progress during interactive implementation
    case "retest":
      return currentStatus;
  }
}

function getAppleScript(terminal: "iterm2" | "terminal", command: string): string {
  // For AppleScript double-quoted strings:
  // 1. Escape backslashes first: \ → \\
  // 2. Then escape double quotes: " → \"
  const escapedCommand = command
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');

  if (terminal === "iterm2") {
    return `
tell application "iTerm2"
    create window with default profile
    tell current session of current window
        write text "${escapedCommand}"
    end tell
end tell`;
  }

  // Terminal.app
  return `
tell application "Terminal"
    do script "${escapedCommand}"
    activate
end tell`;
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

  // Get terminal preference from settings
  const terminalSetting = db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "terminal_app"))
    .get();

  const terminal = (terminalSetting?.value || "iterm2") as TerminalApp;

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

  console.log(`[Open Terminal] Phase: ${phase}`);
  console.log(`[Open Terminal] Current status: ${card.status} → New status: ${newStatus}`);

  try {
    // Update card status in database BEFORE opening terminal
    if (card.status !== newStatus) {
      const updatedAt = new Date().toISOString();
      db.update(schema.cards)
        .set({
          status: newStatus,
          updatedAt,
        })
        .where(eq(schema.cards.id, id))
        .run();
    }

    // Replace newlines with spaces (AppleScript strings can't contain raw newlines)
    // Other escaping (quotes, backslashes) is handled by getAppleScript
    const cleanPrompt = prompt.replace(/\n/g, " ");

    // Note: kanban MCP server is globally configured via `claude mcp add`
    const claudeCommand = `cd "${workingDir}" && claude "${cleanPrompt}" --permission-mode plan`;

    console.log(`[Open Terminal] Working dir: ${workingDir}`);
    console.log(`[Open Terminal] Prompt length: ${prompt.length} chars`);
    console.log(`[Open Terminal] Terminal app: ${terminal}`);

    if (terminal === "ghostty") {
      // Ghostty doesn't support AppleScript
      // Copy command to clipboard and open Ghostty
      execSync(`echo "${claudeCommand.replace(/"/g, '\\"')}" | pbcopy`);
      exec("open -a Ghostty", (error) => {
        if (error) {
          console.error(`[Open Terminal] Error opening Ghostty: ${error.message}`);
        }
      });

      return NextResponse.json({
        success: true,
        cardId: id,
        phase,
        newStatus,
        workingDir,
        terminal,
        message: "Ghostty opened. Command copied to clipboard - press Cmd+V to paste.",
      });
    }

    // iTerm2 or Terminal.app - use AppleScript
    // Write command to temp script to avoid complex escaping
    const timestamp = Date.now();
    const scriptPath = join(tmpdir(), `claude-kanban-${timestamp}.sh`);
    writeFileSync(scriptPath, `#!/bin/bash\n${claudeCommand}\n`, { mode: 0o755 });

    // Note: App is named "iTerm" not "iTerm2" on this system
    const appName = terminal === "iterm2" ? "iTerm" : "Terminal";

    const appleScript = terminal === "iterm2"
      ? `tell application "${appName}"
    create window with default profile
    tell current session of current window
        write text "${scriptPath}"
    end tell
end tell`
      : `tell application "${appName}"
    do script "${scriptPath}"
    activate
end tell`;

    const osascriptProcess = spawn("osascript", []);
    osascriptProcess.stdin.write(appleScript);
    osascriptProcess.stdin.end();
    osascriptProcess.on("error", (error) => {
      console.error(`[Open Terminal] Error: ${error.message}`);
      try { unlinkSync(scriptPath); } catch {}
    });

    return NextResponse.json({
      success: true,
      cardId: id,
      phase,
      newStatus,
      workingDir,
      terminal,
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
