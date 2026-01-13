import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec, execSync } from "child_process";
import type { TerminalApp } from "@/lib/types";

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
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
  const prompt = stripHtml(card.description);

  if (!prompt) {
    return NextResponse.json(
      { error: "Card has no description to use as prompt" },
      { status: 400 }
    );
  }

  try {
    // Escape for shell/AppleScript
    const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const escapedDir = workingDir.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    const claudeCommand = `cd "${escapedDir}" && claude "${escapedPrompt}" --permission-mode plan`;

    console.log(`[Open Terminal] Working dir: ${workingDir}`);
    console.log(`[Open Terminal] Prompt: ${prompt}`);
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
        workingDir,
        prompt,
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
      workingDir,
      prompt,
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
