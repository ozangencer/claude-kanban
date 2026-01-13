import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export async function GET() {
  try {
    const claudeConfigPath = join(homedir(), ".claude.json");

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
