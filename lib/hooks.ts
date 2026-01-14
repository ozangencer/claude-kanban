import * as fs from "fs";
import * as path from "path";

const KANBAN_HOOK = {
  hooks: {
    PostToolUse: [
      {
        matcher: "ExitPlanMode",
        hooks: [
          {
            type: "command",
            command:
              "echo '⚠️ KANBAN REMINDER: Planı kartına kaydetmeyi unutma → mcp__kanban__save_plan kullan'",
          },
        ],
      },
    ],
  },
};

/**
 * Install kanban hook to a project's .claude/settings.json
 * Merges with existing settings if present
 */
export function installKanbanHook(folderPath: string): { success: boolean; error?: string } {
  try {
    const claudeDir = path.join(folderPath, ".claude");
    const settingsPath = path.join(claudeDir, "settings.json");

    // Create .claude directory if it doesn't exist
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    let existingSettings: Record<string, unknown> = {};

    // Read existing settings if present
    if (fs.existsSync(settingsPath)) {
      try {
        const content = fs.readFileSync(settingsPath, "utf-8");
        existingSettings = JSON.parse(content);
      } catch {
        // If parse fails, start fresh
        existingSettings = {};
      }
    }

    // Merge hooks
    const existingHooks = (existingSettings.hooks as Record<string, unknown[]>) || {};
    const existingPostToolUse = existingHooks.PostToolUse || [];

    // Check if kanban hook already exists
    const hasKanbanHook = existingPostToolUse.some(
      (hook: unknown) =>
        typeof hook === "object" &&
        hook !== null &&
        "matcher" in hook &&
        (hook as { matcher: string }).matcher === "ExitPlanMode" &&
        JSON.stringify(hook).includes("KANBAN REMINDER")
    );

    if (hasKanbanHook) {
      return { success: true }; // Already installed
    }

    // Add kanban hook
    const mergedSettings = {
      ...existingSettings,
      hooks: {
        ...existingHooks,
        PostToolUse: [...existingPostToolUse, ...KANBAN_HOOK.hooks.PostToolUse],
      },
    };

    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2));

    return { success: true };
  } catch (error) {
    console.error("Failed to install kanban hook:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Remove kanban hook from a project's .claude/settings.json
 */
export function removeKanbanHook(folderPath: string): { success: boolean; error?: string } {
  try {
    const settingsPath = path.join(folderPath, ".claude", "settings.json");

    if (!fs.existsSync(settingsPath)) {
      return { success: true }; // Nothing to remove
    }

    const content = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(content);

    if (!settings.hooks?.PostToolUse) {
      return { success: true }; // No hooks to remove
    }

    // Filter out kanban hook
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
      (hook: unknown) =>
        !(
          typeof hook === "object" &&
          hook !== null &&
          "matcher" in hook &&
          (hook as { matcher: string }).matcher === "ExitPlanMode" &&
          JSON.stringify(hook).includes("KANBAN REMINDER")
        )
    );

    // Clean up empty arrays
    if (settings.hooks.PostToolUse.length === 0) {
      delete settings.hooks.PostToolUse;
    }
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    // Write back or delete file if empty
    if (Object.keys(settings).length === 0) {
      fs.unlinkSync(settingsPath);
    } else {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to remove kanban hook:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
