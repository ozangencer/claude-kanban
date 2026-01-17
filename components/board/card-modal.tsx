"use client";

import { useState, useEffect, useRef } from "react";
import { useKanbanStore } from "@/lib/store";
import {
  COLUMNS,
  Status,
  getDisplayId,
  Complexity,
  Priority,
  COMPLEXITY_OPTIONS,
  PRIORITY_OPTIONS,
  GitBranchStatus,
  GitWorktreeStatus,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { X, ChevronRight, ArrowLeft, Brain, FileText, Lightbulb, TestTube2, Maximize2, Minimize2, FileDown, GitBranch, GitMerge, Undo2, Loader2, FolderGit2, MonitorPlay, MonitorStop, AlertTriangle, Terminal, Archive } from "lucide-react";
import { downloadCardAsMarkdown } from "@/lib/card-export";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

// Strip HTML tags for preview text
function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function ChevronIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <ChevronRight
      className={`h-4 w-4 transition-transform duration-200 ${
        isOpen ? "rotate-90" : ""
      }`}
    />
  );
}

export function CardModal() {
  const { selectedCard, closeModal, updateCard, deleteCard, projects, cards, selectCard, openModal, draftCard, saveDraftCard, discardDraft, startDevServer, stopDevServer } =
    useKanbanStore();
  const { toast } = useToast();

  // Check if we're in draft mode (creating a new card)
  const isDraftMode = selectedCard?.id.startsWith("draft-");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [solutionSummary, setSolutionSummary] = useState("");
  const [testScenarios, setTestScenarios] = useState("");
  const [aiOpinion, setAiOpinion] = useState("");
  const [status, setStatus] = useState<Status>("ideation");
  const [complexity, setComplexity] = useState<Complexity>("medium");
  const [priority, setPriority] = useState<Priority>("medium");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Collapsible states
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [aiOpinionOpen, setAiOpinionOpen] = useState(false);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [testsOpen, setTestsOpen] = useState(false);

  // Unsaved changes dialog state
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Card navigation history for back button
  const [cardHistory, setCardHistory] = useState<string[]>([]);

  // Git branch state
  const [gitBranchName, setGitBranchName] = useState<string | null>(null);
  const [gitBranchStatus, setGitBranchStatus] = useState<GitBranchStatus>(null);
  const [gitWorktreePath, setGitWorktreePath] = useState<string | null>(null);
  const [gitWorktreeStatus, setGitWorktreeStatus] = useState<GitWorktreeStatus>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [showCommitFirstDialog, setShowCommitFirstDialog] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<{
    conflictFiles: string[];
    worktreePath: string;
    branchName: string;
    displayId: string;
  } | null>(null);

  // Dev server state
  const [devServerPort, setDevServerPort] = useState<number | null>(null);
  const [devServerPid, setDevServerPid] = useState<number | null>(null);
  const [isServerLoading, setIsServerLoading] = useState(false);

  // Track unsaved changes
  const hasUnsavedChanges = selectedCard && (
    title !== selectedCard.title ||
    description !== selectedCard.description ||
    solutionSummary !== selectedCard.solutionSummary ||
    testScenarios !== selectedCard.testScenarios ||
    aiOpinion !== selectedCard.aiOpinion ||
    status !== selectedCard.status ||
    complexity !== (selectedCard.complexity || "medium") ||
    priority !== (selectedCard.priority || "medium") ||
    projectId !== selectedCard.projectId
  );

  // Get project and displayId
  const project = projects.find((p) => p.id === projectId);
  const displayId = selectedCard ? getDisplayId(selectedCard, project) : null;

  // Check if save should be disabled (no project selected or no title)
  const isTitleValid = (title || "").trim().length > 0;
  const canSave = projectId !== null && isTitleValid;

  useEffect(() => {
    if (selectedCard) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [selectedCard]);

  useEffect(() => {
    if (selectedCard) {
      setTitle(selectedCard.title);
      setDescription(selectedCard.description);
      setSolutionSummary(selectedCard.solutionSummary);
      setTestScenarios(selectedCard.testScenarios);
      setAiOpinion(selectedCard.aiOpinion);
      setStatus(selectedCard.status);
      setComplexity(selectedCard.complexity || "medium");
      setPriority(selectedCard.priority || "medium");
      setProjectId(selectedCard.projectId);
      setGitBranchName(selectedCard.gitBranchName);
      setGitBranchStatus(selectedCard.gitBranchStatus);
      setGitWorktreePath(selectedCard.gitWorktreePath);
      setGitWorktreeStatus(selectedCard.gitWorktreeStatus);
      setDevServerPort(selectedCard.devServerPort);
      setDevServerPid(selectedCard.devServerPid);

      // Auto-open Test Scenarios when card is in Human Test column
      if (selectedCard.status === "test") {
        setTestsOpen(true);
      }
    }
  }, [selectedCard]);

  // Handle card mention click - open another card
  const handleCardClick = (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (card && card.id !== selectedCard?.id) {
      // Save current card to history before navigating
      if (selectedCard) {
        setCardHistory((prev) => [...prev, selectedCard.id]);
      }
      selectCard(card);
      openModal();
    }
  };

  // Handle back navigation
  const handleBack = () => {
    if (cardHistory.length > 0) {
      const newHistory = [...cardHistory];
      const previousCardId = newHistory.pop();
      setCardHistory(newHistory);

      if (previousCardId) {
        const previousCard = cards.find((c) => c.id === previousCardId);
        if (previousCard) {
          selectCard(previousCard);
        }
      }
    }
  };

  // Clear history when modal closes
  const handleClose = () => {
    setCardHistory([]);
    setIsVisible(false);
    if (isDraftMode) {
      setTimeout(() => discardDraft(), 200);
    } else {
      setTimeout(() => closeModal(), 200);
    }
  };

  // Handle export
  const handleExport = () => {
    if (selectedCard) {
      downloadCardAsMarkdown(selectedCard, project);
    }
  };

  // Handle git merge
  const handleMerge = async (commitFirst = false) => {
    if (!selectedCard) return;

    setIsMerging(true);
    try {
      const response = await fetch(`/api/cards/${selectedCard.id}/git/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commitFirst }),
      });

      if (!response.ok) {
        const error = await response.json();

        // Check if we need to show commit first dialog
        if (error.uncommittedInMain) {
          setShowCommitFirstDialog(true);
          return;
        }

        // Check if there's a rebase conflict
        if (error.rebaseConflict) {
          setConflictInfo({
            conflictFiles: error.conflictFiles || [],
            worktreePath: error.worktreePath || "",
            branchName: error.branchName || "",
            displayId: error.displayId || "",
          });
          setShowConflictDialog(true);
          // Refresh cards to show conflict badge
          await useKanbanStore.getState().fetchCards();
          return;
        }

        // Check for uncommitted changes in worktree
        if (error.uncommittedInWorktree) {
          toast({
            variant: "destructive",
            title: "Uncommitted Changes",
            description: "Please commit your changes in the worktree before merging.",
          });
          return;
        }

        toast({
          variant: "destructive",
          title: "Merge Failed",
          description: error.error || "An error occurred during merge",
        });
        return;
      }

      // Refresh the card data
      await useKanbanStore.getState().fetchCards();
      toast({
        title: "Branch Merged",
        description: `Successfully merged and moved to Completed`,
      });
      handleClose();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Merge Failed",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsMerging(false);
    }
  };

  // Handle commit and merge
  const handleCommitAndMerge = async () => {
    setShowCommitFirstDialog(false);
    await handleMerge(true);
  };

  // Handle solve conflict with AI
  const handleSolveConflictWithAI = async () => {
    if (!selectedCard || !conflictInfo) return;

    setShowConflictDialog(false);
    try {
      const response = await fetch(`/api/cards/${selectedCard.id}/resolve-conflict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conflictFiles: conflictInfo.conflictFiles,
          worktreePath: conflictInfo.worktreePath,
          branchName: conflictInfo.branchName,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          variant: "destructive",
          title: "Failed to Open Terminal",
          description: data.error || "Could not open terminal for conflict resolution",
        });
        return;
      }

      toast({
        title: "Terminal Opened",
        description: "Claude Code is ready to help resolve the conflict",
      });
      handleClose();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to open terminal",
      });
    }
  };

  // Handle dev server start
  const handleStartDevServer = async () => {
    if (!selectedCard || isServerLoading) return;

    setIsServerLoading(true);
    try {
      const result = await startDevServer(selectedCard.id);
      if (result.success && result.port) {
        setDevServerPort(result.port);
        // Get the updated PID from store
        const updatedCard = useKanbanStore.getState().cards.find(c => c.id === selectedCard.id);
        if (updatedCard) {
          setDevServerPid(updatedCard.devServerPid);
        }
        toast({
          title: "Dev Server Started",
          description: `Running on port ${result.port}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Start Server",
          description: result.error || "Unknown error",
        });
      }
    } finally {
      setIsServerLoading(false);
    }
  };

  // Handle dev server stop
  const handleStopDevServer = async () => {
    if (!selectedCard || isServerLoading) return;

    setIsServerLoading(true);
    try {
      const result = await stopDevServer(selectedCard.id);
      if (result.success) {
        setDevServerPort(null);
        setDevServerPid(null);
        toast({
          title: "Dev Server Stopped",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Stop Server",
          description: result.error || "Unknown error",
        });
      }
    } finally {
      setIsServerLoading(false);
    }
  };

  // Handle git rollback
  const handleRollback = async (deleteBranch: boolean) => {
    if (!selectedCard) return;

    setIsRollingBack(true);
    try {
      const response = await fetch(`/api/cards/${selectedCard.id}/git/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteBranch }),
      });

      if (!response.ok) {
        const error = await response.json();
        toast({
          variant: "destructive",
          title: "Rollback Failed",
          description: error.error || "An error occurred during rollback",
        });
        return;
      }

      // Refresh the card data
      await useKanbanStore.getState().fetchCards();
      setShowRollbackDialog(false);
      toast({
        title: "Rolled Back",
        description: deleteBranch
          ? "Branch deleted, card moved to Bugs"
          : "Switched to main, branch preserved",
      });
      handleClose();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Rollback Failed",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsRollingBack(false);
    }
  };

  const handleSave = () => {
    if (selectedCard) {
      const selectedProject = projects.find((p) => p.id === projectId);

      if (isDraftMode) {
        // Create new card
        saveDraftCard({
          title,
          description,
          solutionSummary,
          testScenarios,
          aiOpinion,
          status,
          complexity,
          priority,
          projectId,
          projectFolder: selectedProject?.folderPath || "",
          gitBranchName: null,
          gitBranchStatus: null,
          gitWorktreePath: null,
          gitWorktreeStatus: null,
          devServerPort: null,
          devServerPid: null,
          rebaseConflict: null,
          conflictFiles: null,
          processingType: null,
        });
      } else {
        // Update existing card
        const cardId = selectedCard.id;
        const updates = {
          title,
          description,
          solutionSummary,
          testScenarios,
          aiOpinion,
          status,
          complexity,
          priority,
          projectId,
          projectFolder: selectedProject?.folderPath || selectedCard.projectFolder,
        };
        // Close first, then update to prevent flicker
        handleClose();
        updateCard(cardId, updates);
      }
    }
  };

  const handleDelete = () => {
    if (selectedCard) {
      deleteCard(selectedCard.id);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking the backdrop itself (not the panel)
    if (e.target === e.currentTarget) {
      if (hasUnsavedChanges) {
        setShowUnsavedDialog(true);
      } else {
        handleClose();
      }
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  if (!selectedCard) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-end transition-colors duration-200 ${
        isVisible ? "bg-black/40" : "bg-transparent"
      }`}
      onClick={handleBackdropClick}
    >
      <div
        className={`bg-surface border-l border-border w-full h-full flex flex-col shadow-2xl transition-all duration-200 ease-out ${
          isExpanded ? "max-w-[1200px]" : "max-w-[700px]"
        } ${isVisible ? "translate-x-0" : "translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            {/* Display ID badge */}
            {displayId && (
              <div className="mb-2">
                <span
                  className="text-xs font-mono px-2 py-1 rounded"
                  style={{
                    backgroundColor: project ? `${project.color}20` : undefined,
                    color: project?.color,
                  }}
                >
                  {displayId}
                </span>
              </div>
            )}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`bg-transparent border-none outline-none w-full text-foreground p-0 ${
                !isTitleValid ? "placeholder:text-muted-foreground/50" : ""
              }`}
              style={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1.2 }}
              placeholder="New Title"
            />
            {!isTitleValid && (
              <p className="text-xs text-destructive mt-1">Title is required</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {cardHistory.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleBack}
                className="text-muted-foreground hover:text-foreground"
                title="Go back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExport}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <FileDown className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Export as Markdown</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-muted-foreground hover:text-foreground"
              title={isExpanded ? "Collapse panel" : "Expand panel"}
            >
              {isExpanded ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Status & Project */}
          <div className="grid grid-cols-2 gap-4 pb-2">
            <div>
              <label className="block text-sm text-muted-foreground mb-2">
                Status
              </label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as Status)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {COLUMNS.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-2">
                Project <span className="text-destructive">*</span>
              </label>
              <Select
                value={projectId || "none"}
                onValueChange={(v) => setProjectId(v === "none" ? null : v)}
              >
                <SelectTrigger className={`w-full ${!projectId ? "border-destructive" : ""}`}>
                  <SelectValue placeholder="Select project">
                    {projectId ? (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            backgroundColor:
                              projects.find((p) => p.id === projectId)?.color ||
                              "#5e6ad2",
                          }}
                        />
                        <span>
                          {projects.find((p) => p.id === projectId)?.name ||
                            "Select project"}
                        </span>
                      </div>
                    ) : (
                      "Select project"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-1">
                          {p.idPrefix}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!projectId && (
                <p className="text-xs text-destructive mt-1">Please select a project</p>
              )}
            </div>
          </div>

          {/* Complexity & Priority */}
          <div className="grid grid-cols-2 gap-4 pb-2">
            <div>
              <label className="block text-sm text-muted-foreground mb-2">
                Complexity
              </label>
              <Select
                value={complexity}
                onValueChange={(v) => setComplexity(v as Complexity)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor:
                            COMPLEXITY_OPTIONS.find((o) => o.value === complexity)
                              ?.color || "#eab308",
                        }}
                      />
                      <span>
                        {COMPLEXITY_OPTIONS.find((o) => o.value === complexity)
                          ?.label || "Medium"}
                      </span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {COMPLEXITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: opt.color }}
                        />
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-2">
                Priority
              </label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as Priority)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor:
                            PRIORITY_OPTIONS.find((o) => o.value === priority)
                              ?.color || "#3b82f6",
                        }}
                      />
                      <span>
                        {PRIORITY_OPTIONS.find((o) => o.value === priority)
                          ?.label || "Medium"}
                      </span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: opt.color }}
                        />
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Git Branch Actions - Prominent placement for Human Test cards */}
          {status === "test" && gitBranchName && gitBranchStatus === "active" && (
            <div className="border-2 border-blue-500/50 rounded-lg p-4 bg-blue-500/10">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-blue-500" />
                    <span className="font-mono text-muted-foreground">{gitBranchName}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleMerge()}
                      disabled={isMerging}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isMerging ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <GitMerge className="mr-2 h-4 w-4" />
                      )}
                      Merge & Complete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRollbackDialog(true)}
                      disabled={isMerging || isRollingBack}
                      className="border-red-500/50 text-red-500 hover:bg-red-500/10"
                    >
                      <Undo2 className="mr-2 h-4 w-4" />
                      Rollback
                    </Button>
                  </div>
                </div>
                {gitWorktreeStatus === "active" && gitWorktreePath && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FolderGit2 className="h-3.5 w-3.5 text-cyan-500" />
                    <span className="font-mono truncate" title={gitWorktreePath}>
                      {gitWorktreePath.split('/').slice(-3).join('/')}
                    </span>
                  </div>
                )}
                {/* Dev Server Status */}
                {gitWorktreeStatus === "active" && (
                  <div className="flex items-center gap-2 pt-2 border-t border-border/50 mt-2">
                    {devServerPid ? (
                      <>
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-sm text-muted-foreground">
                          Server running on port <span className="font-mono text-foreground">{devServerPort}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleStopDevServer}
                          disabled={isServerLoading}
                          className="ml-auto border-red-500/50 text-red-500 hover:bg-red-500/10"
                        >
                          {isServerLoading ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <MonitorStop className="mr-2 h-3 w-3" />
                          )}
                          Stop
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleStartDevServer}
                        disabled={isServerLoading}
                        className="border-cyan-500/50 text-cyan-500 hover:bg-cyan-500/10"
                      >
                        {isServerLoading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <MonitorPlay className="mr-2 h-4 w-4" />
                        )}
                        Start Dev Server
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Git Branch Status Badges */}
          {gitBranchName && gitBranchStatus === "merged" && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-green-500/30 bg-green-500/10">
              <GitMerge className="h-4 w-4 text-green-500" />
              <span className="text-green-500 font-medium">Merged</span>
              <span className="font-mono text-muted-foreground text-xs">{gitBranchName}</span>
            </div>
          )}

          {gitBranchName && gitBranchStatus === "rolled_back" && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
              <Undo2 className="h-4 w-4 text-yellow-500" />
              <span className="text-yellow-500 font-medium">Rolled back</span>
              <span className="font-mono text-muted-foreground text-xs">{gitBranchName}</span>
            </div>
          )}

          {/* Active Worktree Badge (for In Progress cards) */}
          {status === "progress" && gitWorktreeStatus === "active" && gitWorktreePath && gitBranchName && (
            <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10">
              <FolderGit2 className="h-4 w-4 text-cyan-500" />
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-500 font-medium">Worktree active</span>
                  <span className="font-mono text-muted-foreground text-xs">{gitBranchName}</span>
                </div>
                <span className="font-mono text-muted-foreground text-xs truncate" title={gitWorktreePath}>
                  {gitWorktreePath.split('/').slice(-3).join('/')}
                </span>
              </div>
            </div>
          )}

          {/* Detail */}
          <Collapsible open={descriptionOpen} onOpenChange={setDescriptionOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronIcon isOpen={descriptionOpen} />
              <FileText className="h-4 w-4 text-blue-500" />
              <span className="font-medium">Detail</span>
              {!descriptionOpen && description && (
                <span className="text-xs text-muted-foreground/60 truncate ml-2">
                  {stripHtml(description).slice(0, 50)}...
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <MarkdownEditor
                value={description}
                onChange={setDescription}
                placeholder="Describe the task..."
                minHeight="120px"
                onCardClick={handleCardClick}
              />
            </CollapsibleContent>
          </Collapsible>

          {/* AI's Opinion */}
          <Collapsible open={aiOpinionOpen} onOpenChange={setAiOpinionOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronIcon isOpen={aiOpinionOpen} />
              <Brain className="h-4 w-4 text-purple-500" />
              <span className="font-medium">AI&apos;s Opinion</span>
              {!aiOpinionOpen && aiOpinion && (
                <span className="text-xs text-muted-foreground/60 truncate ml-2">
                  {stripHtml(aiOpinion).slice(0, 50)}...
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <MarkdownEditor
                value={aiOpinion}
                onChange={setAiOpinion}
                placeholder="AI's evaluation of this idea..."
                minHeight="150px"
                onCardClick={handleCardClick}
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Solution Summary */}
          <Collapsible open={solutionOpen} onOpenChange={setSolutionOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronIcon isOpen={solutionOpen} />
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span className="font-medium">Solution Summary</span>
              {!solutionOpen && solutionSummary && (
                <span className="text-xs text-muted-foreground/60 truncate ml-2">
                  {stripHtml(solutionSummary).slice(0, 50)}...
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <MarkdownEditor
                value={solutionSummary}
                onChange={setSolutionSummary}
                placeholder="Document the agreed solution..."
                minHeight="150px"
                onCardClick={handleCardClick}
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Test Scenarios */}
          <Collapsible open={testsOpen} onOpenChange={setTestsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronIcon isOpen={testsOpen} />
              <TestTube2 className="h-4 w-4 text-green-500" />
              <span className="font-medium">Test Scenarios</span>
              {!testsOpen && testScenarios && (
                <span className="text-xs text-muted-foreground/60 truncate ml-2">
                  {stripHtml(testScenarios).slice(0, 50)}...
                </span>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <MarkdownEditor
                value={testScenarios}
                onChange={setTestScenarios}
                placeholder="- [ ] Test case 1&#10;- [ ] Test case 2"
                minHeight="150px"
                onCardClick={handleCardClick}
              />
            </CollapsibleContent>
          </Collapsible>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0">
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete task?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the
                    task &quot;{title}&quot;.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {!isDraftMode && status !== "withdrawn" && (
              <Button
                variant="ghost"
                className="text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  if (selectedCard) {
                    updateCard(selectedCard.id, { status: "withdrawn" });
                    handleClose();
                  }
                }}
              >
                <Archive className="mr-2 h-4 w-4" />
                Withdraw
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              {isDraftMode ? "Create Card" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>

      {/* Unsaved Changes Dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rollback Dialog */}
      <AlertDialog open={showRollbackDialog} onOpenChange={setShowRollbackDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rollback Branch</AlertDialogTitle>
            <AlertDialogDescription>
              This will checkout to the main branch. What would you like to do with the feature branch?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleRollback(false)}
              disabled={isRollingBack}
            >
              {isRollingBack ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitBranch className="mr-2 h-4 w-4" />
              )}
              Keep branch (can retry later)
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={() => handleRollback(true)}
              disabled={isRollingBack}
            >
              {isRollingBack ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-2 h-4 w-4" />
              )}
              Delete branch (start fresh)
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRollingBack}>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Commit First Dialog */}
      <AlertDialog open={showCommitFirstDialog} onOpenChange={setShowCommitFirstDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uncommitted Changes</AlertDialogTitle>
            <AlertDialogDescription>
              There are uncommitted changes in the main repository. Would you like to commit these changes and proceed with the merge?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isMerging}>Cancel</AlertDialogCancel>
            <Button
              onClick={handleCommitAndMerge}
              disabled={isMerging}
              className="bg-green-600 hover:bg-green-700"
            >
              {isMerging ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <GitMerge className="mr-2 h-4 w-4" />
              )}
              Commit & Merge
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conflict Dialog */}
      <AlertDialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" />
              Rebase Conflict Detected
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  A merge conflict was detected while rebasing{" "}
                  <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded">
                    {conflictInfo?.branchName}
                  </span>{" "}
                  onto main.
                </p>
                {conflictInfo?.conflictFiles && conflictInfo.conflictFiles.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Conflicting files:</p>
                    <ul className="text-xs font-mono bg-secondary/50 rounded p-2 space-y-1">
                      {conflictInfo.conflictFiles.map((file) => (
                        <li key={file} className="text-red-400">
                          • {file}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  The card will remain in Human Test with a conflict badge until resolved.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <Button
              onClick={handleSolveConflictWithAI}
              className="bg-orange-500 hover:bg-orange-600"
            >
              <Terminal className="mr-2 h-4 w-4" />
              Solve with AI
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
