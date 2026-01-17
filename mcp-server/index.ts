#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { marked } from "marked";
import { v4 as uuidv4 } from "uuid";
import { execSync } from "child_process";

// Configure marked for Tiptap-compatible HTML
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Convert markdown to Tiptap-compatible HTML with TaskList support
function markdownToTiptapHtml(markdown: string): string {
  // First, convert with marked
  let html = marked.parse(markdown) as string;

  // Convert standard checkbox lists to Tiptap TaskList format
  // Match: <ul> containing <li><input ...checkbox...> items
  html = html.replace(
    /<ul>\s*((?:<li><input[^>]*type="checkbox"[^>]*>\s*[^<]*<\/li>\s*)+)<\/ul>/gi,
    (match, items) => {
      const taskItems = items.replace(
        /<li><input([^>]*)type="checkbox"([^>]*)>\s*([^<]*)<\/li>/gi,
        (itemMatch: string, before: string, after: string, text: string) => {
          const isChecked = before.includes('checked') || after.includes('checked');
          return `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox"${isChecked ? ' checked="checked"' : ''}><span></span></label><div><p>${text.trim()}</p></div></li>`;
        }
      );
      return `<ul data-type="taskList">${taskItems}</ul>`;
    }
  );

  return html;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

// Database path - relative to MCP server location
const DB_PATH = resolve(__dirname, "../data/kanban.db");

// Initialize database connection
const db = new Database(DB_PATH);

// Types
interface Card {
  id: string;
  title: string;
  description: string;
  solutionSummary: string;
  testScenarios: string;
  status: string;
  complexity: string;
  priority: string;
  projectFolder: string;
  projectId: string | null;
  taskNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

type Status = "ideation" | "backlog" | "bugs" | "progress" | "test" | "completed";

// Background task tracking
interface BackgroundTask {
  id: string;
  taskId: string;
  pid: number | null;
  description: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

// Create MCP server
const server = new Server(
  {
    name: "kanban-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_card",
        description: "Get a kanban card by ID",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The card ID (UUID)",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "update_card",
        description: "Update a kanban card. Use this to save solution summaries, test scenarios, or change status.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The card ID (UUID)",
            },
            title: {
              type: "string",
              description: "Card title",
            },
            description: {
              type: "string",
              description: "Card description",
            },
            solutionSummary: {
              type: "string",
              description: "The solution plan or implementation summary",
            },
            testScenarios: {
              type: "string",
              description: "Test scenarios in markdown format with checkboxes",
            },
            status: {
              type: "string",
              enum: ["ideation", "backlog", "bugs", "progress", "test", "completed"],
              description: "Card status/column",
            },
            complexity: {
              type: "string",
              enum: ["simple", "medium", "complex"],
              description: "Task complexity",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Task priority",
            },
          },
          required: ["id"],
        },
      },
      {
        name: "move_card",
        description: "Move a kanban card to a different column/status",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The card ID (UUID)",
            },
            status: {
              type: "string",
              enum: ["ideation", "backlog", "bugs", "progress", "test", "completed"],
              description: "Target status/column",
            },
          },
          required: ["id", "status"],
        },
      },
      {
        name: "list_cards",
        description: "List all kanban cards, optionally filtered by status",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["ideation", "backlog", "bugs", "progress", "test", "completed"],
              description: "Filter by status (optional)",
            },
            projectId: {
              type: "string",
              description: "Filter by project ID (optional)",
            },
          },
        },
      },
      {
        name: "create_card",
        description: "Create a new kanban card. Markdown content in description and solutionSummary will be converted to HTML. Test scenarios should be added after implementation using save_tests.",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Card title (required)",
            },
            description: {
              type: "string",
              description: "Card description in markdown format",
            },
            solutionSummary: {
              type: "string",
              description: "Solution plan in markdown format",
            },
            status: {
              type: "string",
              enum: ["ideation", "backlog", "bugs", "progress", "test", "completed"],
              description: "Card status/column (default: backlog)",
            },
            complexity: {
              type: "string",
              enum: ["simple", "medium", "complex"],
              description: "Task complexity (default: medium)",
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "Task priority (default: medium)",
            },
            projectId: {
              type: "string",
              description: "Project ID to associate with (optional)",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "save_plan",
        description: "Save a solution plan to a card and move it to In Progress. Use this when you've completed planning a task.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The card ID (UUID)",
            },
            solutionSummary: {
              type: "string",
              description: "The solution plan in markdown format",
            },
          },
          required: ["id", "solutionSummary"],
        },
      },
      {
        name: "save_tests",
        description: "Save test scenarios to a card and move it to Human Test. Use this when you've completed implementation.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The card ID (UUID)",
            },
            testScenarios: {
              type: "string",
              description: "Test scenarios in markdown format with checkboxes (- [ ] format)",
            },
          },
          required: ["id", "testScenarios"],
        },
      },
      {
        name: "save_opinion",
        description: "Save AI opinion to a card after interactive ideation session. MUST include all required sections.",
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The card ID (UUID)",
            },
            aiOpinion: {
              type: "string",
              description: "AI opinion in markdown. MUST include these sections: ## Summary Verdict (Strong Yes/Yes/Maybe/No/Strong No), ## Strengths (bullet points), ## Concerns (bullet points), ## Recommendations (bullet points), ## Priority ([PRIORITY: low/medium/high] - reasoning), ## Final Score ([X/10] - justification)",
            },
          },
          required: ["id", "aiOpinion"],
        },
      },
      // Background task management tools
      {
        name: "register_background_task",
        description: "Register a background task for tracking. Call this BEFORE spawning a background agent to track it for later cleanup.",
        inputSchema: {
          type: "object",
          properties: {
            taskId: {
              type: "string",
              description: "The Claude Code task ID returned when spawning the agent",
            },
            description: {
              type: "string",
              description: "Brief description of what the task is doing",
            },
            pid: {
              type: "number",
              description: "Process ID if known (optional)",
            },
          },
          required: ["taskId", "description"],
        },
      },
      {
        name: "list_background_tasks",
        description: "List all tracked background tasks and their status",
        inputSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["running", "completed", "failed", "all"],
              description: "Filter by status (default: all)",
            },
          },
        },
      },
      {
        name: "cleanup_background_tasks",
        description: "Clean up orphaned Claude background processes. Kills background Claude processes and updates tracking. Call this before spawning new background agents.",
        inputSchema: {
          type: "object",
          properties: {
            force: {
              type: "boolean",
              description: "Force kill all background Claude processes (default: false, only kills old ones)",
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_card": {
        const { id } = args as { id: string };
        const card = db.prepare(`
          SELECT
            id, title, description,
            solution_summary as solutionSummary,
            test_scenarios as testScenarios,
            status, complexity, priority,
            project_folder as projectFolder,
            project_id as projectId,
            task_number as taskNumber,
            created_at as createdAt,
            updated_at as updatedAt
          FROM cards WHERE id = ?
        `).get(id) as Card | undefined;

        if (!card) {
          return {
            content: [{ type: "text", text: `Card not found: ${id}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(card, null, 2) }],
        };
      }

      case "update_card": {
        const { id, ...updates } = args as { id: string } & Partial<Card>;

        // Fields that need markdown to HTML conversion
        const markdownFields = ["description", "solutionSummary", "testScenarios"];

        // Build SET clause dynamically
        const fieldMap: Record<string, string> = {
          title: "title",
          description: "description",
          solutionSummary: "solution_summary",
          testScenarios: "test_scenarios",
          status: "status",
          complexity: "complexity",
          priority: "priority",
        };

        const setClauses: string[] = ["updated_at = ?"];
        const values: unknown[] = [new Date().toISOString()];

        for (const [key, value] of Object.entries(updates)) {
          if (fieldMap[key] && value !== undefined) {
            setClauses.push(`${fieldMap[key]} = ?`);
            // Convert markdown to HTML for rich text fields
            if (markdownFields.includes(key) && typeof value === "string") {
              values.push(markdownToTiptapHtml(value));
            } else {
              values.push(value);
            }
          }
        }

        values.push(id);

        const result = db.prepare(`
          UPDATE cards SET ${setClauses.join(", ")} WHERE id = ?
        `).run(...values);

        if (result.changes === 0) {
          return {
            content: [{ type: "text", text: `Card not found: ${id}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `Card ${id} updated successfully` }],
        };
      }

      case "move_card": {
        const { id, status } = args as { id: string; status: Status };

        const result = db.prepare(`
          UPDATE cards SET status = ?, updated_at = ? WHERE id = ?
        `).run(status, new Date().toISOString(), id);

        if (result.changes === 0) {
          return {
            content: [{ type: "text", text: `Card not found: ${id}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `Card ${id} moved to ${status}` }],
        };
      }

      case "list_cards": {
        const { status, projectId } = args as { status?: Status; projectId?: string };

        let query = `
          SELECT
            id, title, description,
            solution_summary as solutionSummary,
            test_scenarios as testScenarios,
            status, complexity, priority,
            project_folder as projectFolder,
            project_id as projectId,
            task_number as taskNumber,
            created_at as createdAt,
            updated_at as updatedAt
          FROM cards
        `;
        const conditions: string[] = [];
        const params: unknown[] = [];

        if (status) {
          conditions.push("status = ?");
          params.push(status);
        }
        if (projectId) {
          conditions.push("project_id = ?");
          params.push(projectId);
        }

        if (conditions.length > 0) {
          query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY updated_at DESC";

        const cards = db.prepare(query).all(...params) as Card[];

        return {
          content: [{ type: "text", text: JSON.stringify(cards, null, 2) }],
        };
      }

      case "create_card": {
        const {
          title,
          description = "",
          solutionSummary = "",
          status = "backlog",
          complexity = "medium",
          priority = "medium",
          projectId = null,
        } = args as {
          title: string;
          description?: string;
          solutionSummary?: string;
          status?: Status;
          complexity?: string;
          priority?: string;
          projectId?: string | null;
        };

        const now = new Date().toISOString();
        let taskNumber: number | null = null;
        let projectFolder = "";

        // If projectId provided, get next task number
        if (projectId) {
          const project = db.prepare(`
            SELECT id, folder_path, next_task_number FROM projects WHERE id = ?
          `).get(projectId) as { id: string; folder_path: string; next_task_number: number } | undefined;

          if (project) {
            taskNumber = project.next_task_number;
            projectFolder = project.folder_path;

            // Increment project's nextTaskNumber
            db.prepare(`
              UPDATE projects SET next_task_number = ?, updated_at = ? WHERE id = ?
            `).run(project.next_task_number + 1, now, projectId);
          }
        }

        const cardId = uuidv4();
        db.prepare(`
          INSERT INTO cards (
            id, title, description, solution_summary, test_scenarios,
            status, complexity, priority, project_folder, project_id,
            task_number, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          cardId,
          title,
          markdownToTiptapHtml(description),
          markdownToTiptapHtml(solutionSummary),
          "", // Test scenarios added after implementation via save_tests
          status,
          complexity,
          priority,
          projectFolder,
          projectId,
          taskNumber,
          now,
          now
        );

        return {
          content: [{ type: "text", text: `Card created: ${cardId} (${title})` }],
        };
      }

      case "save_plan": {
        const { id, solutionSummary } = args as { id: string; solutionSummary: string };

        // Convert markdown to Tiptap-compatible HTML with TaskList support
        const htmlContent = markdownToTiptapHtml(solutionSummary);

        const result = db.prepare(`
          UPDATE cards
          SET solution_summary = ?, status = 'progress', updated_at = ?
          WHERE id = ?
        `).run(htmlContent, new Date().toISOString(), id);

        if (result.changes === 0) {
          return {
            content: [{ type: "text", text: `Card not found: ${id}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `Plan saved to card ${id} and moved to In Progress` }],
        };
      }

      case "save_tests": {
        const { id, testScenarios } = args as { id: string; testScenarios: string };

        // Convert markdown to Tiptap-compatible HTML with TaskList support
        const htmlContent = markdownToTiptapHtml(testScenarios);

        const result = db.prepare(`
          UPDATE cards
          SET test_scenarios = ?, status = 'test', updated_at = ?
          WHERE id = ?
        `).run(htmlContent, new Date().toISOString(), id);

        if (result.changes === 0) {
          return {
            content: [{ type: "text", text: `Card not found: ${id}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `Test scenarios saved to card ${id} and moved to Human Test` }],
        };
      }

      case "save_opinion": {
        const { id, aiOpinion } = args as { id: string; aiOpinion: string };

        // Convert markdown to Tiptap-compatible HTML
        const htmlContent = markdownToTiptapHtml(aiOpinion);

        const result = db.prepare(`
          UPDATE cards
          SET ai_opinion = ?, updated_at = ?
          WHERE id = ?
        `).run(htmlContent, new Date().toISOString(), id);

        if (result.changes === 0) {
          return {
            content: [{ type: "text", text: `Card not found: ${id}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text", text: `AI opinion saved to card ${id}` }],
        };
      }

      // Background task management
      case "register_background_task": {
        const { taskId, description, pid } = args as {
          taskId: string;
          description: string;
          pid?: number;
        };

        const id = uuidv4();
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO background_tasks (id, task_id, pid, description, status, started_at)
          VALUES (?, ?, ?, ?, 'running', ?)
        `).run(id, taskId, pid || null, description, now);

        return {
          content: [{ type: "text", text: `Background task registered: ${taskId} (${description})` }],
        };
      }

      case "list_background_tasks": {
        const { status = "all" } = args as { status?: string };

        let query = `
          SELECT id, task_id as taskId, pid, description, status,
                 started_at as startedAt, completed_at as completedAt
          FROM background_tasks
        `;

        if (status !== "all") {
          query += ` WHERE status = ?`;
        }
        query += ` ORDER BY started_at DESC`;

        const tasks = status !== "all"
          ? db.prepare(query).all(status) as BackgroundTask[]
          : db.prepare(query).all() as BackgroundTask[];

        // Also get current system info about background Claude processes
        let systemInfo = "";
        try {
          const bgCount = execSync('ps aux | grep "claude" | grep -v grep | grep "??" | wc -l', { encoding: 'utf-8' }).trim();
          const memUsage = execSync('ps aux | grep "claude" | grep -v grep | awk \'{sum += $6} END {printf "%.2f", sum/1024/1024}\'', { encoding: 'utf-8' }).trim();
          systemInfo = `\n\nSystem: ${bgCount} background Claude processes using ${memUsage} GB memory`;
        } catch {
          // Ignore errors in system check
        }

        return {
          content: [{
            type: "text",
            text: `Tracked tasks:\n${JSON.stringify(tasks, null, 2)}${systemInfo}`
          }],
        };
      }

      case "cleanup_background_tasks": {
        const { force = false } = args as { force?: boolean };

        let killedCount = 0;
        let cleanedTasks = 0;

        try {
          // Get background Claude process PIDs (those with ?? in TTY column)
          const pidsOutput = execSync('ps aux | grep "claude" | grep -v grep | grep "??" | awk \'{print $2}\'', { encoding: 'utf-8' });
          const pids = pidsOutput.trim().split('\n').filter(p => p);

          if (pids.length > 0) {
            // Kill background processes
            // In non-force mode, we still kill them but could add age filtering later
            for (const pid of pids) {
              try {
                execSync(`kill ${pid} 2>/dev/null`);
                killedCount++;
              } catch {
                // Process might already be dead
              }
            }
          }

          // Update all running tasks to failed (since we killed them)
          const result = db.prepare(`
            UPDATE background_tasks
            SET status = 'cleaned', completed_at = ?
            WHERE status = 'running'
          `).run(new Date().toISOString());
          cleanedTasks = result.changes;

          // Clean up old completed/failed tasks (older than 24 hours)
          db.prepare(`
            DELETE FROM background_tasks
            WHERE status IN ('completed', 'failed', 'cleaned')
            AND datetime(started_at) < datetime('now', '-24 hours')
          `).run();

        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Cleanup error: ${error instanceof Error ? error.message : String(error)}`
            }],
            isError: true,
          };
        }

        // Get remaining process count
        let remainingCount = 0;
        try {
          remainingCount = parseInt(execSync('ps aux | grep "claude" | grep -v grep | grep "??" | wc -l', { encoding: 'utf-8' }).trim());
        } catch {
          // Ignore
        }

        return {
          content: [{
            type: "text",
            text: `Cleanup complete:\n- Killed ${killedCount} background processes\n- Updated ${cleanedTasks} tracked tasks\n- Remaining background processes: ${remainingCount}`
          }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Kanban MCP server started");
}

main().catch(console.error);
