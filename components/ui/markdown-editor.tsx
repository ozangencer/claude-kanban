"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { useEffect, useRef, useMemo } from "react";
import { useKanbanStore } from "@/lib/store";
import { SkillMention, McpMention } from "@/lib/mention-extension";
import { createSuggestion } from "@/lib/suggestion";

interface MarkdownEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write here...",
  minHeight = "80px",
}: MarkdownEditorProps) {
  const isUpdatingFromExternal = useRef(false);
  const lastSyncedValue = useRef<string | null>(null);
  const { skills, mcps } = useKanbanStore();

  const skillSuggestion = useMemo(
    () => createSuggestion({ char: "/", items: skills, prefix: "/", nodeType: "skillMention" }),
    [skills]
  );

  const mcpSuggestion = useMemo(
    () => createSuggestion({ char: "@", items: mcps, prefix: "@", nodeType: "mcpMention" }),
    [mcps]
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
      SkillMention.configure({
        suggestion: skillSuggestion,
      }),
      McpMention.configure({
        suggestion: mcpSuggestion,
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose-kanban",
      },
    },
    onUpdate: ({ editor }) => {
      if (isUpdatingFromExternal.current) return;

      const html = editor.getHTML();
      lastSyncedValue.current = html;
      onChange(html);
    },
  });

  // Sync value to editor
  useEffect(() => {
    if (!editor) return;
    if (value === lastSyncedValue.current) return;

    isUpdatingFromExternal.current = true;
    editor.commands.setContent(value || "");
    lastSyncedValue.current = value;
    isUpdatingFromExternal.current = false;
  }, [value, editor]);

  return (
    <div className="tiptap-editor" style={{ minHeight }}>
      <EditorContent editor={editor} />
    </div>
  );
}
