export type Status =
  | "ideation"
  | "backlog"
  | "bugs"
  | "progress"
  | "test"
  | "completed";

export interface Card {
  id: string;
  title: string;
  description: string;
  solutionSummary: string;
  testScenarios: string;
  status: Status;
  projectFolder: string;
  projectId: string | null;
  taskNumber: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  folderPath: string;
  idPrefix: string;
  nextTaskNumber: number;
  color: string;
  isPinned: boolean;
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
  { id: "test", title: "Test" },
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
