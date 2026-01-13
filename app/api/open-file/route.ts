import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json({ error: "Path is required" }, { status: 400 });
    }

    // Use 'open' command on macOS to open file with default application
    await execAsync(`open "${path}"`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to open file:", error);
    return NextResponse.json(
      { error: "Failed to open file" },
      { status: 500 }
    );
  }
}
