import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hashLocalPassword } from "../modules/auth/password";
import { withDatabase } from "./run-sql-file";

function getRequired(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function provision() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to provision local passwords in production.");
  const userId = getRequired("ARTEDU_LOCAL_USER_ID");
  const password = getRequired("ARTEDU_LOCAL_USER_PASSWORD");
  if (password.length < 12 || password.length > 128) throw new Error("ARTEDU_LOCAL_USER_PASSWORD must be 12-128 characters.");
  const passwordHash = await hashLocalPassword(password);
  await withDatabase(async (pool) => {
    const user = await pool.query<{ id: string; username: string }>("SELECT id,username FROM users WHERE id=$1", [userId]);
    if (!user.rows[0]) throw new Error("The requested user does not exist.");
    await pool.query(`
      INSERT INTO user_identities (id,user_id,provider,external_subject,password_hash)
      VALUES ($1,$2,'local',$3,$4)
      ON CONFLICT (user_id,provider) DO UPDATE SET
        external_subject=EXCLUDED.external_subject,password_hash=EXCLUDED.password_hash,updated_at=CURRENT_TIMESTAMP
    `, [randomUUID(), userId, user.rows[0].username, passwordHash]);
    await pool.query("DELETE FROM auth_sessions WHERE user_id=$1", [userId]);
    console.log(`Local password provisioned for ${user.rows[0].username}.`);
  });
}

void provision();
