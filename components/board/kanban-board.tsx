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
import { COLUMNS, Card, Status } from "@/lib/types";
import { Column } from "./column";
import { TaskCard } from "./card";

export function KanbanBoard() {
  const { cards, activeProjectId, searchQuery, moveCard } = useKanbanStore();
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
        {COLUMNS.map((column) => (
          <Column
            key={column.id}
            id={column.id}
            title={column.title}
            cards={filteredCards.filter((card) => card.status === column.id)}
          />
        ))}
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
