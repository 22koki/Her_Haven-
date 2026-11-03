import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

/**
 * D1's small prepared-statement surface over an actual SQLite database.
 * Queries, JSON predicates, constraints and transactions execute unchanged.
 * This adapter does not replace authorization or synthesize query responses.
 */
export class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
  }

  prepare(sql) {
    return new SqliteStatement(this, sql, []);
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.execute());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close() { this.sqlite.close(); }
}

class SqliteStatement {
  constructor(database, sql, bindings) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new SqliteStatement(this.database, this.sql, bindings);
  }

  execute() {
    // Tests may schedule a competing database change at a precise query
    // boundary. The production SQL still executes against the changed rows.
    this.database.beforeExecute?.(this.sql, this.bindings);
    const sqlite = this.database.sqlite;
    const before = sqlite.prepare("SELECT total_changes() AS total").get().total;
    const results = sqlite.prepare(this.sql).all(...this.bindings).map((row) => ({ ...row }));
    const changes = sqlite.prepare("SELECT total_changes() AS total").get().total - before;
    return { success: true, results, meta: { changes, rows_read: results.length, rows_written: changes } };
  }

  async all() { return this.execute(); }
  async run() { return this.execute(); }
  async first(column) {
    const row = this.execute().results[0];
    return row ? (column === undefined ? row : row[column] ?? null) : null;
  }

  async raw(options = {}) {
    const statement = this.database.sqlite.prepare(this.sql);
    const columns = statement.columns().map((column) => column.name);
    const rows = statement.all(...this.bindings).map((row) => columns.map((name) => row[name]));
    return options.columnNames ? [columns, ...rows] : rows;
  }
}

export function createDatabase({ community = true } = {}) {
  const database = new SqliteD1();
  database.sqlite.exec(readFileSync(new URL("../drizzle/0000_overjoyed_kang.sql", import.meta.url), "utf8"));
  if (community) database.sqlite.exec(readFileSync(new URL("../drizzle/0001_community.sql", import.meta.url), "utf8"));
  return database;
}

export function addProfile(database, userId, {
  name = userId,
  circles = ["everyday", "friendship"],
  adultAccepted = true,
  communityAccepted = true,
} = {}) {
  database.sqlite.prepare(`
    INSERT INTO haven_profiles
      (user_id, display_name, adult_accepted, community_accepted, gentle,
       joined_circles, saved_ids, blocked_ids, created_at)
    VALUES (?, ?, ?, ?, 0, ?, '[]', '[]', ?)
  `).run(userId, name, adultAccepted ? 1 : 0, communityAccepted ? 1 : 0,
    JSON.stringify(circles), new Date().toISOString());
}

export function setCircles(database, userId, circles) {
  database.sqlite.prepare("UPDATE haven_profiles SET joined_circles = ? WHERE user_id = ?")
    .run(JSON.stringify(circles), userId);
}
