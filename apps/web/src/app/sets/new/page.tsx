"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardTitle, CardDescription, Input, Button } from "@/components/ui";
import { QuizItemForm } from "@/components/quiz-sets/QuizItemForm";
import { createQuizSet } from "@/lib/api";
import type { QuizSetItemConfig } from "@mcqs/shared";
import { SUBJECT_LABELS, DIFFICULTY_LABELS } from "@mcqs/shared";

interface DraftItem extends QuizSetItemConfig {
  tempId: string;
}

export default function NewQuizSetPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<DraftItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddItem = (config: QuizSetItemConfig) => {
    if (editingItem) {
      // Update existing item
      setItems(items.map((item) =>
        item.tempId === editingItem.tempId
          ? { ...config, tempId: item.tempId }
          : item
      ));
      setEditingItem(null);
    } else {
      // Add new item
      setItems([...items, { ...config, tempId: crypto.randomUUID() }]);
    }
    setShowItemForm(false);
  };

  const handleEditItem = (item: DraftItem) => {
    setEditingItem(item);
    setShowItemForm(true);
  };

  const handleDeleteItem = (tempId: string) => {
    setItems(items.filter((item) => item.tempId !== tempId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setLoading(true);

    try {
      const result = await createQuizSet({
        name: name.trim(),
        description: description.trim() || undefined,
        items: items.map(({ tempId: _tempId, ...config }) => config),
      });
      router.push(`/sets/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create quiz set");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Card>
        <CardTitle>Create New Quiz Set</CardTitle>
        <CardDescription>
          Create a collection of quizzes that can be generated together or scheduled
        </CardDescription>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Set Name */}
          <Input
            id="name"
            label="Set Name"
            placeholder="e.g., Daily UPSC Practice, Weekly Geography"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          {/* Description */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="description"
              placeholder="Describe this quiz set..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            />
          </div>

          {/* Items Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Quiz Configurations
              </label>
              <span className="text-xs text-gray-500">
                {items.length} quiz{items.length !== 1 ? "zes" : ""}
              </span>
            </div>

            {/* Item List */}
            {items.length > 0 && (
              <div className="space-y-2 mb-4">
                {items.map((item, index) => (
                  <div
                    key={item.tempId}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
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
                        {DIFFICULTY_LABELS[item.difficulty as keyof typeof DIFFICULTY_LABELS]} · {item.questionCount} questions
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        type="button"
                        onClick={() => handleEditItem(item)}
                        className="p-1.5 text-gray-400 hover:text-primary-500 transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.tempId)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Item Button / Form */}
            {showItemForm ? (
              <div className="p-4 border border-gray-200 rounded-lg bg-white">
                <h4 className="font-medium text-gray-900 mb-4">
                  {editingItem ? "Edit Quiz Configuration" : "Add Quiz Configuration"}
                </h4>
                <QuizItemForm
                  initialValues={editingItem || undefined}
                  onSubmit={handleAddItem}
                  onCancel={() => {
                    setShowItemForm(false);
                    setEditingItem(null);
                  }}
                  submitLabel={editingItem ? "Update Quiz" : "Add Quiz"}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowItemForm(true)}
                className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-500 hover:text-primary-500 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Quiz Configuration
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" loading={loading} className="flex-1">
              {loading ? "Creating..." : "Create Quiz Set"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
