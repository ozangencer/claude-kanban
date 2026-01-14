import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec, execSync, spawn } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { TerminalApp } from "@/lib/types";

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function buildIdeationPrompt(card: { id: string; title: string; description: string }): string {
  const title = stripHtml(card.title);
  const description = stripHtml(card.description);

  return `You are a Product Strategist. Let's brainstorm and refine this idea together.

## Idea to Discuss
**Title:** ${title}

**Description:**
${description}

## Your Role
1. Ask clarifying questions to understand the idea better
2. Challenge assumptions - consider YAGNI, scope creep risks
3. Explore alternatives and improvements
4. Help refine the concept into something actionable
5. Consider technical feasibility and implementation complexity

## Discussion Guidelines
- Be curious and ask probing questions
- Point out potential issues constructively
- Suggest improvements or alternatives
- Help prioritize if the idea is too broad
- Be honest but collaborative

## Kanban MCP Tools Available
- mcp__kanban__save_opinion - Save your final thoughts to the card
- mcp__kanban__update_card - Update card fields (including priority)
- mcp__kanban__get_card - Get card details

Card ID: ${card.id}

## CRITICAL: When Discussion Ends
Before finishing, you MUST do TWO things:

### 1. Update Priority
Based on our discussion, update the card priority:
\`\`\`
mcp__kanban__update_card({ id: "${card.id}", priority: "low" | "medium" | "high" })
\`\`\`
Be BRUTALLY HONEST - not everything is high priority!

### 2. Save Your Opinion
Your opinion MUST include EXACTLY these sections:
\`\`\`
mcp__kanban__save_opinion({ id: "${card.id}", aiOpinion: "## Summary Verdict\\n[Strong Yes / Yes / Maybe / No / Strong No]\\n\\n## Strengths\\n- Point 1\\n- Point 2\\n\\n## Concerns\\n- Point 1\\n- Point 2\\n\\n## Recommendations\\n- Recommendation 1\\n- Recommendation 2\\n\\n## Priority\\n[PRIORITY: low/medium/high] - Your reasoning\\n\\n## Final Score\\n[X/10] - Brief justification" })
\`\`\`

Do NOT end the session without saving your opinion and updating priority.

Let's start! What would you like to explore about this idea?`;
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

  // Only allow ideation cards
  if (card.status !== "ideation") {
    return NextResponse.json(
      { error: "Interactive ideation is only available for cards in Ideation column" },
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
      { error: "Card has no description to discuss" },
      { status: 400 }
    );
  }

  const prompt = buildIdeationPrompt(card);

  console.log(`[Ideate] Opening interactive ideation for card: ${id}`);
  console.log(`[Ideate] Working dir: ${workingDir}`);

  try {
    // Replace newlines with spaces (AppleScript strings can't contain raw newlines)
    const cleanPrompt = prompt.replace(/\n/g, " ");

    // KANBAN_CARD_ID env var is used by hooks to detect kanban sessions
    const claudeCommand = `cd "${workingDir}" && KANBAN_CARD_ID="${id}" claude "${cleanPrompt}" --permission-mode plan`;

    console.log(`[Ideate] Terminal app: ${terminal}`);
    console.log(`[Ideate] Prompt length: ${prompt.length} chars`);

    if (terminal === "ghostty") {
      // Ghostty doesn't support AppleScript
      // Copy command to clipboard and open Ghostty
      execSync(`echo "${claudeCommand.replace(/"/g, '\\"')}" | pbcopy`);
      exec("open -a Ghostty", (error) => {
        if (error) {
          console.error(`[Ideate] Error opening Ghostty: ${error.message}`);
        }
      });

      return NextResponse.json({
        success: true,
        cardId: id,
        workingDir,
        terminal,
        message: "Ghostty opened. Command copied to clipboard - press Cmd+V to paste.",
      });
    }

    // iTerm2 or Terminal.app - use AppleScript
    // Write command to temp script to avoid complex escaping
    const timestamp = Date.now();
    const scriptPath = join(tmpdir(), `claude-kanban-ideate-${timestamp}.sh`);
    writeFileSync(scriptPath, `#!/bin/bash\n${claudeCommand}\n`, { mode: 0o755 });

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
      console.error(`[Ideate] Error: ${error.message}`);
      try { unlinkSync(scriptPath); } catch {}
    });

    return NextResponse.json({
      success: true,
      cardId: id,
      workingDir,
      terminal,
    });
  } catch (error) {
    console.error("Ideate error:", error);
    return NextResponse.json(
      {
        error: "Failed to open terminal for ideation",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
