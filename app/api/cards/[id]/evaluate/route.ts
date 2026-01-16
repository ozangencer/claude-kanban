import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exec } from "child_process";
import { promisify } from "util";
import { marked } from "marked";

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

function buildEvaluatePrompt(
  card: { title: string; description: string },
  narrativePath?: string | null
): string {
  const title = stripHtml(card.title);
  const description = stripHtml(card.description);

  // Use custom narrative path if provided, otherwise default to docs/product-narrative.md
  const narrativeRef = narrativePath
    ? `@${narrativePath}`
    : "@docs/product-narrative.md";

  return `You are a Product Architect evaluating this idea. Be BRUTALLY HONEST.

## Context Files
Read these files for context:
- ${narrativeRef} (project vision & scope) - if it exists
- @CLAUDE.md (technical guidelines) - if it exists

## Idea to Evaluate
**Title:** ${title}

**Description:**
${description}

## Your Evaluation Task
Evaluate this idea from these perspectives:

1. **YAGNI (You Ain't Gonna Need It)**: Is this feature truly needed? Will it provide value?
2. **Scope Creep Risk**: Does this expand the project scope unnecessarily?
3. **Scalability**: Will this scale with the product growth?
4. **Technical Feasibility**: Is this technically achievable with reasonable effort?
5. **Alignment with Vision**: Does this fit the product's core mission?
6. **Implementation Complexity**: How hard is this to build?

## Output Format
You MUST provide your evaluation as markdown with EXACTLY these sections:

## Summary Verdict
[One sentence: Strong Yes / Yes / Maybe / No / Strong No]

## Strengths
- Point 1
- Point 2
(List the key strengths of this idea)

## Concerns
- Point 1
- Point 2
(List the main concerns, risks, or issues)

## Recommendations
- What should be considered before implementing
- Any suggested modifications to the idea

## Priority
[PRIORITY: low/medium/high] - Your reasoning for this priority level
(Based on urgency, impact, and alignment with project goals. Be honest - not everything is high priority!)

## Complexity
[COMPLEXITY: trivial/low/medium/high/very_high] - Your assessment
(trivial = few lines, low = simple change, medium = moderate effort, high = significant work, very_high = major undertaking)

## Final Score
[X/10] - Brief justification for the score

---
Be direct. Don't sugarcoat. Point out both good and bad aspects.`;
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

  // Verify card is in ideation status
  if (card.status !== "ideation") {
    return NextResponse.json(
      { error: "Evaluate is only available for cards in Ideation column" },
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
      { error: "Card has no description to evaluate" },
      { status: 400 }
    );
  }

  // Get narrativePath from project
  const narrativePath = project?.narrativePath || null;

  console.log(`[Evaluate] Starting evaluation for card ${id}`);
  console.log(`[Evaluate] Working dir: ${workingDir}`);
  console.log(`[Evaluate] Narrative path: ${narrativePath || 'default (docs/product-narrative.md)'}`);

  try {
    const prompt = buildEvaluatePrompt(card, narrativePath);
    const escapedPrompt = escapeShellArg(prompt);

    // Use permission-mode dontAsk since we're only reading files for context
    const command = `CI=true claude -p ${escapedPrompt} --permission-mode dontAsk --output-format json < /dev/null`;

    console.log(`[Evaluate] Prompt length: ${prompt.length} chars`);

    const { stdout, stderr } = await execAsync(command, {
      cwd: workingDir,
      timeout: 5 * 60 * 1000, // 5 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr) {
      console.log(`[Evaluate] stderr: ${stderr}`);
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
      console.log(`[Evaluate] JSON parse failed, using raw output`);
    }

    // Convert markdown response to HTML for TipTap editor
    const markedHtml = await marked(responseText);
    const aiOpinion = convertToTipTapTaskList(markedHtml);

    // Extract priority from response
    let priority: "low" | "medium" | "high" | null = null;
    const priorityMatch = responseText.match(/\[PRIORITY:\s*(low|medium|high)\]/i);
    if (priorityMatch) {
      priority = priorityMatch[1].toLowerCase() as "low" | "medium" | "high";
    }

    // Extract complexity from response
    let complexity: "trivial" | "low" | "medium" | "high" | "very_high" | null = null;
    const complexityMatch = responseText.match(/\[COMPLEXITY:\s*(trivial|low|medium|high|very_high)\]/i);
    if (complexityMatch) {
      complexity = complexityMatch[1].toLowerCase() as "trivial" | "low" | "medium" | "high" | "very_high";
    }

    // Update database - update aiOpinion, priority, and complexity (if found)
    const updatedAt = new Date().toISOString();
    const updates: { aiOpinion: string; updatedAt: string; priority?: string; complexity?: string } = {
      aiOpinion,
      updatedAt,
    };

    if (priority) {
      updates.priority = priority;
      console.log(`[Evaluate] Updating priority to: ${priority}`);
    }

    if (complexity) {
      updates.complexity = complexity;
      console.log(`[Evaluate] Updating complexity to: ${complexity}`);
    }

    db.update(schema.cards)
      .set(updates)
      .where(eq(schema.cards.id, id))
      .run();

    return NextResponse.json({
      success: true,
      cardId: id,
      aiOpinion,
      priority,
      complexity,
      cost,
      duration,
    });
  } catch (error) {
    console.error("Evaluate error:", error);
    return NextResponse.json(
      {
        error: "Failed to evaluate idea",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
