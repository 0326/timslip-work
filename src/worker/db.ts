// libSQL (Turso) 适配器
//
// 把 @libsql/client 包装成 Cloudflare D1 同款接口（.prepare().bind().all()/.first()/.run()），
// 让 index.ts 的调用点几乎零改动（c.env.D1 → getDb(c.env)）。
// 见 docs/MIGRATE_TURSO.md。
//
// 用 /web 版客户端：纯 fetch，无 node net 依赖，可在 workerd（wrangler dev / 线上）运行。
// 本地开发连本地 libSQL（turso dev，HTTP，无需 token）；线上连东京库（libsql://，带 token）。
import { createClient, type Client, type InValue } from "@libsql/client/web";

class Stmt {
  constructor(
    private client: Client,
    private sql: string,
    private args: InValue[] = [],
  ) {}

  bind(...args: unknown[]): Stmt {
    return new Stmt(this.client, this.sql, args as InValue[]);
  }

  async all<T = unknown>(): Promise<{ results: T[]; success: true }> {
    const rs = await this.client.execute({ sql: this.sql, args: this.args });
    return { results: rs.rows as unknown as T[], success: true };
  }

  async first<T = unknown>(): Promise<T | null> {
    const rs = await this.client.execute({ sql: this.sql, args: this.args });
    return (rs.rows[0] as unknown as T) ?? null;
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const rs = await this.client.execute({ sql: this.sql, args: this.args });
    return { success: true, meta: { changes: rs.rowsAffected } };
  }
}

class Db {
  constructor(private client: Client) {}
  prepare(sql: string): Stmt {
    return new Stmt(this.client, sql);
  }
}

// 每请求构造一个 client：/web 客户端只持有配置、execute 即一次 fetch，开销可忽略。
export function getDb(env: {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN?: string;
}): Db {
  return new Db(
    createClient({
      url: env.TURSO_DATABASE_URL,
      authToken: env.TURSO_AUTH_TOKEN || undefined,
    }),
  );
}
