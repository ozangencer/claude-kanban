"use client";

import { useState, useEffect } from "react";
import { useKanbanStore } from "@/lib/store";
import { Project } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Folder, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface EditProjectModalProps {
  project: Project;
  onClose: () => void;
}

const PRESET_COLORS = [
  "#5e6ad2", // Linear blue (default)
  "#ef4444", // Red
  "#f97316", // Orange
  "#eab308", // Yellow
  "#22c55e", // Green
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#6b7280", // Gray
];

export function EditProjectModal({ project, onClose }: EditProjectModalProps) {
  const { updateProject, deleteProject, cards } = useKanbanStore();

  // Form state initialized from project
  const [name, setName] = useState(project.name);
  const [folderPath, setFolderPath] = useState(project.folderPath);
  const [idPrefix, setIdPrefix] = useState(project.idPrefix);
  const [color, setColor] = useState(project.color);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [hookInstalled, setHookInstalled] = useState<boolean | null>(null);
  const [isTogglingHook, setIsTogglingHook] = useState(false);

  // Check hook status on mount
  useEffect(() => {
    const checkHookStatus = async () => {
      try {
        const response = await fetch(`/api/projects/${project.id}/hook`);
        const data = await response.json();
        setHookInstalled(data.installed ?? false);
      } catch (error) {
        console.error("Failed to check hook status:", error);
        setHookInstalled(false);
      }
    };
    checkHookStatus();
  }, [project.id]);

  const handleToggleHook = async (enabled: boolean) => {
    setIsTogglingHook(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/hook`, {
        method: enabled ? "POST" : "DELETE",
      });
      const data = await response.json();
      if (response.ok) {
        setHookInstalled(data.installed);
      }
    } catch (error) {
      console.error("Failed to toggle hook:", error);
    } finally {
      setIsTogglingHook(false);
    }
  };

  const handleFolderPick = async () => {
    setIsPickingFolder(true);
    try {
      const response = await fetch("/api/folder-picker");
      const data = await response.json();
      if (data.path) {
        setFolderPath(data.path);
      }
    } catch (error) {
      console.error("Failed to pick folder:", error);
    } finally {
      setIsPickingFolder(false);
    }
  };

  // Count cards linked to this project
  const linkedCardCount = cards.filter((c) => c.projectId === project.id).length;

  const handleSubmit = async () => {
    if (!name.trim() || !folderPath.trim()) return;

    setIsSubmitting(true);
    try {
      await updateProject(project.id, {
        name: name.trim(),
        folderPath: folderPath.trim(),
        idPrefix: idPrefix.trim() || project.idPrefix,
        color,
      });
      onClose();
    } catch (error) {
      console.error("Failed to update project:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteProject(project.id);
      onClose();
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Project Name */}
          <div className="grid gap-2">
            <label htmlFor="edit-name" className="text-sm font-medium">
              Project Name
            </label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              autoFocus
            />
          </div>

          {/* Folder Path */}
          <div className="grid gap-2">
            <label htmlFor="edit-folderPath" className="text-sm font-medium">
              Folder Path
            </label>
            <div className="flex gap-2">
              <Input
                id="edit-folderPath"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/Users/username/projects/my-project"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleFolderPick}
                disabled={isPickingFolder}
                title="Browse folders"
              >
                <Folder className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Full path to the project directory
            </p>
          </div>

          {/* ID Prefix and Color */}
          <div className="grid grid-cols-2 gap-4">
            {/* ID Prefix */}
            <div className="grid gap-2">
              <label htmlFor="edit-idPrefix" className="text-sm font-medium">
                ID Prefix
              </label>
              <Input
                id="edit-idPrefix"
                value={idPrefix}
                onChange={(e) =>
                  setIdPrefix(e.target.value.toUpperCase().slice(0, 5))
                }
                placeholder="PRJ"
                maxLength={5}
              />
            </div>

            {/* Color */}
            <div className="grid gap-2">
              <label className="text-sm font-medium">Color</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 h-10"
                  >
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-muted-foreground text-xs font-mono">
                      {color}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2">
                  <div className="grid grid-cols-5 gap-2">
                    {PRESET_COLORS.map((presetColor) => (
                      <button
                        key={presetColor}
                        className={`w-7 h-7 rounded-md transition-all ${
                          color === presetColor
                            ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                            : "hover:scale-110"
                        }`}
                        style={{ backgroundColor: presetColor }}
                        onClick={() => setColor(presetColor)}
                      />
                    ))}
                  </div>
                  {/* Custom color input */}
                  <div className="mt-2 pt-2 border-t">
                    <Input
                      type="text"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      placeholder="#000000"
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Task IDs: {idPrefix || "PRJ"}-1, {idPrefix || "PRJ"}-2...
          </p>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Claude Code Hook */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Kanban Hook</label>
              <p className="text-xs text-muted-foreground">
                ExitPlanMode sonrası plan kaydetme hatırlatıcısı
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isTogglingHook && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <Switch
                checked={hookInstalled ?? false}
                onCheckedChange={handleToggleHook}
                disabled={isTogglingHook || hookInstalled === null}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {/* Delete button with confirmation */}
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
                <AlertDialogTitle>Delete project?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the
                  project &quot;{project.name}&quot;.
                  {linkedCardCount > 0 && (
                    <span className="block mt-2">
                      {linkedCardCount} task{linkedCardCount > 1 ? "s" : ""} will
                      be unlinked from this project but not deleted.
                    </span>
                  )}
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

          {/* Save/Cancel buttons */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!name.trim() || !folderPath.trim() || isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
