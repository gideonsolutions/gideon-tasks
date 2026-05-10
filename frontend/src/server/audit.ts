import "server-only";
import { execute } from "./db";
import { newId } from "./auth";

export async function logAudit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  oldValue: unknown,
  newValue: unknown,
  ipAddress: string | null = null,
): Promise<void> {
  await execute(
    `INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, old_value, new_value, ip_address, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::inet, now())`,
    [
      newId(),
      actorId,
      action,
      entityType,
      entityId,
      oldValue == null ? null : JSON.stringify(oldValue),
      newValue == null ? null : JSON.stringify(newValue),
      ipAddress,
    ],
  );
}

export async function logModeration(
  entityType: string,
  entityId: string,
  action: string,
  reason: string | null,
  moderatorId: string | null,
): Promise<void> {
  await execute(
    `INSERT INTO moderation_log (id, entity_type, entity_id, action, reason, moderator_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [newId(), entityType, entityId, action, reason, moderatorId],
  );
}
