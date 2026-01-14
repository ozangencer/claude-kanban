"use client";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import { useState } from "react";
import { useKanbanStore } from "@/lib/store";
import { COLUMNS, Card, Status, Priority, Complexity, CompletedRetention } from "@/lib/types";

// Priority order: high > medium > low (descending)
const PRIORITY_ORDER: Record<Priority, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

// Complexity order: low > medium > high (ascending)
const COMPLEXITY_ORDER: Record<Complexity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

// Filter completed cards by retention setting
function filterByRetention(cards: Card[], retention: CompletedRetention): Card[] {
  if (retention === 'all') return cards;

  const now = new Date();
  const cutoff = new Date();

  switch (retention) {
    case 'week':
      cutoff.setDate(now.getDate() - 7);
      break;
    case '2weeks':
      cutoff.setDate(now.getDate() - 14);
      break;
    case 'month':
      cutoff.setMonth(now.getMonth() - 1);
      break;
    case '3months':
      cutoff.setMonth(now.getMonth() - 3);
      break;
  }

  return cards.filter(card => {
    // Use completedAt if available, otherwise fall back to updatedAt for legacy cards
    const dateToCheck = card.completedAt || card.updatedAt;
    return new Date(dateToCheck) >= cutoff;
  });
}

// Sort cards by priority (desc) then complexity (asc)
function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    // Primary: Priority descending (urgent first)
    const priorityDiff =
      (PRIORITY_ORDER[b.priority] || 2) - (PRIORITY_ORDER[a.priority] || 2);
    if (priorityDiff !== 0) return priorityDiff;

    // Secondary: Complexity ascending (low first)
    return (
      (COMPLEXITY_ORDER[a.complexity] || 2) - (COMPLEXITY_ORDER[b.complexity] || 2)
    );
  });
}
import { Column } from "./column";
import { TaskCard } from "./card";

export function KanbanBoard() {
  const { cards, activeProjectId, searchQuery, moveCard, completedRetention } = useKanbanStore();
  const [activeCard, setActiveCard] = useState<Card | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  const filteredCards = cards.filter((card) => {
    // Filter by active project
    const matchesProject = !activeProjectId || card.projectId === activeProjectId;
    // Filter by search query
    const matchesSearch =
      !searchQuery ||
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesProject && matchesSearch;
  });

  const handleDragStart = (event: DragStartEvent) => {
    const card = cards.find((c) => c.id === event.active.id);
    if (card) setActiveCard(card);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const cardId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a column
    if (COLUMNS.some((col) => col.id === overId)) {
      moveCard(cardId, overId as Status);
      return;
    }

    // Check if dropped on another card - move to that card's column
    const overCard = cards.find((c) => c.id === overId);
    if (overCard) {
      moveCard(cardId, overCard.status);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 p-6 overflow-x-auto min-h-[calc(100vh-80px)]">
        {COLUMNS.map((column) => {
          let columnCards = filteredCards.filter((card) => card.status === column.id);
          // Apply retention filter only to completed column
          if (column.id === 'completed') {
            columnCards = filterByRetention(columnCards, completedRetention);
          }
          return (
            <Column
              key={column.id}
              id={column.id}
              title={column.title}
              cards={sortCards(columnCards)}
            />
          );
        })}
      </div>
      <DragOverlay
        dropAnimation={{
          duration: 200,
          easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
        }}
      >
        {activeCard && (
          <div className="w-[272px]">
            <TaskCard card={activeCard} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
