import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCUMENT_CONTENT_TYPES, PROOF_KINDS } from "../documents/rules";

// The standalone SQL the owner runs must be idempotent, apply on top of the
// earlier files (only new tables), and match schema.sql and the code.

const dbDir = join(__dirname, "..", "db");
const sql = readFileSync(join(dbDir, "2026-11-documents.sql"), "utf-8");
const schema = readFileSync(join(dbDir, "schema.sql"), "utf-8");
const statements = sql
  .replace(/--.*$/gm, "")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

describe("2026-11-documents.sql", () => {
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
});
