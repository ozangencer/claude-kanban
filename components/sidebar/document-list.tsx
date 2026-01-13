"use client";

import { useState } from "react";
import { useKanbanStore } from "@/lib/store";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FileText, File, ChevronRight, FolderOpen } from "lucide-react";

export function DocumentList() {
  const { documents, openDocument, selectedDocument } = useKanbanStore();
  const [isOpen, setIsOpen] = useState(true);

  // Group: CLAUDE.md first, then docs/
  const claudeMd = documents.find((d) => d.isClaudeMd);
  const docsFiles = documents.filter((d) => !d.isClaudeMd);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="px-2">
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-2 py-2 text-xs text-muted-foreground uppercase tracking-wider font-medium hover:text-foreground transition-colors">
        <ChevronRight
          className={`h-3 w-3 transition-transform duration-200 ${
            isOpen ? "rotate-90" : ""
          }`}
        />
        <FolderOpen className="h-3.5 w-3.5" />
        <span>Documents</span>
        {documents.length > 0 && (
          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded normal-case">
            {documents.length}
          </span>
        )}
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-1 space-y-0.5">
        {documents.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-2">
            No documents found
          </p>
        ) : (
          <>
            {/* CLAUDE.md */}
            {claudeMd && (
              <button
                onClick={() => openDocument(claudeMd)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                  selectedDocument?.path === claudeMd.path
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">CLAUDE.md</span>
              </button>
            )}

            {/* docs/ files */}
            {docsFiles.map((doc) => (
              <button
                key={doc.path}
                onClick={() => openDocument(doc)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                  selectedDocument?.path === doc.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <File className="h-4 w-4 shrink-0" />
                <span className="truncate">{doc.relativePath}</span>
              </button>
            ))}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
