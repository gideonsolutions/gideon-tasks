import { neon } from "@neondatabase/serverless";
import { v7 as uuidv7 } from "uuid";
import { randomBytes } from "node:crypto";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const ATTESTOR_NAME = process.env.SEED_ATTESTOR_NAME ?? "Gideon Solutions";
const ATTESTOR_TYPE = process.env.SEED_ATTESTOR_TYPE ?? "organization";
const ATTESTOR_EMAIL = process.env.SEED_ATTESTOR_EMAIL;
if (!ATTESTOR_EMAIL) {
  console.error("SEED_ATTESTOR_EMAIL must be set");
  process.exit(1);
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  const buf = randomBytes(8);
  return Array.from(buf, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

const CATEGORIES: { name: string; slug: string; sortOrder: number }[] = [
  { name: "Tax Prep", slug: "tax-prep", sortOrder: 0 },
  { name: "Cleaning", slug: "cleaning", sortOrder: 100 },
  { name: "Handyman", slug: "handyman", sortOrder: 100 },
  { name: "Moving & Hauling", slug: "moving", sortOrder: 100 },
  { name: "Yard Work", slug: "yard-work", sortOrder: 100 },
  { name: "Errands & Delivery", slug: "errands", sortOrder: 100 },
  { name: "Pet Care", slug: "pet-care", sortOrder: 100 },
  { name: "Tutoring", slug: "tutoring", sortOrder: 100 },
  { name: "Computer Help", slug: "tech-help", sortOrder: 100 },
  { name: "Event Help", slug: "event-help", sortOrder: 100 },
  { name: "Other", slug: "other", sortOrder: 100 },
];

async function main() {
  const sql = neon(dbUrl!);

  let attestorId: string;
  const existing = (await sql.query(
    `SELECT id FROM attestors WHERE contact_email = $1`,
    [ATTESTOR_EMAIL],
  )) as Array<{ id: string }>;

  if (existing.length > 0) {
    attestorId = existing[0].id;
    console.log(`Attestor already exists: ${attestorId}`);
  } else {
    attestorId = uuidv7();
    await sql.query(
      `INSERT INTO attestors (id, name, type, status, invite_quota, contact_email, created_at)
       VALUES ($1, $2, $3, 'active', 50, $4, now())`,
      [attestorId, ATTESTOR_NAME, ATTESTOR_TYPE, ATTESTOR_EMAIL],
    );
    console.log(
      `Created attestor: ${ATTESTOR_NAME} (${ATTESTOR_TYPE}) — ${attestorId}`,
    );
  }

  const code = generateCode();
  const inviteId = uuidv7();
  const expiresAt = new Date(Date.now() + 30 * 86_400_000);
  await sql.query(
    `INSERT INTO invites (id, attestor_id, code, target_email, expires_at, created_at)
     VALUES ($1, $2, $3, NULL, $4, now())`,
    [inviteId, attestorId, code, expiresAt],
  );
  console.log(`Created invite code: ${code} (expires ${expiresAt.toISOString().slice(0, 10)})`);

  let inserted = 0;
  for (const cat of CATEGORIES) {
    const existing = (await sql.query(
      `SELECT id FROM categories WHERE slug = $1`,
      [cat.slug],
    )) as Array<{ id: string }>;
    if (existing.length > 0) {
      await sql.query(
        `UPDATE categories SET sort_order = $1 WHERE slug = $2`,
        [cat.sortOrder, cat.slug],
      );
      continue;
    }
    await sql.query(
      `INSERT INTO categories (id, name, slug, parent_id, is_active, sort_order)
       VALUES ($1, $2, $3, NULL, true, $4)`,
      [uuidv7(), cat.name, cat.slug, cat.sortOrder],
    );
    inserted++;
  }
  console.log(`Inserted ${inserted} new categories (${CATEGORIES.length} total).`);

  console.log("\n--- Ready to register ---");
  console.log(`Visit:        https://www.gideontasks.com/invite/${code}`);
  console.log(`Or register:  https://www.gideontasks.com/register`);
  console.log(`Invite code:  ${code}`);
  console.log(`Email:        must be ${ATTESTOR_EMAIL} to be recognized as the attestor`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
