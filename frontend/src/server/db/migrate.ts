import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("DATABASE_URL must be set");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, "schema.sql");
const schema = readFileSync(schemaPath, "utf-8");

function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inDollar = false;
  let dollarTag = "";

  while (i < sql.length) {
    const c = sql[i];
    const next2 = sql.slice(i, i + 2);

    if (!inSingle && !inDouble && !inDollar && next2 === "--") {
      const eol = sql.indexOf("\n", i);
      i = eol === -1 ? sql.length : eol + 1;
      buf += "\n";
      continue;
    }
    if (!inSingle && !inDouble && !inDollar && next2 === "/*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (!inDollar && c === "$") {
        const m = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
        if (m) {
          dollarTag = m[0];
          inDollar = true;
          buf += dollarTag;
          i += dollarTag.length;
          continue;
        }
      } else if (inDollar && sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        inDollar = false;
        dollarTag = "";
        continue;
      }
    }

    if (!inDollar) {
      if (!inDouble && c === "'") inSingle = !inSingle;
      else if (!inSingle && c === '"') inDouble = !inDouble;
    }

    if (c === ";" && !inSingle && !inDouble && !inDollar) {
      const stmt = buf.trim();
      if (stmt.length > 0) out.push(stmt);
      buf = "";
      i++;
      continue;
    }

    buf += c;
    i++;
  }

  const last = buf.trim();
  if (last.length > 0) out.push(last);
  return out;
}

async function main() {
  const sql = neon(dbUrl!);
  const statements = splitStatements(schema);

  console.log(`Applying ${statements.length} statements...`);
  for (const stmt of statements) {
    try {
      await sql.query(stmt);
    } catch (e) {
      const msg = (e as Error).message;
      if (
        msg.includes("already exists") ||
        msg.includes("duplicate") ||
        (msg.includes("does not exist") && stmt.startsWith("DROP"))
      ) {
        console.warn(`Skipping: ${msg.slice(0, 100)}`);
        continue;
      }
      console.error("Failed statement:", stmt.slice(0, 200));
      throw e;
    }
  }
  console.log("Migration complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
