import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Expand ~ to home directory
function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

export async function GET() {
  try {
    // Get MCP config path from settings
    const setting = db
      .select()
      .from(settings)
      .where(eq(settings.key, "mcp_config_path"))
      .get();

    // Kullanıcı path'i boş bıraktıysa, MCPs gösterme
    if (setting !== undefined && setting.value === "") {
      return NextResponse.json({ mcps: [] });
    }

    const configuredPath = setting?.value || "~/.claude.json";
    const claudeConfigPath = expandPath(configuredPath);

    const configContent = readFileSync(claudeConfigPath, "utf-8");
    const config = JSON.parse(configContent);

    const mcpServers = config.mcpServers || {};
    const mcps = Object.keys(mcpServers);

    // Sort alphabetically
    mcps.sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ mcps });
  } catch (error) {
    console.error("Failed to read MCPs:", error);
    return NextResponse.json({ mcps: [] });
  }
}
