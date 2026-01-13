"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, getDisplayId, PRIORITY_OPTIONS } from "@/lib/types";
import { useKanbanStore } from "@/lib/store";
import { Play, Loader2, Terminal, Lightbulb, FlaskConical } from "lucide-react";

// Strip HTML tags for preview text
function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// Linear-style priority icon with bars (3 levels)
function PriorityIcon({ priority }: { priority: string }) {
  const levels = {
    low: 1,
    medium: 2,
    high: 3,
  };
  const colors = {
    low: "#6b7280",
    medium: "#3b82f6",
    high: "#ef4444",
  };

  const level = levels[priority as keyof typeof levels] || 2;
  const color = colors[priority as keyof typeof colors] || "#3b82f6";

  return (
    <span title={`Priority: ${priority.charAt(0).toUpperCase() + priority.slice(1)}`}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        className="shrink-0"
      >
        {[0, 1, 2].map((i) => (
          <rect
            key={i}
            x={i * 4}
            y={9 - (i + 1) * 3}
            width="3"
            height={(i + 1) * 3}
            rx="0.5"
            fill={i < level ? color : "currentColor"}
            opacity={i < level ? 1 : 0.15}
          />
        ))}
      </svg>
    </span>
  );
}

interface TaskCardProps {
  card: Card;
  isDragging?: boolean;
}

type Phase = "planning" | "implementation" | "retest";

function detectPhase(card: Card): Phase {
  const hasSolution = card.solutionSummary && stripHtml(card.solutionSummary) !== "";
  const hasTests = card.testScenarios && stripHtml(card.testScenarios) !== "";

  if (!hasSolution) return "planning";
  if (!hasTests) return "implementation";
  return "retest";
}

function getPhaseLabels(phase: Phase): { play: string; terminal: string } {
  switch (phase) {
    case "planning":
      return {
        play: "Plan Task (Autonomous)",
        terminal: "Plan Task (Interactive)",
      };
    case "implementation":
      return {
        play: "Implement (Autonomous)",
        terminal: "Implement (Interactive)",
      };
    case "retest":
      return {
        play: "Re-test (Autonomous)",
        terminal: "Re-test (Interactive)",
      };
  }
}

export function TaskCard({ card, isDragging = false }: TaskCardProps) {
  const { selectCard, openModal, projects, startTask, startingCardId, openTerminal } = useKanbanStore();
  const { attributes, listeners, setNodeRef, transform, isDragging: isBeingDragged } = useDraggable({
    id: card.id,
  });

  const isStarting = startingCardId === card.id;
  const canStart = !!(card.description && (card.projectId || card.projectFolder) && card.status !== "completed");

  // Detect current phase for dynamic tooltips
  const phase = detectPhase(card);
  const phaseLabels = getPhaseLabels(phase);

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
      {/* Title with displayId and priority */}
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
        <h3 className="text-sm font-medium text-card-foreground group-hover:text-primary transition-colors line-clamp-2 flex-1">
          {card.title}
        </h3>
        <PriorityIcon priority={card.priority} />
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
                title={phaseLabels.terminal}
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
                title={isStarting ? "Running Claude..." : phaseLabels.play}
              >
                {isStarting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          )}
          {stripHtml(card.solutionSummary) && (
            <span
              className="p-1 rounded bg-green-500/15 text-green-500"
              title="Has solution"
            >
              <Lightbulb className="w-3 h-3" />
            </span>
          )}
          {stripHtml(card.testScenarios) && (
            <span
              className="p-1 rounded bg-blue-500/15 text-blue-500"
              title="Has tests"
            >
              <FlaskConical className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
