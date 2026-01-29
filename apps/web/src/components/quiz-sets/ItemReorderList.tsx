"use client";

import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import type { QuizSetItem } from "@mcqs/shared";
import { SUBJECT_LABELS, QUESTION_STYLE_LABELS } from "@mcqs/shared";

interface ItemReorderListProps {
  items: QuizSetItem[];
  onReorder: (newOrder: string[]) => void;
  onEdit: (item: QuizSetItem) => void;
  onDelete: (itemId: string) => void;
  disabled?: boolean;
}

export function ItemReorderList({
  items,
  onReorder,
  onEdit,
  onDelete,
  disabled = false,
}: ItemReorderListProps) {
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || disabled) return;

    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);

    onReorder(newItems.map((item) => item.id));
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="quiz-items" isDropDisabled={disabled}>
        {(provided, snapshot) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            className={`space-y-2 ${snapshot.isDraggingOver ? "bg-gray-50 rounded-lg p-2 -m-2" : ""}`}
          >
            {items.map((item, index) => (
              <Draggable
                key={item.id}
                draggableId={item.id}
                index={index}
                isDragDisabled={disabled}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={`flex items-start justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 ${
                      snapshot.isDragging ? "shadow-lg bg-white" : ""
                    }`}
                  >
                    {/* Drag Handle */}
                    <div
                      {...provided.dragHandleProps}
                      className="mr-2 mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
                      </svg>
                    </div>

                    {/* Item Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-medium">
                          {index + 1}.
                        </span>
                        <span className="font-medium text-gray-900">
                          {SUBJECT_LABELS[item.subject as keyof typeof SUBJECT_LABELS]}
                        </span>
                        {item.theme && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-sm text-gray-500 truncate">
                              {item.theme}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {item.questionCount} questions
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 truncate">
                        {item.styles.map((s) => QUESTION_STYLE_LABELS[s as keyof typeof QUESTION_STYLE_LABELS]).join(" · ")}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => onEdit(item)}
                        className="p-1.5 text-gray-400 hover:text-primary-500 transition-colors"
                        title="Edit"
                        disabled={disabled}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => onDelete(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                        disabled={disabled}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
