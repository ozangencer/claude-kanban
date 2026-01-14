import { useEffect } from "react";
import { useKanbanStore } from "./store";

export function useKeyboardShortcuts() {
  const {
    addCardAndOpen,
    isModalOpen,
    closeModal,
    toggleSidebar,
    activeProjectId,
    projects,
  } = useKanbanStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      // Esc - Close modal (handled in card-modal.tsx, but also here as fallback)
      if (e.key === "Escape" && isModalOpen) {
        closeModal();
        return;
      }

      // [ or ] - Toggle sidebar
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // N - New card in backlog and open panel
      if (e.key === "n" || e.key === "N") {
        if (!isModalOpen) {
          e.preventDefault();
          const activeProject = projects.find((p) => p.id === activeProjectId);
          addCardAndOpen({
            title: "New Task",
            description: "",
            solutionSummary: "",
            testScenarios: "",
            aiOpinion: "",
            status: "backlog",
            complexity: "medium",
            priority: "medium",
            projectFolder: activeProject?.folderPath || "",
            projectId: activeProjectId,
          });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addCardAndOpen, isModalOpen, closeModal, toggleSidebar, activeProjectId, projects]);
}
