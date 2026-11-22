import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IRS_HELP_SLUG } from "../tax-preparers";

// The IRS Notices & Representation category reaches a database two ways:
// seed.ts, and the INSERT in the standalone SQL the owner runs. They must
// agree, and the INSERT must be safe to run twice.

const dbDir = join(__dirname, "..", "db");
const seed = readFileSync(join(dbDir, "seed.ts"), "utf-8");
const sql = readFileSync(join(dbDir, "2026-11-tax-prep.sql"), "utf-8");

describe("the IRS Notices & Representation category", () => {
  it("is in seed.ts", () => {
    expect(seed).toContain(
      `{ name: "IRS Notices & Representation", slug: "${IRS_HELP_SLUG}", sortOrder: 1 }`,
    );
  });

  it("is inserted idempotently, inside the transaction, with a UUIDv7 id", () => {
    const insert = sql.match(/INSERT INTO categories[^;]*;/)?.[0] ?? "";
    expect(insert).toContain(`'IRS Notices & Representation', '${IRS_HELP_SLUG}', NULL, true, 1`);
    expect(insert).toMatch(/ON CONFLICT \(slug\) DO NOTHING;$/);
    const id = insert.match(/VALUES \('([0-9a-f-]{36})'/)?.[1] ?? "";
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(sql.indexOf("BEGIN;")).toBeLessThan(sql.indexOf(insert));
    expect(sql.indexOf(insert)).toBeLessThan(sql.indexOf("COMMIT;"));
  });
});
