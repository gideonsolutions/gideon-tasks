"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { TaskForm } from "@/components/tasks/task-form";
import { EmailVerificationNotice } from "@/components/auth/email-verification-notice";
import { useAuth } from "@/lib/hooks/use-auth";
import {
  TRUST_LEVEL_NAMES,
  canPostTasks,
  maxActivePosted,
  maxTaskValueCents,
} from "@/lib/constants";
import { formatCents } from "@/lib/utils/format";

export default function NewTaskPage() {
  const { user, trustLevel } = useAuth();
  // The API enforces all of this; the page only explains it up front.
  const unverified = !!user && !user.email_verified;
  const allowed = canPostTasks(trustLevel, true);
  const levelName = TRUST_LEVEL_NAMES[trustLevel] ?? `Level ${trustLevel}`;

  return (
    <div className="max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create a New Task</CardTitle>
        </CardHeader>
        <CardContent>
          {unverified ? (
            <EmailVerificationNotice purpose="to post tasks" />
          ) : !allowed ? (
            <p className="text-sm text-gray-700">
              Your account cannot post tasks at its current trust level.
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-gray-600">
                At trust level {levelName}, each task can pay the doer up to{" "}
                {formatCents(maxTaskValueCents(trustLevel))}, and you can have
                up to {maxActivePosted(trustLevel)} active tasks at a time.
              </p>
              <TaskForm />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
