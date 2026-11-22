import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * /api/admin/users/[id]/tax-preparer: an admin records or clears a user's
 * PTIN (for the current calendar year) and credential, and every change is
 * written to the audit log. The database and auth are mocked.
 */

const ADMIN = "0190d0c0-0000-7000-8000-0000000000a9";
const USER = "0190d0c0-0000-7000-8000-0000000000aa";
const OTHER = "0190d0c0-0000-7000-8000-0000000000ab";

const blank = {
  id: USER,
  legal_first_name: "Kitty",
  legal_last_name: "Cats",
  email: "kitty@example.com",
  status: "active",
  ptin: null as string | null,
  ptin_year: null as number | null,
  ptin_note: null as string | null,
  ptin_recorded_at: null as string | null,
  ptin_recorded_by: null as string | null,
  tax_credential: null as string | null,
  tax_credential_note: null as string | null,
  tax_credential_recorded_at: null as string | null,
  tax_credential_recorded_by: null as string | null,
};

const state = vi.hoisted(() => ({
  isAdmin: true,
  row: null as Record<string, unknown> | null,
  ptinOwner: null as { id: string } | null,
}));

const db = vi.hoisted(() => ({
  queryOne: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith("SELECT id FROM users WHERE ptin = $1")) return state.ptinOwner;
    if (sql.startsWith("SELECT") && sql.includes("FROM users WHERE id = $1")) return state.row;
    if (sql.startsWith("UPDATE users SET ptin = $1")) {
      const [ptin, year, note, by] = params;
      state.row = {
        ...state.row,
        ptin,
        ptin_year: year,
        ptin_note: note,
        ptin_recorded_at: "2026-11-21T15:00:00Z",
        ptin_recorded_by: by,
      };
      return state.row;
    }
    if (sql.startsWith("UPDATE users SET ptin = NULL")) {
      state.row = {
        ...state.row,
        ptin: null,
        ptin_year: null,
        ptin_note: params[0],
        ptin_recorded_at: null,
        ptin_recorded_by: null,
      };
      return state.row;
    }
    if (sql.startsWith("UPDATE users SET tax_credential = $1")) {
      const [credential, note, by] = params;
      state.row = {
        ...state.row,
        tax_credential: credential,
        tax_credential_note: note,
        tax_credential_recorded_at: "2026-11-21T15:00:00Z",
        tax_credential_recorded_by: by,
      };
      return state.row;
    }
    if (sql.startsWith("UPDATE users SET tax_credential = NULL")) {
      state.row = {
        ...state.row,
        tax_credential: null,
        tax_credential_note: params[0],
        tax_credential_recorded_at: null,
        tax_credential_recorded_by: null,
      };
      return state.row;
    }
    throw new Error(`Unexpected queryOne: ${sql}`);
  }),
}));
const audit = vi.hoisted(() => ({ logAudit: vi.fn(async () => {}) }));

vi.mock("../db", () => db);
vi.mock("../audit", () => audit);
vi.mock("../auth", async () => {
  const { forbidden } = await import("../errors");
  return {
    requireAdmin: vi.fn(async () => {
      if (!state.isAdmin) throw forbidden("Admin access required");
      return { userId: ADMIN, isAdmin: true, trustLevel: 3 };
    }),
  };
});

import { GET, POST } from "@/app/api/admin/users/[id]/tax-preparer/route";

const params = (id = USER) => ({ params: Promise.resolve({ id }) });
function post(body: unknown) {
  return new Request(`https://www.gideontasks.com/api/admin/users/${USER}/tax-preparer`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: JSON.stringify(body),
  });
}
const get = () =>
  new Request(`https://www.gideontasks.com/api/admin/users/${USER}/tax-preparer`, {
    headers: { authorization: "Bearer test" },
  });

const recordPtin = {
  action: "record_ptin",
  ptin: "p01234567",
  year: 2026,
  note: "Listed in the IRS directory as an EA in Charlotte, NC",
  confirms_current_ptin: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-21T15:00:00Z"));
  state.isAdmin = true;
  state.row = { ...blank };
  state.ptinOwner = null;
});
afterEach(() => vi.useRealTimers());

describe("GET", () => {
  it("shows an admin the record and the year a PTIN can be recorded for", async () => {
    const res = await GET(get(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...blank, current_year: 2026 });
  });

  it("is for admins only", async () => {
    state.isAdmin = false;
    expect((await GET(get(), params())).status).toBe(403);
  });

  it("refuses something that isn't a user ID", async () => {
    expect((await GET(get(), params("not-a-uuid"))).status).toBe(400);
  });
});

describe("recording a PTIN", () => {
  it("records it for this year, in upper case, with who and the note, and audits it", async () => {
    const res = await POST(post(recordPtin), params());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ptin: "P01234567",
      ptin_year: 2026,
      ptin_note: recordPtin.note,
      ptin_recorded_by: ADMIN,
      current_year: 2026,
    });
    expect(audit.logAudit).toHaveBeenCalledWith(
      ADMIN,
      "admin.user.ptin_recorded",
      "user",
      USER,
      { ptin: null, ptin_year: null, ptin_note: null, ptin_recorded_at: null, ptin_recorded_by: null },
      {
        ptin: "P01234567",
        ptin_year: 2026,
        ptin_note: recordPtin.note,
        ptin_recorded_at: "2026-11-21T15:00:00Z",
        ptin_recorded_by: ADMIN,
      },
    );
  });

  it.each([2025, 2027])("refuses a PTIN for %i: only the current year (UTC) can be recorded", async (year) => {
    const res = await POST(post({ ...recordPtin, year }), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/current calendar year \(2026\)/);
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it("takes the year from the UTC clock", async () => {
    vi.setSystemTime(new Date("2026-12-31T23:30:00-05:00")); // already 2027 in UTC
    expect((await POST(post(recordPtin), params())).status).toBe(400);
    expect((await POST(post({ ...recordPtin, year: 2027 }), params())).status).toBe(200);
  });

  it.each(["01234567", "P0123", "P00000000", "X01234567"])("refuses %j, which isn't a PTIN", async (ptin) => {
    const res = await POST(post({ ...recordPtin, ptin }), params());
    expect(res.status).toBe(400);
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it("needs a note and the admin's confirmation", async () => {
    expect((await POST(post({ ...recordPtin, note: " " }), params())).status).toBe(400);
    expect((await POST(post({ ...recordPtin, confirms_current_ptin: false }), params())).status).toBe(400);
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it("refuses a PTIN that is recorded on another account", async () => {
    state.ptinOwner = { id: OTHER };
    const res = await POST(post(recordPtin), params());
    expect(res.status).toBe(409);
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it("is for admins only", async () => {
    state.isAdmin = false;
    expect((await POST(post(recordPtin), params())).status).toBe(403);
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it("404s for an unknown user", async () => {
    state.row = null;
    expect((await POST(post(recordPtin), params())).status).toBe(404);
  });
});

describe("clearing a PTIN", () => {
  it("removes the PTIN and its year, keeps the note, and audits it", async () => {
    await POST(post(recordPtin), params());
    vi.clearAllMocks();

    const res = await POST(post({ action: "clear_ptin", note: "PTIN not renewed" }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ptin: null, ptin_year: null, ptin_note: "PTIN not renewed" });
    expect(audit.logAudit).toHaveBeenCalledWith(
      ADMIN,
      "admin.user.ptin_cleared",
      "user",
      USER,
      expect.objectContaining({ ptin: "P01234567", ptin_year: 2026 }),
      { ptin: null, ptin_year: null, ptin_note: "PTIN not renewed", ptin_recorded_at: null, ptin_recorded_by: null },
    );
  });

  it("needs a note", async () => {
    expect((await POST(post({ action: "clear_ptin", note: "" }), params())).status).toBe(400);
  });
});

describe("recording and clearing a credential", () => {
  it("records an Enrolled Agent with who and the note, and audits only the credential", async () => {
    const res = await POST(
      post({
        action: "record_credential",
        credential: "enrolled_agent",
        note: "IRS directory lists an EA",
        confirms_credential: true,
      }),
      params(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      tax_credential: "enrolled_agent",
      tax_credential_recorded_by: ADMIN,
    });
    expect(audit.logAudit).toHaveBeenCalledWith(
      ADMIN,
      "admin.user.tax_credential_recorded",
      "user",
      USER,
      {
        tax_credential: null,
        tax_credential_note: null,
        tax_credential_recorded_at: null,
        tax_credential_recorded_by: null,
      },
      {
        tax_credential: "enrolled_agent",
        tax_credential_note: "IRS directory lists an EA",
        tax_credential_recorded_at: "2026-11-21T15:00:00Z",
        tax_credential_recorded_by: ADMIN,
      },
    );
  });

  it.each(["cpa", "attorney"])("records %s", async (credential) => {
    const res = await POST(
      post({ action: "record_credential", credential, note: "Checked", confirms_credential: true }),
      params(),
    );
    expect(res.status).toBe(200);
  });

  it("refuses a credential it doesn't know, or no confirmation", async () => {
    expect(
      (
        await POST(
          post({ action: "record_credential", credential: "enrolled_actuary", note: "x", confirms_credential: true }),
          params(),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          post({ action: "record_credential", credential: "cpa", note: "x" }),
          params(),
        )
      ).status,
    ).toBe(400);
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it("clears it with a note and audits it", async () => {
    state.row = { ...blank, tax_credential: "cpa", tax_credential_note: "State board" };
    const res = await POST(post({ action: "clear_credential", note: "License lapsed" }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tax_credential: null, tax_credential_note: "License lapsed" });
    expect(audit.logAudit).toHaveBeenCalledWith(
      ADMIN,
      "admin.user.tax_credential_cleared",
      "user",
      USER,
      expect.objectContaining({ tax_credential: "cpa" }),
      expect.objectContaining({ tax_credential: null, tax_credential_note: "License lapsed" }),
    );
  });
});
