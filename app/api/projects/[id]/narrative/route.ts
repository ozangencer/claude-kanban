import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface NarrativeData {
  storyBehindThis: string;
  problem: string;
  targetUsers: string;
  coreFeatures: string;
  nonGoals: string;
  techStack: string;
  successMetrics: string;
}

function buildNarrativePrompt(projectName: string, data: NarrativeData): string {
  return `You are a Product Architect creating a professional product narrative document.

## Project: ${projectName}

## User's Input (expand and professionalize these):

**Story Behind This:**
${data.storyBehindThis || "Not provided"}

**Problem:**
${data.problem || "Not provided"}

**Target Users:**
${data.targetUsers || "Not provided"}

**Core Features:**
${data.coreFeatures || "Not provided"}

**Non-Goals (Out of Scope):**
${data.nonGoals || "Not provided"}

**Tech Stack:**
${data.techStack || "Not provided"}

**Success Metrics:**
${data.successMetrics || "Not provided"}

## Your Task

Create a comprehensive, professional product narrative document in markdown format.

Requirements:
1. Expand the user's brief inputs into detailed, well-structured sections
2. Add professional context and depth to each section
3. Include a Vision Statement at the beginning
4. Add Problem Definition with sub-sections if relevant
5. Describe the Solution Architecture conceptually
6. Include Competitive Positioning if applicable
7. Add a Product-Architect Commentary section with design decisions
8. Keep the tone professional but accessible
9. Use tables, diagrams (ASCII), and structured lists where appropriate
10. End with document metadata (version, date)

Output ONLY the markdown content, no explanations.`;
}

function generateFallbackContent(projectName: string, data: NarrativeData): string {
  const now = new Date().toISOString().split("T")[0];

  return `# Product Narrative: ${projectName}

## Story Behind This
${data.storyBehindThis || "_Not provided_"}

## Problem
${data.problem || "_Not provided_"}

## Target Users
${data.targetUsers || "_Not provided_"}

## Core Features
${data.coreFeatures || "_Not provided_"}

## Non-Goals (Out of Scope)
${data.nonGoals || "_Not provided_"}

## Tech Stack
${data.techStack || "_Not provided_"}

## Success Metrics
${data.successMetrics || "_Not provided_"}

---
Generated: ${now}
`;
}

// GET - Read narrative from project folder
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const narrativePath = path.join(project.folderPath, "docs", "product-narrative.md");

  try {
    if (fs.existsSync(narrativePath)) {
      const content = fs.readFileSync(narrativePath, "utf-8");
      return NextResponse.json({
        exists: true,
        content,
        path: narrativePath
      });
    } else {
      return NextResponse.json({
        exists: false,
        content: null,
        path: narrativePath
      });
    }
  } catch (error) {
    console.error("Error reading narrative:", error);
    return NextResponse.json(
      { error: "Failed to read narrative", details: String(error) },
      { status: 500 }
    );
  }
}

// POST - Create narrative in project folder using Claude AI
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: NarrativeData = await request.json();

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const docsDir = path.join(project.folderPath, "docs");
  const narrativePath = path.join(docsDir, "product-narrative.md");

  try {
    // Create docs directory if it doesn't exist
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Build prompt for Claude
    const prompt = buildNarrativePrompt(project.name, body);
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // Run Claude CLI in autonomous mode
    const command = `CI=true claude -p '${escapedPrompt}' --permission-mode dontAsk --output-format json < /dev/null`;

    console.log("Running Claude for narrative generation...");

    const { stdout } = await execAsync(command, {
      cwd: project.folderPath,
      timeout: 600000, // 10 minutes timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Parse Claude's JSON response
    let narrativeContent: string;
    try {
      const response = JSON.parse(stdout);
      // Extract text from response
      if (response.result) {
        narrativeContent = response.result;
      } else if (Array.isArray(response)) {
        // Handle array response format
        const textBlocks = response.filter((b: { type: string }) => b.type === "text");
        narrativeContent = textBlocks.map((b: { text: string }) => b.text).join("\n");
      } else {
        narrativeContent = stdout;
      }
    } catch {
      // If JSON parsing fails, use raw output
      narrativeContent = stdout;
    }

    // Clean up the content (remove JSON artifacts if any)
    narrativeContent = narrativeContent
      .replace(/^```markdown\n?/g, "")
      .replace(/\n?```$/g, "")
      .trim();

    // Write narrative to file
    fs.writeFileSync(narrativePath, narrativeContent, "utf-8");

    return NextResponse.json({
      success: true,
      path: narrativePath,
      message: "Product narrative created with AI assistance",
      aiGenerated: true,
    });
  } catch (error) {
    console.error("Error creating narrative with Claude:", error);

    // Fallback to simple template if Claude fails
    try {
      const fallbackContent = generateFallbackContent(project.name, body);
      fs.writeFileSync(narrativePath, fallbackContent, "utf-8");

      return NextResponse.json({
        success: true,
        path: narrativePath,
        message: "Product narrative created (fallback - AI unavailable)",
        aiGenerated: false,
      });
    } catch (fallbackError) {
      return NextResponse.json(
        { error: "Failed to create narrative", details: String(error) },
        { status: 500 }
      );
    }
  }
}

// PUT - Update existing narrative using Claude AI
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body: NarrativeData = await request.json();

  const project = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const docsDir = path.join(project.folderPath, "docs");
  const narrativePath = path.join(docsDir, "product-narrative.md");

  try {
    // Create docs directory if it doesn't exist
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }

    // Build prompt for Claude
    const prompt = buildNarrativePrompt(project.name, body);
    const escapedPrompt = prompt.replace(/'/g, "'\\''");

    // Run Claude CLI in autonomous mode
    const command = `CI=true claude -p '${escapedPrompt}' --permission-mode dontAsk --output-format json < /dev/null`;

    console.log("Running Claude for narrative update...");

    const { stdout } = await execAsync(command, {
      cwd: project.folderPath,
      timeout: 600000, // 10 minutes timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Parse Claude's JSON response
    let narrativeContent: string;
    try {
      const response = JSON.parse(stdout);
      if (response.result) {
        narrativeContent = response.result;
      } else if (Array.isArray(response)) {
        const textBlocks = response.filter((b: { type: string }) => b.type === "text");
        narrativeContent = textBlocks.map((b: { text: string }) => b.text).join("\n");
      } else {
        narrativeContent = stdout;
      }
    } catch {
      narrativeContent = stdout;
    }

    // Clean up the content
    narrativeContent = narrativeContent
      .replace(/^```markdown\n?/g, "")
      .replace(/\n?```$/g, "")
      .trim();

    // Write narrative to file
    fs.writeFileSync(narrativePath, narrativeContent, "utf-8");

    return NextResponse.json({
      success: true,
      path: narrativePath,
      message: "Product narrative updated with AI assistance",
      aiGenerated: true,
    });
  } catch (error) {
    console.error("Error updating narrative with Claude:", error);

    // Fallback to simple template if Claude fails
    try {
      const fallbackContent = generateFallbackContent(project.name, body);
      fs.writeFileSync(narrativePath, fallbackContent, "utf-8");

      return NextResponse.json({
        success: true,
        path: narrativePath,
        message: "Product narrative updated (fallback - AI unavailable)",
        aiGenerated: false,
      });
    } catch (fallbackError) {
      return NextResponse.json(
        { error: "Failed to update narrative", details: String(error) },
        { status: 500 }
      );
    }
  }
}
