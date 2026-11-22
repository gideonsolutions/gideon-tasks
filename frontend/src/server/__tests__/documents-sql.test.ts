import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCUMENT_CONTENT_TYPES, PROOF_KINDS } from "../documents/rules";

// The standalone SQL files the owner runs must be idempotent, apply on top
// of the earlier ones (only new tables and columns), and match schema.sql
// and the code.

const dbDir = join(__dirname, "..", "db");
const schema = readFileSync(join(dbDir, "schema.sql"), "utf-8");
const read = (name: string) => readFileSync(join(dbDir, name), "utf-8");
const statementsOf = (sql: string) =>
  sql
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

describe("2026-11-documents.sql (already applied: unchanged)", () => {
  const sql = read("2026-11-documents.sql");
  const statements = statementsOf(sql);

  it("runs in one transaction and only creates, with IF NOT EXISTS", () => {
    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("COMMIT");
    for (const s of statements.slice(1, -1)) {
      expect(s).toMatch(/^CREATE (TABLE|INDEX) IF NOT EXISTS /);
    }
  });

  it("is in schema.sql too", () => {
    for (const s of statements.slice(1, -1)) {
      expect(schema.replace(/--.*$/gm, "")).toContain(s);
    }
  });

  it("allows exactly the code's file types and proof kinds", () => {
    const types = DOCUMENT_CONTENT_TYPES.map((t) => `'${t}'`).join(", ");
    expect(sql.match(new RegExp(`content_type IN \\(${types.replace(/[()/+.]/g, "\\$&")}\\)`, "g"))).toHaveLength(2);
    expect(sql).toContain(`kind IN (${PROOF_KINDS.map((k) => `'${k}'`).join(", ")})`);
  });

  it("has nothing about two-step sign-in, which has its own file", () => {
    expect(sql).not.toMatch(/totp|mfa/i);
  });
});

describe("2026-11-two-step.sql", () => {
  const sql = read("2026-11-two-step.sql");
  const statements = statementsOf(sql);

  it("runs in one transaction and only adds, with IF NOT EXISTS", () => {
    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("COMMIT");
    for (const s of statements.slice(1, -1)) {
      expect(s).toMatch(/^(CREATE (TABLE|INDEX) IF NOT EXISTS |ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS )/);
    }
  });

  it("is in schema.sql too", () => {
    for (const s of statements.slice(1, -1)) {
      expect(schema.replace(/--.*$/gm, "")).toContain(s);
    }
  });

  it("has the two-step sign-in columns and the recovery codes table", () => {
    for (const col of ["totp_secret_enc", "totp_enabled_at", "totp_last_step", "totp_failures", "totp_locked_until"]) {
      expect(sql).toContain(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ${col} `);
    }
    expect(sql).toContain(
      "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS mfa_verified BOOLEAN NOT NULL DEFAULT false",
    );
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS mfa_recovery_codes");
  });
});
