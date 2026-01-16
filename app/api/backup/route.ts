import { NextResponse } from "next/server";
import { createBackup, getBackupList, cleanOldBackups, getLastBackupTime } from "@/lib/backup";

// GET /api/backup - Get backup list and last backup time
export async function GET() {
  try {
    const backups = getBackupList();
    const lastBackupTime = getLastBackupTime();

    return NextResponse.json({
      backups,
      lastBackupTime,
      count: backups.length,
    });
  } catch (error) {
    console.error("Failed to get backup list:", error);
    return NextResponse.json(
      { error: "Failed to get backup list" },
      { status: 500 }
    );
  }
}

// POST /api/backup - Create a new backup
export async function POST() {
  try {
    // Create backup
    const backup = createBackup();

    // Clean old backups (older than 3 days)
    const deletedCount = cleanOldBackups(3);

    return NextResponse.json({
      success: true,
      backup,
      deletedBackups: deletedCount,
    });
  } catch (error) {
    console.error("Failed to create backup:", error);
    return NextResponse.json(
      { error: "Failed to create backup" },
      { status: 500 }
    );
  }
}
