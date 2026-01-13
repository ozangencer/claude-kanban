import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { homedir } from "os";
import { join } from "path";
import type { AppSettings, TerminalApp } from "@/lib/types";

// Expand ~ to home directory
function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

// Contract home directory to ~
function contractPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return "~" + path.slice(home.length);
  }
  return path;
}

const DEFAULT_SETTINGS: AppSettings = {
  skillsPath: "~/.claude/skills",
  mcpConfigPath: "~/.claude.json",
  terminalApp: "iterm2",
};

// GET /api/settings - Returns all settings
export async function GET() {
  try {
    const rows = db.select().from(settings).all();

    // Convert rows to settings object
    const result: AppSettings = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      if (row.key === "skills_path") result.skillsPath = row.value;
      if (row.key === "mcp_config_path") result.mcpConfigPath = row.value;
      if (row.key === "terminal_app") result.terminalApp = row.value as TerminalApp;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}

// PUT /api/settings - Updates settings
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();

    // Map of incoming field names to database keys
    const keyMap: Record<string, string> = {
      skillsPath: "skills_path",
      mcpConfigPath: "mcp_config_path",
      terminalApp: "terminal_app",
    };

    for (const [field, value] of Object.entries(body)) {
      const dbKey = keyMap[field];
      if (dbKey && typeof value === "string") {
        // Check if setting exists
        const existing = db
          .select()
          .from(settings)
          .where(eq(settings.key, dbKey))
          .get();

        if (existing) {
          // Update existing
          db.update(settings)
            .set({ value, updatedAt: now })
            .where(eq(settings.key, dbKey))
            .run();
        } else {
          // Insert new
          db.insert(settings)
            .values({ key: dbKey, value, updatedAt: now })
            .run();
        }
      }
    }

    // Return updated settings
    return GET();
  } catch (error) {
    console.error("Failed to update settings:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}

