"use client";

import { useState } from "react";
import type { Task, TaskQuestion, ApiError } from "@/lib/types";
import { useAuth } from "@/lib/hooks/use-auth";
import { useApi } from "@/lib/hooks/use-api";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/utils/format";
import { Spinner } from "@/components/ui/spinner";
import * as questionsApi from "@/lib/api/questions";

export function TaskQuestions({ task }: { task: Task }) {
  const { user } = useAuth();
  const { data, loading, refetch } = useApi(
    () => questionsApi.listQuestions(task.id),
    [task.id],
  );
  const [questionBody, setQuestionBody] = useState("");
  const [askError, setAskError] = useState("");
  const [asking, setAsking] = useState(false);

  const questions: TaskQuestion[] = data ?? [];
  const isRequester = user?.id === task.requester_id;
  const canAsk = !isRequester && task.status === "published" && !!user;

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    setAskError("");
    setAsking(true);
    try {
      await questionsApi.askQuestion(task.id, questionBody);
      setQuestionBody("");
      refetch();
    } catch (err) {
      setAskError((err as ApiError).error ?? "Failed to post question");
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Questions</h3>

      {loading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : questions.length === 0 ? (
        <p className="text-sm text-gray-500">No questions yet.</p>
      ) : (
        <ul className="space-y-4">
          {questions.map((q) => (
            <QuestionItem
              key={q.id}
              task={task}
              question={q}
              isRequester={isRequester}
              onAnswered={refetch}
            />
          ))}
        </ul>
      )}

      {canAsk && (
        <form onSubmit={handleAsk} className="space-y-2 pt-4 border-t border-gray-100">
          {askError && (
            <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-700">
              {askError}
            </div>
          )}
          <Textarea
            id="question_body"
            label="Ask a question"
            value={questionBody}
            onChange={(e) => setQuestionBody(e.target.value)}
            placeholder="Ask the requester for clarification before applying..."
            required
          />
          <Button type="submit" loading={asking} size="sm">
            Post question
          </Button>
        </form>
      )}
      {isRequester && task.status === "published" && (
        <p className="text-xs text-gray-500 pt-2 border-t border-gray-100">
          Doers can ask public questions here before applying. Replies appear
          to everyone.
        </p>
      )}
    </section>
  );
}

interface QuestionItemProps {
  task: Task;
  question: TaskQuestion;
  isRequester: boolean;
  onAnswered: () => void;
}

function QuestionItem({ task, question, isRequester, onAnswered }: QuestionItemProps) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function handleAnswer(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await questionsApi.answerQuestion(task.id, question.id, body);
      onAnswered();
    } catch (err) {
      setError((err as ApiError).error ?? "Failed to post answer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="rounded-md border border-gray-100 bg-gray-50 p-3 space-y-2">
      <div>
        <p className="text-sm text-gray-900 whitespace-pre-wrap">{question.question_body}</p>
        <p className="text-xs text-gray-500 mt-1">
          asked {formatRelative(question.created_at)}
        </p>
      </div>
      {question.answer_body ? (
        <div className="pl-3 border-l-2 border-blue-200">
          <p className="text-xs font-medium text-blue-700">Answer from requester</p>
          <p className="text-sm text-gray-900 whitespace-pre-wrap mt-1">
            {question.answer_body}
          </p>
          {question.answered_at && (
            <p className="text-xs text-gray-500 mt-1">
              answered {formatRelative(question.answered_at)}
            </p>
          )}
        </div>
      ) : isRequester ? (
        showForm ? (
          <form onSubmit={handleAnswer} className="space-y-2">
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 p-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <Textarea
              id={`answer-${question.id}`}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Reply publicly..."
              required
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={saving}>
                Post answer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setShowForm(true)}>
            Answer
          </Button>
        )
      ) : (
        <p className="text-xs text-gray-500 italic">Not yet answered.</p>
      )}
    </li>
  );
}
