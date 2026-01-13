"use client";

import { useState, useEffect } from "react";
import { useKanbanStore } from "@/lib/store";
import { COLUMNS, Status, getDisplayId } from "@/lib/types";
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
import { X, ChevronRight } from "lucide-react";

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
  const { selectedCard, closeModal, updateCard, deleteCard, projects } =
    useKanbanStore();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [solutionSummary, setSolutionSummary] = useState("");
  const [testScenarios, setTestScenarios] = useState("");
  const [status, setStatus] = useState<Status>("ideation");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Collapsible states
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [testsOpen, setTestsOpen] = useState(false);

  // Get project and displayId
  const project = projects.find((p) => p.id === projectId);
  const displayId = selectedCard ? getDisplayId(selectedCard, project) : null;

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
      setStatus(selectedCard.status);
      setProjectId(selectedCard.projectId);
    }
  }, [selectedCard]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => closeModal(), 200);
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
        status,
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
    e.stopPropagation();
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
        className={`bg-surface border-l border-border w-full max-w-[700px] h-full flex flex-col shadow-2xl transition-transform duration-200 ease-out ${
          isVisible ? "translate-x-0" : "translate-x-full"
        }`}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
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
                Project
              </label>
              <Select
                value={projectId || "none"}
                onValueChange={(v) => setProjectId(v === "none" ? null : v)}
              >
                <SelectTrigger className="w-full">
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
                      "No project"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
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
            </div>
          </div>

          {/* Detail */}
          <Collapsible open={descriptionOpen} onOpenChange={setDescriptionOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronIcon isOpen={descriptionOpen} />
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
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Solution Summary */}
          <Collapsible open={solutionOpen} onOpenChange={setSolutionOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronIcon isOpen={solutionOpen} />
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
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Test Scenarios */}
          <Collapsible open={testsOpen} onOpenChange={setTestsOpen}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ChevronIcon isOpen={testsOpen} />
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
            <Button onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
