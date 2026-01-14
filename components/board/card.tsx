"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, getDisplayId, COLUMNS } from "@/lib/types";
import { useKanbanStore } from "@/lib/store";
import { Play, Loader2, Terminal, Lightbulb, FlaskConical, ExternalLink, ArrowRightLeft, Trash2, Zap } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const { selectCard, openModal, projects, startTask, startingCardId, openTerminal, moveCard, deleteCard, quickFixTask, quickFixingCardId } = useKanbanStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showQuickFixConfirm, setShowQuickFixConfirm] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging: isBeingDragged } = useDraggable({
    id: card.id,
  });

  const isStarting = startingCardId === card.id;
  const isQuickFixing = quickFixingCardId === card.id;
  const canStart = !!(card.description && (card.projectId || card.projectFolder) && card.status !== "completed" && card.status !== "test");
  const canQuickFix = card.status === "bugs" && !!(card.description && (card.projectId || card.projectFolder));

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

  const handleQuickFixClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowQuickFixConfirm(true);
  };

  const handleQuickFix = async () => {
    setShowQuickFixConfirm(false);
    if (isQuickFixing || !canQuickFix) return;

    const result = await quickFixTask(card.id);
    if (!result.success) {
      console.error("Failed to quick fix:", result.error);
    }
  };

  // Get project for this card
  const project = projects.find((p) => p.id === card.projectId);
  const displayId = getDisplayId(card, project);
  const projectName = project?.name || (card.projectFolder ? card.projectFolder.split("/").pop() : null);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
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
                {canQuickFix && (
                  <button
                    onClick={handleQuickFixClick}
                    disabled={isQuickFixing}
                    className={`p-1 rounded transition-colors ${
                      isQuickFixing
                        ? "bg-yellow-500/20 text-yellow-500 cursor-wait"
                        : "bg-yellow-500/10 text-yellow-500/70 hover:bg-yellow-500/20 hover:text-yellow-500"
                    }`}
                    title={isQuickFixing ? "Quick fixing..." : "Quick Fix (No Plan)"}
                  >
                    {isQuickFixing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Zap className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
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
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onClick={handleClick}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Detay Aç
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Statü Değiştir
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-40">
              {COLUMNS.map((col) => (
                <ContextMenuItem
                  key={col.id}
                  onClick={() => moveCard(card.id, col.id)}
                  disabled={card.status === col.id}
                >
                  {col.title}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-500 focus:text-red-500"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Sil
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kartı Sil</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{card.title}&quot; kartını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCard(card.id)}
              className="bg-red-500 hover:bg-red-600"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showQuickFixConfirm} onOpenChange={setShowQuickFixConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quick Fix Mode</AlertDialogTitle>
            <AlertDialogDescription>
              Bu kartı quick-fix modunda başlatmak istediğine emin misin?
              <br /><br />
              <strong>Dikkat:</strong> Plan yazılmayacak ve Claude tam dosya erişimi ile çalışacak.
              Bug fix tamamlandıktan sonra kart otomatik olarak Human Test sütununa taşınacak.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleQuickFix}
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              Quick Fix Başlat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
