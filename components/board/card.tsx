"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, getDisplayId } from "@/lib/types";
import { useKanbanStore } from "@/lib/store";
import { Play, Loader2, Terminal } from "lucide-react";

// Strip HTML tags for preview text
function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

interface TaskCardProps {
  card: Card;
  isDragging?: boolean;
}

export function TaskCard({ card, isDragging = false }: TaskCardProps) {
  const { selectCard, openModal, projects, startTask, startingCardId, openTerminal } = useKanbanStore();
  const { attributes, listeners, setNodeRef, transform, isDragging: isBeingDragged } = useDraggable({
    id: card.id,
  });

  const isStarting = startingCardId === card.id;
  const canStart = !!(card.description && (card.projectId || card.projectFolder));

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: transform ? 'transform 0ms' : 'transform 200ms ease',
    opacity: isBeingDragged ? 0 : 1,
    cursor: isBeingDragged ? 'grabbing' : 'grab',
  };

  const handleClick = () => {
    if (!isDragging && !isBeingDragged) {
      selectCard(card);
      openModal();
    }
  };

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStarting || !canStart) return;

    const result = await startTask(card.id);
    if (!result.success) {
      console.error("Failed to start task:", result.error);
    }
  };

  const handleOpenTerminal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canStart) return;

    const result = await openTerminal(card.id);
    if (!result.success) {
      console.error("Failed to open terminal:", result.error);
    }
  };

  // Get project for this card
  const project = projects.find((p) => p.id === card.projectId);
  const displayId = getDisplayId(card, project);
  const projectName = project?.name || (card.projectFolder ? card.projectFolder.split("/").pop() : null);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      className={`bg-card border border-border rounded-md p-3 hover:border-primary/50 transition-colors group touch-none select-none ${
        isDragging ? "shadow-2xl ring-2 ring-primary/50" : ""
      } ${isBeingDragged ? "z-50" : ""}`}
    >
      {/* Title with displayId */}
      <div className="flex items-start gap-2 mb-1">
        {displayId && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
            style={{
              backgroundColor: project ? `${project.color}20` : undefined,
              color: project?.color,
            }}
          >
            {displayId}
          </span>
        )}
        <h3 className="text-sm font-medium text-card-foreground group-hover:text-primary transition-colors line-clamp-2">
          {card.title}
        </h3>
      </div>

      {card.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {stripHtml(card.description)}
        </p>
      )}

      <div className="flex items-center justify-between">
        {/* Project indicator */}
        {projectName ? (
          <div className="flex items-center gap-1.5">
            {project && (
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: project.color }}
              />
            )}
            <span className="text-xs text-muted-foreground truncate max-w-[120px]">
              {projectName}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No project</span>
        )}

        {/* Badges and Action Buttons */}
        <div className="flex items-center gap-1">
          {canStart && (
            <>
              <button
                onClick={handleOpenTerminal}
                className="p-1 rounded transition-colors bg-orange-500/10 text-orange-500/70 hover:bg-orange-500/20 hover:text-orange-500"
                title="Open in Ghostty (Interactive)"
              >
                <Terminal className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleStart}
                disabled={isStarting}
                className={`p-1 rounded transition-colors ${
                  isStarting
                    ? "bg-primary/20 text-primary cursor-wait"
                    : "bg-primary/10 text-primary/70 hover:bg-primary/20 hover:text-primary"
                }`}
                title={isStarting ? "Running Claude..." : "Start with Claude (Background)"}
              >
                {isStarting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          )}
          {card.solutionSummary && (
            <span className="text-xs bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded">
              Solution
            </span>
          )}
          {card.testScenarios && (
            <span className="text-xs bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded">
              Tests
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
