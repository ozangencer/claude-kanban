import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec, execSync } from "child_process";
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
  card: { title: string; description: string; solutionSummary: string | null; testScenarios: string | null }
): string {
  const title = stripHtml(card.title);
  const description = stripHtml(card.description);
  const solution = card.solutionSummary ? stripHtml(card.solutionSummary) : "";
  const tests = card.testScenarios ? stripHtml(card.testScenarios) : "";

  switch (phase) {
    case "planning":
      return `You are a senior software architect helping me plan this task.

## Task
${title}

## Description
${description}

Analyze this task and help me create an implementation plan. Ask me questions if anything is unclear.`;

    case "implementation":
      return `You are a senior developer. I need help implementing this plan.

## Task
${title}

## Approved Solution Plan
${solution}

Let's implement this together. Start with the first step and guide me through.`;

    case "retest":
      return `Let's verify these test scenarios together:

${tests}

Start with the first test case.`;
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
  const escapedCommand = command.replace(/"/g, '\\"');

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

    // Escape for shell/AppleScript
    const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const escapedDir = workingDir.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    const claudeCommand = `cd "${escapedDir}" && claude "${escapedPrompt}" --permission-mode plan`;

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

    // iTerm2 or Terminal.app
    const appleScript = getAppleScript(terminal, claudeCommand);

    exec(`osascript -e '${appleScript.replace(/'/g, "'\\''")}'`, (error) => {
      if (error) {
        console.error(`[Open Terminal] Error: ${error.message}`);
      }
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
