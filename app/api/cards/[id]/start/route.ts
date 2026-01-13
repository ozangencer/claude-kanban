import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";

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

function escapeShellArg(arg: string): string {
  // Escape single quotes and wrap in single quotes
  return `'${arg.replace(/'/g, "'\\''")}'`;
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
  const prompt = stripHtml(card.description);

  if (!prompt) {
    return NextResponse.json(
      { error: "Card has no description to use as prompt" },
      { status: 400 }
    );
  }

  try {
    // Run Claude CLI in plan mode
    const result = await runClaudeCli(prompt, workingDir);

    // Update card with solution summary
    const updatedAt = new Date().toISOString();
    db.update(schema.cards)
      .set({
        solutionSummary: result.response,
        updatedAt,
      })
      .where(eq(schema.cards.id, id))
      .run();

    return NextResponse.json({
      success: true,
      cardId: id,
      response: result.response,
      cost: result.cost,
      duration: result.duration,
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
  cwd: string
): Promise<{ response: string; cost?: number; duration?: number }> {
  const escapedPrompt = escapeShellArg(prompt);
  // Add < /dev/null to prevent stdin waiting, and set CI=true to disable interactive mode
  const command = `CI=true claude -p ${escapedPrompt} --permission-mode plan --output-format json < /dev/null`;

  console.log(`[Claude CLI] Running in ${cwd}:`);
  console.log(`[Claude CLI] ${command}`);

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 5 * 60 * 1000, // 5 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr) {
      console.log(`[Claude CLI] stderr: ${stderr}`);
    }

    console.log(`[Claude CLI] stdout length: ${stdout.length}`);

    try {
      // Parse JSON response
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
      // If JSON parsing fails, use raw output
      console.log(`[Claude CLI] JSON parse failed, using raw output`);
      return { response: stdout.trim() };
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("TIMEOUT")) {
      throw new Error("Claude CLI timed out after 5 minutes");
    }
    throw error;
  }
}
