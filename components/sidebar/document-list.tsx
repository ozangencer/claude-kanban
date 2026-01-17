"use client";

import { useState } from "react";
import { useKanbanStore } from "@/lib/store";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FileText, File, ChevronRight, FolderOpen, Folder } from "lucide-react";

export function DocumentList() {
  const { documents, openDocument, selectedDocument } = useKanbanStore();
  const [isOpen, setIsOpen] = useState(true);
  const [isDocsOpen, setIsDocsOpen] = useState(true);
  const [isNotesOpen, setIsNotesOpen] = useState(true);

  // Group files by location
  const claudeMd = documents.find((d) => d.isClaudeMd);
  const rootMdFiles = documents.filter(
    (d) => !d.isClaudeMd && !d.relativePath.includes("/")
  );
  const docsFiles = documents.filter((d) => d.relativePath.startsWith("docs/"));
  const notesFiles = documents.filter((d) => d.relativePath.startsWith("notes/"));

  // Extract just the filename from relativePath (e.g., "docs/product-narrative.md" -> "product-narrative.md")
  const getFileName = (relativePath: string) => {
    const parts = relativePath.split("/");
    return parts[parts.length - 1];
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="px-2 relative z-0">
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
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium truncate">CLAUDE.md</span>
              </button>
            )}

            {/* Other root .md files */}
            {rootMdFiles.map((doc) => (
              <button
                key={doc.path}
                onClick={() => openDocument(doc)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                  selectedDocument?.path === doc.path
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <File className="h-3.5 w-3.5 shrink-0" />
                <span className="break-all">{doc.name}</span>
              </button>
            ))}

            {/* docs/ folder */}
            {docsFiles.length > 0 && (
              <Collapsible open={isDocsOpen} onOpenChange={setIsDocsOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <ChevronRight
                    className={`h-3 w-3 transition-transform duration-200 ${
                      isDocsOpen ? "rotate-90" : ""
                    }`}
                  />
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span>docs</span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded ml-auto">
                    {docsFiles.length}
                  </span>
                </CollapsibleTrigger>

                <CollapsibleContent className="ml-4 space-y-0.5">
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
                      <File className="h-3.5 w-3.5 shrink-0" />
                      <span className="break-all">{getFileName(doc.relativePath)}</span>
                    </button>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* notes/ folder */}
            {notesFiles.length > 0 && (
              <Collapsible open={isNotesOpen} onOpenChange={setIsNotesOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                  <ChevronRight
                    className={`h-3 w-3 transition-transform duration-200 ${
                      isNotesOpen ? "rotate-90" : ""
                    }`}
                  />
                  <Folder className="h-3.5 w-3.5 shrink-0" />
                  <span>notes</span>
                  <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded ml-auto">
                    {notesFiles.length}
                  </span>
                </CollapsibleTrigger>

                <CollapsibleContent className="ml-4 space-y-0.5">
                  {notesFiles.map((doc) => (
                    <button
                      key={doc.path}
                      onClick={() => openDocument(doc)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2 ${
                        selectedDocument?.path === doc.path
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <File className="h-3.5 w-3.5 shrink-0" />
                      <span className="break-all">{getFileName(doc.relativePath)}</span>
                    </button>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
