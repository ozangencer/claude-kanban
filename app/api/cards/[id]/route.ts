import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { Card } from "@/lib/types";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const existing = db
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.id, id))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  const updatedCard = {
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    solutionSummary: body.solutionSummary ?? existing.solutionSummary,
    testScenarios: body.testScenarios ?? existing.testScenarios,
    status: body.status ?? existing.status,
    projectFolder: body.projectFolder ?? existing.projectFolder,
    projectId: body.projectId !== undefined ? body.projectId : existing.projectId,
    updatedAt: new Date().toISOString(),
  };

  db.update(schema.cards)
    .set(updatedCard)
    .where(eq(schema.cards.id, id))
    .run();

  const result: Card = {
    id: existing.id,
    title: updatedCard.title,
    description: updatedCard.description,
    solutionSummary: updatedCard.solutionSummary,
    testScenarios: updatedCard.testScenarios,
    status: updatedCard.status as Card["status"],
    projectFolder: updatedCard.projectFolder,
    projectId: updatedCard.projectId,
    taskNumber: existing.taskNumber,
    createdAt: existing.createdAt,
    updatedAt: updatedCard.updatedAt,
  };

  return NextResponse.json(result);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = db
    .select()
    .from(schema.cards)
    .where(eq(schema.cards.id, id))
    .get();

  if (!existing) {
    return NextResponse.json({ error: "Card not found" }, { status: 404 });
  }

  db.delete(schema.cards).where(eq(schema.cards.id, id)).run();

  return NextResponse.json({ success: true });
}
