import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import fs from "fs";
import path from "path";

// Security: validate path is within a known project folder
function validatePath(filePath: string): boolean {
  const projects = db.select().from(schema.projects).all();
  const normalizedPath = path.normalize(filePath);

  return projects.some((project) => {
    const normalizedFolder = path.normalize(project.folderPath);
    return normalizedPath.startsWith(normalizedFolder);
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    if (!validatePath(filePath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    return NextResponse.json({ content, path: filePath });
  } catch (error) {
    console.error("Failed to read document:", error);
    return NextResponse.json(
      { error: "Failed to read document" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
      return NextResponse.json({ error: "Path required" }, { status: 400 });
    }

    if (!validatePath(filePath)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const body = await request.json();

    if (typeof body.content !== "string") {
      return NextResponse.json(
        { error: "Content must be a string" },
        { status: 400 }
      );
    }

    fs.writeFileSync(filePath, body.content, "utf-8");
    return NextResponse.json({ success: true, path: filePath });
  } catch (error) {
    console.error("Failed to write document:", error);
    return NextResponse.json(
      { error: "Failed to write document" },
      { status: 500 }
    );
  }
}
