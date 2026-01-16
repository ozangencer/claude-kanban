import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec, execSync, spawn } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { TerminalApp, Status } from "@/lib/types";
import {
  createBranch,
  generateBranchName,
  isGitRepo,
  checkoutBranch,
  branchExists,
} from "@/lib/git";

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

interface PromptContext {
  card: {
    id: string;
    title: string;
    description: string;
    solutionSummary: string | null;
    testScenarios: string | null;
  };
  displayId: string | null;
  gitBranchName: string | null;
}

function buildPrompt(phase: Phase, ctx: PromptContext): string {
  const { card, displayId, gitBranchName } = ctx;
  const title = stripHtml(card.title);
  const description = stripHtml(card.description);
  const solution = card.solutionSummary ? stripHtml(card.solutionSummary) : "";
  const tests = card.testScenarios ? stripHtml(card.testScenarios) : "";

  const taskHeader = displayId ? `[${displayId}] ${title}` : title;
  const branchInfo = gitBranchName ? `Git Branch: ${gitBranchName}` : "";

  switch (phase) {
    case "implementation":
      return `# ${taskHeader}
${branchInfo}

## Plan
${solution}

## Instructions
Implement the plan above. When done, save test scenarios with:
mcp__kanban__save_tests({ id: "${card.id}", testScenarios: "..." })`;

    case "retest":
      return `# ${taskHeader}
${branchInfo}

## Test Scenarios
${tests}

## Instructions
Verify each test scenario. If all pass, use mcp__kanban__update_card to mark complete.
If tests fail, fix the issues and re-run tests.

Card ID: ${card.id}`;

    // Planning phase should not reach here (blocked earlier), but just in case
    default:
      return `# ${taskHeader}

## Description
${description}

Create an implementation plan for this task.`;
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

  // Block terminal if planning phase - must complete planning first
  if (phase === "planning") {
    return NextResponse.json(
      {
        error: "Plan oluşturulmadan implementation başlatılamaz",
        details: "Önce Solution Summary alanını doldurun veya Autonomous modda planning çalıştırın.",
      },
      { status: 400 }
    );
  }

  const newStatus = getNewStatus(phase, card.status as Status);

  console.log(`[Open Terminal] Phase: ${phase}`);
  console.log(`[Open Terminal] Current status: ${card.status} → New status: ${newStatus}`);

  // Branch creation for implementation phase
  let gitBranchName = card.gitBranchName;

  if (phase === "implementation" && project && card.taskNumber) {
    const repoCheck = await isGitRepo(workingDir);

    if (repoCheck && !card.gitBranchName) {
      // Create new branch for implementation
      const branchName = generateBranchName(
        project.idPrefix,
        card.taskNumber,
        card.title
      );

      console.log(`[Open Terminal] Creating branch: ${branchName}`);
      const result = await createBranch(workingDir, branchName);

      if (result.success) {
        gitBranchName = branchName;

        // Update card with branch info
        db.update(schema.cards)
          .set({
            gitBranchName: branchName,
            gitBranchStatus: "active",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(schema.cards.id, id))
          .run();

        console.log(`[Open Terminal] Branch created: ${branchName}`);
      } else {
        console.error(`[Open Terminal] Branch creation failed: ${result.error}`);
        return NextResponse.json(
          { error: `Git branch yaratılamadı: ${result.error}` },
          { status: 500 }
        );
      }
    } else if (repoCheck && card.gitBranchName) {
      // Branch already exists - checkout to it
      const exists = await branchExists(workingDir, card.gitBranchName);
      if (exists) {
        console.log(`[Open Terminal] Checking out existing branch: ${card.gitBranchName}`);
        const checkoutResult = await checkoutBranch(workingDir, card.gitBranchName);
        if (!checkoutResult.success) {
          console.error(`[Open Terminal] Checkout failed: ${checkoutResult.error}`);
          return NextResponse.json(
            { error: `Branch checkout failed: ${checkoutResult.error}` },
            { status: 500 }
          );
        }
      }
    }
  }

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
    // KANBAN_CARD_ID env var is used by the hook to detect kanban sessions
    const claudeCommand = `cd "${workingDir}" && KANBAN_CARD_ID="${id}" claude "${cleanPrompt}" --permission-mode plan`;

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
        gitBranchName,
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
      gitBranchName,
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
