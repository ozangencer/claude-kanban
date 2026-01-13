"use client";

import { useEffect, useState } from "react";
import { useKanbanStore } from "@/lib/store";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight, Zap, Check } from "lucide-react";

export function SkillList() {
  const { skills, fetchSkills } = useKanbanStore();
  const [copiedSkill, setCopiedSkill] = useState<string | null>(null);

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const copyToClipboard = (skill: string) => {
    navigator.clipboard.writeText(`/${skill}`);
    setCopiedSkill(skill);
    setTimeout(() => setCopiedSkill(null), 1500);
  };

  if (skills.length === 0) return null;

  return (
    <Collapsible defaultOpen={false} className="px-2 mt-4">
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground uppercase tracking-wider font-medium hover:text-foreground transition-colors group">
        <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
        <Zap className="h-3 w-3" />
        <span>Skills</span>
        <span className="ml-auto text-[10px] opacity-60">{skills.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 space-y-0.5">
        {skills.map((skill) => (
          <button
            key={skill}
            onClick={() => copyToClipboard(skill)}
            className="w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2"
            title="Click to copy"
          >
            {copiedSkill === skill ? (
              <>
                <Check className="h-3 w-3 text-green-500" />
                <span className="text-green-500 text-xs">Copied!</span>
              </>
            ) : (
              <>
                <span className="text-primary/70 font-mono text-xs">/</span>
                <span className="truncate">{skill}</span>
              </>
            )}
          </button>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
