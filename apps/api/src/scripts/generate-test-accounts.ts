import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { hashLocalPassword } from "../modules/auth/password";
import { withDatabase } from "./run-sql-file";

const accounts = [
  { id: "user-student-demo", username: "student.demo", displayName: "测试学生", email: "student.demo@example.test", role: "student", roleId: "role-student" },
  { id: "user-teacher-demo", username: "teacher.demo", displayName: "测试教师", email: "teacher.demo@example.test", role: "teacher", roleId: "role-teacher" },
  { id: "user-operator-demo", username: "operator.demo", displayName: "测试运营", email: "operator.demo@example.test", role: "operator", roleId: "role-operator" },
  { id: "user-admin-demo", username: "admin.demo", displayName: "测试管理员", email: "admin.demo@example.test", role: "admin", roleId: "role-admin" },
] as const;

async function generate() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to generate test accounts in production.");
  if (process.env.ARTEDU_ALLOW_TEST_ACCOUNTS !== "true") throw new Error("Set ARTEDU_ALLOW_TEST_ACCOUNTS=true to generate test accounts.");

  const credentials = accounts.map((account) => ({ ...account, password: randomBytes(24).toString("base64url") }));
  await withDatabase(async (pool) => {
    await pool.query("BEGIN");
    try {
      for (const account of credentials) {
        const user = await pool.query<{ id: string }>(`
          INSERT INTO users (id,username,display_name,email,status)
          VALUES ($1,$2,$3,$4,'active')
          ON CONFLICT (username) DO UPDATE SET
            display_name=EXCLUDED.display_name,email=EXCLUDED.email,status='active',updated_at=CURRENT_TIMESTAMP
          RETURNING id
        `, [account.id, account.username, account.displayName, account.email]);
        const userId = user.rows[0].id;
        const passwordHash = await hashLocalPassword(account.password);
        await pool.query(`
          INSERT INTO user_identities (id,user_id,provider,external_subject,password_hash)
          VALUES ($1,$2,'local',$3,$4)
          ON CONFLICT (user_id,provider) DO UPDATE SET
            external_subject=EXCLUDED.external_subject,password_hash=EXCLUDED.password_hash,updated_at=CURRENT_TIMESTAMP
        `, [randomUUID(), userId, account.username, passwordHash]);
        await pool.query("DELETE FROM user_roles WHERE user_id=$1", [userId]);
        await pool.query("INSERT INTO user_roles (user_id,role_id) VALUES ($1,$2)", [userId, account.roleId]);
        await pool.query("DELETE FROM auth_sessions WHERE user_id=$1", [userId]);
      }
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });

  console.log("Test accounts generated. Store these passwords in your approved test credential vault:");
  for (const account of credentials) console.log(`${account.role}\t${account.username}\t${account.password}`);
}

void generate();
