"use client";

import { useState } from "react";
import { useKanbanStore } from "@/lib/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Folder } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface AddProjectModalProps {
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

export function AddProjectModal({ onClose }: AddProjectModalProps) {
  const { addProject, setActiveProject } = useKanbanStore();
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [idPrefix, setIdPrefix] = useState("");
  const [color, setColor] = useState("#5e6ad2");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

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

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-generate prefix from name if not manually set
    if (!idPrefix || idPrefix === name.replace(/[^a-zA-Z0-9]/g, "").substring(0, 3).toUpperCase()) {
      setIdPrefix(value.replace(/[^a-zA-Z0-9]/g, "").substring(0, 3).toUpperCase());
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !folderPath.trim()) return;

    setIsSubmitting(true);
    try {
      await addProject({
        name: name.trim(),
        folderPath: folderPath.trim(),
        idPrefix: idPrefix.trim() || name.replace(/[^a-zA-Z0-9]/g, "").substring(0, 3).toUpperCase(),
        color,
        isPinned: false,
      });
      onClose();
    } catch (error) {
      console.error("Failed to add project:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Project</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Project Name */}
          <div className="grid gap-2">
            <label htmlFor="name" className="text-sm font-medium">
              Project Name
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="My Project"
              autoFocus
            />
          </div>

          {/* Folder Path */}
          <div className="grid gap-2">
            <label htmlFor="folderPath" className="text-sm font-medium">
              Folder Path
            </label>
            <div className="flex gap-2">
              <Input
                id="folderPath"
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
              <label htmlFor="idPrefix" className="text-sm font-medium">
                ID Prefix
              </label>
              <Input
                id="idPrefix"
                value={idPrefix}
                onChange={(e) => setIdPrefix(e.target.value.toUpperCase().slice(0, 5))}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || !folderPath.trim() || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
