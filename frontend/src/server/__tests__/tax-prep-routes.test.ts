import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The PTIN rule where the API enforces it: applying, asking a question and
 * being assigned (the assign route, and finalizeAssignment's UPDATE, which
 * also covers the Stripe webhook). The database, auth, email verification,
 * audit log and Stripe are mocked; the SQL is exercised against Postgres
 * separately.
 */

const TASK = "0190d0c0-0000-7000-8000-0000000000b1";
const APP = "0190d0c0-0000-7000-8000-0000000000b2";
const REQUESTER = "0190d0c0-0000-7000-8000-0000000000b3";
const DOER = "0190d0c0-0000-7000-8000-0000000000b4";
const NEW_ID = "0190d0c0-0000-7000-8000-0000000000bf";

const state = vi.hoisted(() => ({
  actor: "",
  task: {} as Record<string, unknown>,
  preparer: null as Record<string, unknown> | null,
  app: {} as Record<string, unknown>,
}));

const db = vi.hoisted(() => ({
  queryOne: vi.fn(async (sql: string) => {
    if (sql.includes("FROM tasks t LEFT JOIN categories c")) return state.task;
    if (sql.includes("AS has_ptin") && sql.includes("FROM users")) return state.preparer;
    if (sql.includes("COUNT(*)::int AS count FROM tasks")) return { count: 0 };
    if (sql.includes("FROM task_applications WHERE id = $1 AND task_id = $2")) return state.app;
    throw new Error(`Unexpected queryOne: ${sql}`);
  }),
  query: vi.fn(async (sql: string) => {
    if (sql.includes("SELECT 1 FROM task_applications WHERE task_id")) return [];
    throw new Error(`Unexpected query: ${sql}`);
  }),
  execute: vi.fn(async () => {}),
}));
const payments = vi.hoisted(() => ({
  authorizeEscrowPayment: vi.fn(async () => ({ status: "authorized" })),
}));
const assignment = vi.hoisted(() => ({ finalizeAssignment: vi.fn(async () => true) }));

vi.mock("../db", () => db);
vi.mock("../audit", () => ({ logAudit: vi.fn(async () => {}) }));
vi.mock("../auth", () => ({
  requireAuth: vi.fn(async () => ({ userId: state.actor, isAdmin: false, trustLevel: 0 })),
  newId: () => NEW_ID,
}));
vi.mock("../email-verification", () => ({ requireVerifiedEmail: vi.fn(async () => true) }));
vi.mock("../platform-volume", () => ({ platformVolumeCents: async () => 0 }));
vi.mock("../payments", () => payments);
vi.mock("../assignment", () => assignment);

import { POST as apply } from "@/app/api/tasks/[id]/applications/route";
import { POST as ask } from "@/app/api/tasks/[id]/questions/route";
import { POST as assign } from "@/app/api/tasks/[id]/assign/[applicationId]/route";
import { POST as createTask } from "@/app/api/tasks/route";
import { PTIN_REQUIRED } from "../tax-preparers";
import { SSN_REJECTION_REASON } from "../moderation";

function post(path: string, body: unknown = {}) {
  return new Request(`https://www.gideontasks.com/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: JSON.stringify(body),
  });
}
const taskParams = { params: Promise.resolve({ id: TASK }) };
const assignParams = { params: Promise.resolve({ id: TASK, applicationId: APP }) };

const currentPtin = { status: "active", has_ptin: true, ptin_year: 2026, tax_credential: null };
const preparers: [string, Record<string, unknown> | null][] = [
  ["no PTIN", { status: "active", has_ptin: false, ptin_year: null, tax_credential: null }],
  ["last year's PTIN", { ...currentPtin, ptin_year: 2025 }],
  ["a suspended account", { ...currentPtin, status: "suspended" }],
  ["no such user", null],
];

const inserts = () =>
  (db.execute.mock.calls as unknown as [string][]).filter(([sql]) => sql.includes("INSERT INTO"));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
  state.actor = DOER;
  state.task = {
    requester_id: REQUESTER,
    status: "published",
    price_cents: 5000,
    pricing_mode: "doer_receives",
    assigned_doer_id: null,
    for_minor: false,
    category_slug: "tax-prep",
  };
  state.preparer = currentPtin;
  state.app = { id: APP, doer_id: DOER, status: "pending" };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/tasks/[id]/applications on a Tax Prep task", () => {
  it("accepts a preparer with a PTIN recorded for this year", async () => {
    const res = await apply(post(`/tasks/${TASK}/applications`, { message: "I prepare 1040s" }), taskParams);
    expect(res.status).toBe(201);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0][0]).toContain("INSERT INTO task_applications");
  });

  it.each(preparers)("refuses %s with 403 and saves nothing", async (_label, preparer) => {
    state.preparer = preparer;
    const res = await apply(post(`/tasks/${TASK}/applications`, {}), taskParams);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: PTIN_REQUIRED });
    expect(inserts()).toHaveLength(0);
  });

  it("doesn't ask about a PTIN outside Tax Prep", async () => {
    state.task = { ...state.task, category_slug: "cleaning" };
    state.preparer = null;
    const res = await apply(post(`/tasks/${TASK}/applications`, {}), taskParams);
    expect(res.status).toBe(201);
  });

  it("lapses on January 1 (UTC)", async () => {
    vi.setSystemTime(new Date("2027-01-01T00:00:01Z"));
    const res = await apply(post(`/tasks/${TASK}/applications`, {}), taskParams);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/tasks/[id]/questions on a Tax Prep task", () => {
  it("accepts a preparer with a PTIN recorded for this year", async () => {
    const res = await ask(
      post(`/tasks/${TASK}/questions`, { question_body: "Which state returns do you need?" }),
      taskParams,
    );
    expect(res.status).toBe(201);
  });

  it.each(preparers)("refuses %s with 403 and saves nothing", async (_label, preparer) => {
    state.preparer = preparer;
    const res = await ask(
      post(`/tasks/${TASK}/questions`, { question_body: "Which state returns do you need?" }),
      taskParams,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: PTIN_REQUIRED });
    expect(inserts()).toHaveLength(0);
  });

  it("rejects a question with an SSN in it", async () => {
    const res = await ask(
      post(`/tasks/${TASK}/questions`, { question_body: "Is my SSN 123-45-6789 needed?" }),
      taskParams,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: SSN_REJECTION_REASON });
    expect(inserts()).toHaveLength(0);
  });
});

describe("POST /api/tasks/[id]/assign/[applicationId] on a Tax Prep task", () => {
  beforeEach(() => {
    state.actor = REQUESTER;
  });

  it("authorizes the card and assigns a preparer with a current PTIN", async () => {
    const res = await assign(post(`/tasks/${TASK}/assign/${APP}`), assignParams);
    expect(res.status).toBe(200);
    expect(payments.authorizeEscrowPayment).toHaveBeenCalledTimes(1);
    expect(assignment.finalizeAssignment).toHaveBeenCalledTimes(1);
  });

  it.each(preparers)(
    "refuses %s before the card is authorized",
    async (_label, preparer) => {
      state.preparer = preparer;
      const res = await assign(post(`/tasks/${TASK}/assign/${APP}`), assignParams);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: PTIN_REQUIRED });
      expect(payments.authorizeEscrowPayment).not.toHaveBeenCalled();
      expect(assignment.finalizeAssignment).not.toHaveBeenCalled();
    },
  );

  it("checks the applicant, not the requester", async () => {
    await assign(post(`/tasks/${TASK}/assign/${APP}`), assignParams);
    const ptinQuery = (db.queryOne.mock.calls as unknown as [string, unknown[]][]).find(([sql]) =>
      sql.includes("AS has_ptin"),
    );
    expect(ptinQuery?.[1]).toEqual([DOER]);
  });
});

describe("POST /api/tasks with an SSN", () => {
  it("rejects it before anything is saved, so a draft never holds one", async () => {
    state.actor = REQUESTER;
    const res = await createTask(
      post("/tasks", {
        title: "2025 federal return",
        description: "My SSN is 123-45-6789 and I have one W-2",
        category_id: "0190d0c0-0000-7000-8000-0000000000c9",
        location_type: "remote",
        price_cents: 10000,
        deadline: "2027-03-01T00:00:00Z",
      }),
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: SSN_REJECTION_REASON });
    expect(db.execute).not.toHaveBeenCalled();
    expect(db.queryOne).not.toHaveBeenCalled();
  });
});
