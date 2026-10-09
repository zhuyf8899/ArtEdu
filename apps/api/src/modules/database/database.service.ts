/**
 * 【数据库入口】通过 pg 连接池访问 PostgreSQL。query 执行单次 SQL，transaction 将多个操作放到同一个事务；这里不定义表，表结构在 migrations。
 */
import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required. Copy apps/api/.env.example before starting the API.");
    }
    // 连接池复用数据库连接，避免每次请求都重新建立连接。
    this.pool = new Pool({ connectionString, max: Number(process.env.DATABASE_POOL_SIZE ?? 10), connectionTimeoutMillis: 5000 });
  }

  query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
    // SQL 中的 $1、$2 等占位符对应 values；把用户输入作为参数传入，而不是拼进 SQL。
    return this.pool.query<T>(text, values as never[]);
  }

  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    // 同一连接内 BEGIN → 执行业务 → COMMIT；出错 ROLLBACK，避免只写入一半。
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      // 无论成功失败，都归还连接；release 不等于关闭整个连接池。
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
