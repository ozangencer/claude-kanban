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
import { X, ChevronRight, ArrowLeft, Brain, FileText, Lightbulb, TestTube2, Maximize2, Minimize2, FileDown } from "lucide-react";
import { downloadCardAsMarkdown } from "@/lib/card-export";
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
  const { selectedCard, closeModal, updateCard, deleteCard, projects, cards, selectCard, openModal } =
    useKanbanStore();

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

  // Check if save should be disabled (no project selected)
  const canSave = projectId !== null;

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
    setTimeout(() => closeModal(), 200);
  };

  // Handle export
  const handleExport = () => {
    if (selectedCard) {
      downloadCardAsMarkdown(selectedCard, project);
    }
  };

  const handleSave = () => {
    if (selectedCard) {
      const cardId = selectedCard.id;
      const selectedProject = projects.find((p) => p.id === projectId);
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
              className="bg-transparent border-none outline-none w-full text-foreground p-0"
              style={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1.2 }}
              placeholder="Task title"
            />
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
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!canSave}>
              Save Changes
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
    </div>
  );
}
