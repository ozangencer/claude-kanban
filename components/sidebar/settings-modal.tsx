"use client";

import { useState, useEffect } from "react";
import { useKanbanStore } from "@/lib/store";
import { TERMINAL_OPTIONS, DEFAULT_SETTINGS } from "@/lib/types";
import type { TerminalApp } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Folder, RefreshCw, Check, AlertCircle } from "lucide-react";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings, fetchSettings } = useKanbanStore();
  const [skillsPath, setSkillsPath] = useState(DEFAULT_SETTINGS.skillsPath);
  const [mcpConfigPath, setMcpConfigPath] = useState(DEFAULT_SETTINGS.mcpConfigPath);
  const [terminalApp, setTerminalApp] = useState<TerminalApp>(DEFAULT_SETTINGS.terminalApp);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPickingSkillsFolder, setIsPickingSkillsFolder] = useState(false);
  const [isPickingMcpFile, setIsPickingMcpFile] = useState(false);
  const [isReinstallingHooks, setIsReinstallingHooks] = useState(false);
  const [hookResult, setHookResult] = useState<{ success: number; failed: number } | null>(null);

  useEffect(() => {
    if (!settings) {
      fetchSettings();
    }
  }, [settings, fetchSettings]);

  useEffect(() => {
    if (settings) {
      setSkillsPath(settings.skillsPath);
      setMcpConfigPath(settings.mcpConfigPath);
      setTerminalApp(settings.terminalApp);
    }
  }, [settings]);

  const handleFolderPick = async (type: "skills" | "mcp") => {
    if (type === "skills") {
      setIsPickingSkillsFolder(true);
    } else {
      setIsPickingMcpFile(true);
    }

    try {
      const response = await fetch("/api/folder-picker");
      const data = await response.json();
      if (data.path) {
        if (type === "skills") {
          setSkillsPath(data.path);
        } else {
          setMcpConfigPath(data.path);
        }
      }
    } catch (error) {
      console.error("Failed to pick folder:", error);
    } finally {
      if (type === "skills") {
        setIsPickingSkillsFolder(false);
      } else {
        setIsPickingMcpFile(false);
      }
    }
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await updateSettings({
        skillsPath,
        mcpConfigPath,
        terminalApp,
      });
      onClose();
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReinstallHooks = async () => {
    setIsReinstallingHooks(true);
    setHookResult(null);
    try {
      const response = await fetch("/api/projects/reinstall-hooks", {
        method: "POST",
      });
      const data = await response.json();
      const results = data.results || [];
      setHookResult({
        success: results.filter((r: { success: boolean }) => r.success).length,
        failed: results.filter((r: { success: boolean }) => !r.success).length,
      });
    } catch (error) {
      console.error("Failed to reinstall hooks:", error);
      setHookResult({ success: 0, failed: -1 });
    } finally {
      setIsReinstallingHooks(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          {/* Skills Path */}
          <div className="grid gap-2">
            <label htmlFor="skillsPath" className="text-sm font-medium">
              Skills Directory
            </label>
            <div className="flex gap-2">
              <Input
                id="skillsPath"
                value={skillsPath}
                onChange={(e) => setSkillsPath(e.target.value)}
                placeholder="~/.claude/skills"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleFolderPick("skills")}
                disabled={isPickingSkillsFolder}
                title="Browse folders"
              >
                <Folder className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Path to Claude Code skills directory
            </p>
          </div>

          {/* MCP Config Path */}
          <div className="grid gap-2">
            <label htmlFor="mcpConfigPath" className="text-sm font-medium">
              MCP Configuration File
            </label>
            <div className="flex gap-2">
              <Input
                id="mcpConfigPath"
                value={mcpConfigPath}
                onChange={(e) => setMcpConfigPath(e.target.value)}
                placeholder="~/.claude.json"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleFolderPick("mcp")}
                disabled={isPickingMcpFile}
                title="Browse files"
              >
                <Folder className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Path to Claude MCP configuration JSON file
            </p>
          </div>

          {/* Terminal App Selection */}
          <div className="grid gap-2">
            <label htmlFor="terminalApp" className="text-sm font-medium">
              Terminal Application
            </label>
            <Select
              value={terminalApp}
              onValueChange={(value) => setTerminalApp(value as TerminalApp)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select terminal" />
              </SelectTrigger>
              <SelectContent>
                {TERMINAL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {terminalApp === "ghostty"
                ? "Ghostty will open and command will be copied to clipboard"
                : "Terminal to use for opening Claude Code sessions"}
            </p>
          </div>

          {/* Divider */}
          <div className="border-t border-border" />

          {/* Claude Code Hooks */}
          <div className="grid gap-2">
            <label className="text-sm font-medium">Claude Code Hooks</label>
            <p className="text-xs text-muted-foreground mb-2">
              ExitPlanMode sonrası kanban kartına plan kaydetme hatırlatıcısı kurar
            </p>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleReinstallHooks}
                disabled={isReinstallingHooks}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isReinstallingHooks ? "animate-spin" : ""}`} />
                {isReinstallingHooks ? "Kuruluyor..." : "Hook'ları Kur"}
              </Button>
              {hookResult && (
                <div className="flex items-center gap-2 text-sm">
                  {hookResult.failed === -1 ? (
                    <span className="text-destructive flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      Hata oluştu
                    </span>
                  ) : (
                    <>
                      <span className="text-green-500 flex items-center gap-1">
                        <Check className="h-4 w-4" />
                        {hookResult.success} başarılı
                      </span>
                      {hookResult.failed > 0 && (
                        <span className="text-destructive flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" />
                          {hookResult.failed} başarısız
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
