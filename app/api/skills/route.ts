import { NextResponse } from "next/server";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export async function GET() {
  try {
    const skillsPath = join(homedir(), ".claude", "skills");

    const entries = readdirSync(skillsPath);
    const skills = entries.filter((entry) => {
      // Filter out hidden files and non-directories
      if (entry.startsWith(".")) return false;
      const fullPath = join(skillsPath, entry);
      return statSync(fullPath).isDirectory();
    });

    // Sort alphabetically
    skills.sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ skills });
  } catch (error) {
    console.error("Failed to read skills:", error);
    return NextResponse.json({ skills: [] });
  }
}
