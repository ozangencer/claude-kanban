"use client";

import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, getDisplayId, COLUMNS } from "@/lib/types";
import { useKanbanStore } from "@/lib/store";
import { Play, Loader2, Terminal, Lightbulb, FlaskConical, ExternalLink, ArrowRightLeft, Trash2, Zap, Unlock, Brain, MessagesSquare, FileDown } from "lucide-react";
import { downloadCardAsMarkdown } from "@/lib/card-export";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
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
      </TooltipTrigger>
      <TooltipContent side="top">
        Priority: {priority.charAt(0).toUpperCase() + priority.slice(1)}
      </TooltipContent>
    </Tooltip>
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
  const { selectCard, openModal, projects, startTask, startingCardId, openTerminal, openIdeationTerminal, moveCard, deleteCard, quickFixTask, quickFixingCardId, evaluateIdea, evaluatingCardId, lockedCardIds, unlockCard, settings } = useKanbanStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showQuickFixConfirm, setShowQuickFixConfirm] = useState(false);
  const [showTerminalConfirm, setShowTerminalConfirm] = useState(false);
  const [showIdeationConfirm, setShowIdeationConfirm] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging: isBeingDragged } = useDraggable({
    id: card.id,
  });

  const isStarting = startingCardId === card.id;
  const isQuickFixing = quickFixingCardId === card.id;
  const isEvaluating = evaluatingCardId === card.id;
  const isLocked = lockedCardIds.includes(card.id);
  const canStart = !!(card.description && (card.projectId || card.projectFolder) && card.status !== "completed" && card.status !== "test" && card.status !== "ideation");
  const canQuickFix = card.status === "bugs" && !!(card.description && (card.projectId || card.projectFolder));
  const canEvaluate = card.status === "ideation" && !!(card.description && (card.projectId || card.projectFolder));
  const hasAiOpinion = !!stripHtml(card.aiOpinion);

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
    if (!isDragging && !isBeingDragged && !isLocked) {
      selectCard(card);
      openModal();
    }
  };

  const handleUnlock = (e: React.MouseEvent) => {
    e.stopPropagation();
    unlockCard(card.id);
  };

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isStarting || !canStart) return;

    const result = await startTask(card.id);
    if (!result.success) {
      console.error("Failed to start task:", result.error);
    }
  };

  const handleOpenTerminalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canStart) return;

    // Check if Ghostty - show confirmation dialog
    const isGhostty = settings?.detectedTerminal === "ghostty" || settings?.terminalApp === "ghostty";
    if (isGhostty) {
      setShowTerminalConfirm(true);
    } else {
      // Not Ghostty, open terminal directly
      handleOpenTerminal();
    }
  };

  const handleOpenTerminal = async () => {
    setShowTerminalConfirm(false);

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

  const handleEvaluate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEvaluating || !canEvaluate) return;

    const result = await evaluateIdea(card.id);
    if (!result.success) {
      console.error("Failed to evaluate idea:", result.error);
    }
  };

  const handleOpenIdeationTerminalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEvaluate) return;

    // Check if Ghostty - show confirmation dialog
    const isGhostty = settings?.detectedTerminal === "ghostty" || settings?.terminalApp === "ghostty";
    if (isGhostty) {
      setShowIdeationConfirm(true);
    } else {
      handleOpenIdeationTerminal();
    }
  };

  const handleOpenIdeationTerminal = async () => {
    setShowIdeationConfirm(false);

    const result = await openIdeationTerminal(card.id);
    if (!result.success) {
      console.error("Failed to open ideation terminal:", result.error);
    }
  };

  const handleExportMarkdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadCardAsMarkdown(card, project);
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
            {...(isLocked ? {} : listeners)}
            {...(isLocked ? {} : attributes)}
            onClick={handleClick}
            className={`bg-card border border-border rounded-md p-3 transition-colors group touch-none select-none relative ${
              isDragging ? "shadow-2xl ring-2 ring-primary/50" : ""
            } ${isBeingDragged ? "z-50" : ""} ${
              isLocked
                ? "opacity-50 cursor-not-allowed"
                : "hover:border-primary/50"
            }`}
          >
            {/* Unlock button for locked cards */}
            {isLocked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleUnlock}
                    className="absolute top-2 right-2 p-1.5 rounded bg-orange-500/20 text-orange-500 hover:bg-orange-500/30 transition-colors z-10"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left">Unlock</TooltipContent>
              </Tooltip>
            )}

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
              <h3 className={`text-sm font-medium text-card-foreground transition-colors line-clamp-2 flex-1 ${isLocked ? "" : "group-hover:text-primary"}`}>
                {card.title}
              </h3>
              {!isLocked && <PriorityIcon priority={card.priority} />}
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
                {canEvaluate && (
                  <>
                    {/* Interactive Ideation */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleOpenIdeationTerminalClick}
                          className="p-1 rounded transition-colors bg-cyan-500/10 text-cyan-500/70 hover:bg-cyan-500/20 hover:text-cyan-500"
                        >
                          <MessagesSquare className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Discuss Idea (Interactive)</TooltipContent>
                    </Tooltip>
                    {/* Autonomous Evaluate */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleEvaluate}
                          disabled={isEvaluating}
                          className={`p-1 rounded transition-colors ${
                            isEvaluating
                              ? "bg-purple-500/20 text-purple-500 cursor-wait"
                              : "bg-purple-500/10 text-purple-500/70 hover:bg-purple-500/20 hover:text-purple-500"
                          }`}
                        >
                          {isEvaluating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Brain className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {isEvaluating ? "Evaluating..." : hasAiOpinion ? "Re-evaluate Idea" : "Evaluate Idea"}
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                {canQuickFix && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleQuickFixClick}
                        disabled={isQuickFixing}
                        className={`p-1 rounded transition-colors ${
                          isQuickFixing
                            ? "bg-yellow-500/20 text-yellow-500 cursor-wait"
                            : "bg-yellow-500/10 text-yellow-500/70 hover:bg-yellow-500/20 hover:text-yellow-500"
                        }`}
                      >
                        {isQuickFixing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {isQuickFixing ? "Quick fixing..." : "Quick Fix (No Plan)"}
                    </TooltipContent>
                  </Tooltip>
                )}
                {canStart && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleOpenTerminalClick}
                          className="p-1 rounded transition-colors bg-orange-500/10 text-orange-500/70 hover:bg-orange-500/20 hover:text-orange-500"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">{phaseLabels.terminal}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleStart}
                          disabled={isStarting}
                          className={`p-1 rounded transition-colors ${
                            isStarting
                              ? "bg-primary/20 text-primary cursor-wait"
                              : "bg-primary/10 text-primary/70 hover:bg-primary/20 hover:text-primary"
                          }`}
                        >
                          {isStarting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {isStarting ? "Running Claude..." : phaseLabels.play}
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                                {stripHtml(card.solutionSummary) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="p-1 rounded bg-green-500/15 text-green-500">
                        <Lightbulb className="w-3 h-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">Has solution</TooltipContent>
                  </Tooltip>
                )}
                {stripHtml(card.testScenarios) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="p-1 rounded bg-blue-500/15 text-blue-500">
                        <FlaskConical className="w-3 h-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">Has tests</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {isLocked && (
            <>
              <ContextMenuItem onClick={handleUnlock} className="text-orange-500 focus:text-orange-500">
                <Unlock className="w-4 h-4 mr-2" />
                Unlock
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onClick={handleClick} disabled={isLocked}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Details
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger disabled={isLocked}>
              <ArrowRightLeft className="w-4 h-4 mr-2" />
              Change Status
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-40">
              {COLUMNS.map((col) => (
                <ContextMenuItem
                  key={col.id}
                  onClick={() => moveCard(card.id, col.id)}
                  disabled={card.status === col.id || isLocked}
                >
                  {col.title}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onClick={handleExportMarkdown}>
            <FileDown className="w-4 h-4 mr-2" />
            Export as Markdown
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-500 focus:text-red-500"
            disabled={isLocked}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Card</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{card.title}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCard(card.id)}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showQuickFixConfirm} onOpenChange={setShowQuickFixConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quick Fix Mode</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to start this card in quick-fix mode?
              <br /><br />
              <strong>Warning:</strong> No plan will be written and Claude will work with full file access.
              After the bug fix is completed, the card will automatically be moved to the Human Test column.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleQuickFix}
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              Start Quick Fix
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showTerminalConfirm} onOpenChange={setShowTerminalConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Open Interactive Terminal</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Tip:</strong> Use <kbd className="px-1.5 py-0.5 bg-secondary border border-border rounded text-xs">⌘V</kbd> to paste in Ghostty terminal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleOpenTerminal}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Open Terminal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showIdeationConfirm} onOpenChange={setShowIdeationConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Interactive Ideation</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>Tip:</strong> Use <kbd className="px-1.5 py-0.5 bg-secondary border border-border rounded text-xs">⌘V</kbd> to paste in Ghostty terminal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleOpenIdeationTerminal}
              className="bg-cyan-500 hover:bg-cyan-600"
            >
              Start Discussion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
