"use client";

import { useState } from "react";
import { useKanbanStore } from "@/lib/store";
import { ProjectList } from "./project-list";
import { SkillList } from "./skill-list";
import { McpList } from "./mcp-list";
import { DocumentList } from "./document-list";
import { SettingsModal } from "./settings-modal";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, FolderKanban, Settings } from "lucide-react";

export function Sidebar() {
  const { isSidebarCollapsed, toggleSidebar, activeProjectId } =
    useKanbanStore();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  if (isSidebarCollapsed) {
    return (
      <TooltipProvider>
        <div className="w-12 border-r border-border bg-card flex flex-col items-center py-4 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Expand sidebar</p>
            </TooltipContent>
          </Tooltip>

          <Separator className="my-3 w-6" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleSidebar}
              >
                <FolderKanban className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Projects</p>
            </TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsSettingsOpen(true)}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {isSettingsOpen && (
          <SettingsModal onClose={() => setIsSettingsOpen(false)} />
        )}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="w-64 border-r border-border bg-card flex flex-col h-full shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Projects</span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSettingsOpen(true)}
                  className="h-7 w-7"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Settings</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleSidebar}
                  className="h-7 w-7"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Collapse sidebar</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Project List - outside ScrollArea to avoid overflow issues */}
        <div className="py-2">
          <ProjectList />
        </div>

        {/* Scrollable Content */}
        <ScrollArea className="flex-1">
          <div className="py-2">
            {/* Skills Section */}
            <SkillList />

            {/* MCPs Section */}
            <McpList />

            {/* Documents Section - only show when project selected */}
            {activeProjectId && (
              <>
                <Separator className="my-3 mx-4" />
                <DocumentList />
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}
    </TooltipProvider>
  );
}
