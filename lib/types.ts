export type Status =
  | "ideation"
  | "backlog"
  | "bugs"
  | "progress"
  | "test"
  | "completed";

export type Complexity = "low" | "medium" | "high";
export type Priority = "low" | "medium" | "high";
export type GitBranchStatus = "active" | "merged" | "rolled_back" | null;

export interface Card {
  id: string;
  title: string;
  description: string;
  solutionSummary: string;
  testScenarios: string;
  aiOpinion: string;
  status: Status;
  complexity: Complexity;
  priority: Priority;
  projectFolder: string;
  projectId: string | null;
  taskNumber: number | null;
  gitBranchName: string | null;
  gitBranchStatus: GitBranchStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  folderPath: string;
  idPrefix: string;
  nextTaskNumber: number;
  color: string;
  isPinned: boolean;
  documentPaths: string[] | null; // Custom document paths, null = smart discovery
  narrativePath: string | null; // Relative path to narrative file, null = docs/product-narrative.md
  createdAt: string;
  updatedAt: string;
}

export interface DocumentFile {
  name: string;
  path: string;
  relativePath: string;
  isClaudeMd: boolean;
}

export function getDisplayId(
  card: Card,
  project: Project | null | undefined
): string | null {
  if (!project || !card.taskNumber) return null;
  return `${project.idPrefix}-${card.taskNumber}`;
}

export interface Column {
  id: Status;
  title: string;
  cards: Card[];
}

export const COLUMNS: { id: Status; title: string }[] = [
  { id: "ideation", title: "Ideation" },
  { id: "backlog", title: "Backlog" },
  { id: "bugs", title: "Bugs" },
  { id: "progress", title: "In Progress" },
  { id: "test", title: "Human Test" },
  { id: "completed", title: "Completed" },
];

export const STATUS_COLORS: Record<Status, string> = {
  ideation: "bg-status-ideation",
  backlog: "bg-status-backlog",
  bugs: "bg-status-bugs",
  progress: "bg-status-progress",
  test: "bg-status-test",
  completed: "bg-status-completed",
};

// Settings types
export type TerminalApp = "iterm2" | "ghostty" | "terminal";

export interface AppSettings {
  skillsPath: string;
  mcpConfigPath: string;
  terminalApp: TerminalApp;
  detectedTerminal: TerminalApp | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  skillsPath: "~/.claude/skills",
  mcpConfigPath: "~/.claude.json",
  terminalApp: "iterm2",
  detectedTerminal: null,
};

export const TERMINAL_OPTIONS: { value: TerminalApp; label: string }[] = [
  { value: "iterm2", label: "iTerm2" },
  { value: "ghostty", label: "Ghostty" },
  { value: "terminal", label: "Terminal.app" },
];

// Completed column filter
export type CompletedFilter = 'today' | 'yesterday' | 'this_week';

export const COMPLETED_FILTER_OPTIONS: { value: CompletedFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
];

// Complexity & Priority options
export const COMPLEXITY_OPTIONS: { value: Complexity; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#22c55e" },
  { value: "medium", label: "Medium", color: "#eab308" },
  { value: "high", label: "High", color: "#ef4444" },
];

export const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#6b7280" },
  { value: "medium", label: "Medium", color: "#3b82f6" },
  { value: "high", label: "High", color: "#ef4444" },
];
