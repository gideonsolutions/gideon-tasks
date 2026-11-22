import { describe, it, expect } from "vitest";
import { initialCategoryId } from "@/lib/utils/categories";

const rows = [
  { id: "c-tax", slug: "tax-prep" },
  { id: "c-cleaning", slug: "cleaning" },
  { id: "c-tutoring", slug: "tutoring" },
];

describe("initialCategoryId", () => {
  it("selects the category named in ?category=", () => {
    expect(initialCategoryId(rows, "tutoring")).toBe("c-tutoring");
  });

  it("falls back to the first category without a slug", () => {
    expect(initialCategoryId(rows)).toBe("c-tax");
  });

  it("falls back to the first category for an unknown slug", () => {
    expect(initialCategoryId(rows, "not-a-category")).toBe("c-tax");
  });

  it("returns an empty id when there are no categories", () => {
    expect(initialCategoryId([], "tutoring")).toBe("");
  });
});
