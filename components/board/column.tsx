"use client";

import { useDroppable } from "@dnd-kit/core";
import { Card as CardType, Status, STATUS_COLORS } from "@/lib/types";
import { useKanbanStore } from "@/lib/store";
import { TaskCard } from "./card";

interface ColumnProps {
  id: Status;
  title: string;
  cards: CardType[];
}

export function Column({ id, title, cards }: ColumnProps) {
  const { addCard, activeProjectId, projects } = useKanbanStore();
  const { setNodeRef, isOver } = useDroppable({ id });

  const handleAddCard = () => {
    const activeProject = projects.find((p) => p.id === activeProjectId);
    addCard({
      title: "New Task",
      description: "",
      solutionSummary: "",
      testScenarios: "",
      status: id,
      projectFolder: activeProject?.folderPath || "",
      projectId: activeProjectId,
    });
  };

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 min-w-72 bg-surface rounded-lg transition-all duration-200 ${
        isOver ? "ring-2 ring-primary ring-opacity-50 scale-[1.02]" : ""
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[id]}`} />
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {cards.length}
          </span>
        </div>
        <button
          onClick={handleAddCard}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
          title="Add card"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M8 3V13M3 8H13"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Cards Container */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-180px)]">
        {cards.map((card) => (
          <TaskCard key={card.id} card={card} />
        ))}
        {cards.length === 0 && (
          <div
            className={`text-center py-8 text-muted-foreground text-sm transition-colors ${
              isOver ? "bg-primary/10 rounded-md text-primary" : ""
            }`}
          >
            {isOver ? "Drop here" : "No tasks"}
          </div>
        )}
      </div>
    </div>
  );
}
