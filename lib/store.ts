import { create } from "zustand";
import { Card, Status, Project, DocumentFile, AppSettings } from "./types";

interface KanbanStore {
  // Cards state
  cards: Card[];
  selectedCard: Card | null;
  isModalOpen: boolean;
  searchQuery: string;
  isLoading: boolean;

  // Projects state
  projects: Project[];
  activeProjectId: string | null;
  isProjectsLoading: boolean;

  // Documents state
  documents: DocumentFile[];
  selectedDocument: DocumentFile | null;
  documentContent: string;
  isDocumentEditorOpen: boolean;

  // Sidebar state
  isSidebarCollapsed: boolean;

  // Skills & MCPs state
  skills: string[];
  mcps: string[];

  // Claude integration state
  startingCardId: string | null;

  // Settings state
  settings: AppSettings | null;
  isSettingsLoading: boolean;

  // Card actions
  fetchCards: () => Promise<void>;
  setCards: (cards: Card[]) => void;
  addCard: (
    card: Omit<Card, "id" | "createdAt" | "updatedAt" | "taskNumber">
  ) => Promise<void>;
  addCardAndOpen: (
    card: Omit<Card, "id" | "createdAt" | "updatedAt" | "taskNumber">
  ) => Promise<void>;
  updateCard: (id: string, updates: Partial<Card>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  moveCard: (id: string, newStatus: Status) => Promise<void>;
  selectCard: (card: Card | null) => void;
  openModal: () => void;
  closeModal: () => void;
  setSearchQuery: (query: string) => void;

  // Project actions
  fetchProjects: () => Promise<void>;
  addProject: (
    project: Omit<Project, "id" | "createdAt" | "updatedAt" | "nextTaskNumber">
  ) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setActiveProject: (projectId: string | null) => void;
  toggleProjectPin: (id: string) => Promise<void>;

  // Document actions
  fetchDocuments: (projectId: string) => Promise<void>;
  openDocument: (doc: DocumentFile) => Promise<void>;
  saveDocument: () => Promise<void>;
  closeDocumentEditor: () => void;
  setDocumentContent: (content: string) => void;

  // Sidebar actions
  toggleSidebar: () => void;

  // Skills & MCPs actions
  fetchSkills: () => Promise<void>;
  fetchMcps: () => Promise<void>;

  // Claude integration actions
  startTask: (cardId: string) => Promise<{ success: boolean; error?: string }>;
  openTerminal: (cardId: string) => Promise<{ success: boolean; error?: string }>;

  // Settings actions
  fetchSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
}

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  // Initial state
  cards: [],
  selectedCard: null,
  isModalOpen: false,
  searchQuery: "",
  isLoading: false,

  // Projects initial state
  projects: [],
  activeProjectId: null,
  isProjectsLoading: false,

  // Documents initial state
  documents: [],
  selectedDocument: null,
  documentContent: "",
  isDocumentEditorOpen: false,

  // Sidebar initial state
  isSidebarCollapsed: false,

  // Skills & MCPs initial state
  skills: [],
  mcps: [],

  // Claude integration initial state
  startingCardId: null,

  // Settings initial state
  settings: null,
  isSettingsLoading: false,

  // Card actions
  fetchCards: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch("/api/cards");
      const cards = await response.json();
      set({ cards, isLoading: false });
    } catch (error) {
      console.error("Failed to fetch cards:", error);
      set({ isLoading: false });
    }
  },

  setCards: (cards) => set({ cards }),

  addCard: async (cardData) => {
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cardData),
      });
      const newCard = await response.json();
      set((state) => ({ cards: [...state.cards, newCard] }));
    } catch (error) {
      console.error("Failed to add card:", error);
    }
  },

  addCardAndOpen: async (cardData) => {
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cardData),
      });
      const newCard = await response.json();
      set((state) => ({
        cards: [...state.cards, newCard],
        selectedCard: newCard,
        isModalOpen: true,
      }));
    } catch (error) {
      console.error("Failed to add card:", error);
    }
  },

  updateCard: async (id, updates) => {
    // Optimistic update - update UI immediately
    const previousCards = get().cards;
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === id
          ? { ...card, ...updates, updatedAt: new Date().toISOString() }
          : card
      ),
    }));

    try {
      await fetch(`/api/cards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error("Failed to update card:", error);
      // Rollback on error
      set({ cards: previousCards });
    }
  },

  deleteCard: async (id) => {
    try {
      await fetch(`/api/cards/${id}`, { method: "DELETE" });
      set((state) => ({
        cards: state.cards.filter((card) => card.id !== id),
        selectedCard: state.selectedCard?.id === id ? null : state.selectedCard,
        isModalOpen: state.selectedCard?.id === id ? false : state.isModalOpen,
      }));
    } catch (error) {
      console.error("Failed to delete card:", error);
    }
  },

  moveCard: async (id, newStatus) => {
    const previousCards = get().cards;
    set((state) => ({
      cards: state.cards.map((card) =>
        card.id === id
          ? { ...card, status: newStatus, updatedAt: new Date().toISOString() }
          : card
      ),
    }));

    try {
      await fetch(`/api/cards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (error) {
      console.error("Failed to move card:", error);
      set({ cards: previousCards });
    }
  },

  selectCard: (card) => set({ selectedCard: card }),

  openModal: () => set({ isModalOpen: true }),

  closeModal: () => set({ isModalOpen: false, selectedCard: null }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  // Project actions
  fetchProjects: async () => {
    set({ isProjectsLoading: true });
    try {
      const response = await fetch("/api/projects");
      const projects = await response.json();
      set({ projects, isProjectsLoading: false });
    } catch (error) {
      console.error("Failed to fetch projects:", error);
      set({ isProjectsLoading: false });
    }
  },

  addProject: async (projectData) => {
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectData),
      });
      const newProject = await response.json();
      set((state) => ({
        projects: [...state.projects, newProject].sort((a, b) => {
          if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
          return a.name.localeCompare(b.name);
        }),
      }));
    } catch (error) {
      console.error("Failed to add project:", error);
    }
  },

  updateProject: async (id, updates) => {
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const updatedProject = await response.json();
      set((state) => ({
        projects: state.projects
          .map((p) => (p.id === id ? updatedProject : p))
          .sort((a, b) => {
            if (a.isPinned !== b.isPinned) return b.isPinned ? 1 : -1;
            return a.name.localeCompare(b.name);
          }),
      }));
    } catch (error) {
      console.error("Failed to update project:", error);
    }
  },

  deleteProject: async (id) => {
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      set((state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        activeProjectId:
          state.activeProjectId === id ? null : state.activeProjectId,
        documents: state.activeProjectId === id ? [] : state.documents,
      }));
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  },

  setActiveProject: (projectId) => {
    set({
      activeProjectId: projectId,
      documents: [],
      selectedDocument: null,
      documentContent: "",
      isDocumentEditorOpen: false,
    });
    if (projectId) {
      get().fetchDocuments(projectId);
    }
  },

  toggleProjectPin: async (id) => {
    const project = get().projects.find((p) => p.id === id);
    if (project) {
      await get().updateProject(id, { isPinned: !project.isPinned });
    }
  },

  // Document actions
  fetchDocuments: async (projectId) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/documents`);
      const documents = await response.json();
      set({ documents: Array.isArray(documents) ? documents : [] });
    } catch (error) {
      console.error("Failed to fetch documents:", error);
      set({ documents: [] });
    }
  },

  openDocument: async (doc) => {
    try {
      const response = await fetch(
        `/api/documents?path=${encodeURIComponent(doc.path)}`
      );
      const data = await response.json();
      set({
        selectedDocument: doc,
        documentContent: data.content || "",
        isDocumentEditorOpen: true,
      });
    } catch (error) {
      console.error("Failed to open document:", error);
    }
  },

  saveDocument: async () => {
    const { selectedDocument, documentContent } = get();
    if (!selectedDocument) return;

    try {
      await fetch(
        `/api/documents?path=${encodeURIComponent(selectedDocument.path)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: documentContent }),
        }
      );
    } catch (error) {
      console.error("Failed to save document:", error);
    }
  },

  closeDocumentEditor: () => {
    set({
      selectedDocument: null,
      documentContent: "",
      isDocumentEditorOpen: false,
    });
  },

  setDocumentContent: (content) => set({ documentContent: content }),

  // Sidebar actions
  toggleSidebar: () =>
    set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  // Skills & MCPs actions
  fetchSkills: async () => {
    try {
      const response = await fetch("/api/skills");
      const data = await response.json();
      set({ skills: data.skills || [] });
    } catch (error) {
      console.error("Failed to fetch skills:", error);
    }
  },

  fetchMcps: async () => {
    try {
      const response = await fetch("/api/mcps");
      const data = await response.json();
      set({ mcps: data.mcps || [] });
    } catch (error) {
      console.error("Failed to fetch MCPs:", error);
    }
  },

  // Claude integration actions
  startTask: async (cardId) => {
    set({ startingCardId: cardId });

    try {
      const response = await fetch(`/api/cards/${cardId}/start`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        set({ startingCardId: null });
        return { success: false, error: data.error || "Failed to start task" };
      }

      // Update card in state with the new solution summary
      set((state) => ({
        cards: state.cards.map((card) =>
          card.id === cardId
            ? {
                ...card,
                solutionSummary: data.response,
                updatedAt: new Date().toISOString(),
              }
            : card
        ),
        startingCardId: null,
      }));

      return { success: true };
    } catch (error) {
      console.error("Failed to start task:", error);
      set({ startingCardId: null });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },

  openTerminal: async (cardId) => {
    try {
      const response = await fetch(`/api/cards/${cardId}/open-terminal`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || "Failed to open terminal" };
      }

      return { success: true, message: data.message };
    } catch (error) {
      console.error("Failed to open terminal:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },

  // Settings actions
  fetchSettings: async () => {
    set({ isSettingsLoading: true });
    try {
      const response = await fetch("/api/settings");
      const settings = await response.json();
      set({ settings, isSettingsLoading: false });
    } catch (error) {
      console.error("Failed to fetch settings:", error);
      set({ isSettingsLoading: false });
    }
  },

  updateSettings: async (updates) => {
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const settings = await response.json();
      set({ settings });

      // Refresh skills and MCPs if paths changed
      if (updates.skillsPath) {
        get().fetchSkills();
      }
      if (updates.mcpConfigPath) {
        get().fetchMcps();
      }
    } catch (error) {
      console.error("Failed to update settings:", error);
    }
  },
}));
