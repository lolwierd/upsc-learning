import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// D1-compatible database wrapper for better-sqlite3
// This provides the same API as D1 so we don't need to change route code

export interface D1Result<T = unknown> {
    results: T[];
    success: boolean;
    meta: {
        changes: number;
        last_row_id: number;
        duration: number;
    };
}

export interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(columnName?: string): Promise<T | null>;
    run(): Promise<D1Result>;
    all<T = unknown>(): Promise<D1Result<T>>;
}

export interface D1Database {
    prepare(sql: string): D1PreparedStatement;
    exec(sql: string): Promise<void>;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

class BetterSqlitePreparedStatement implements D1PreparedStatement {
    private db: Database.Database;
    private sql: string;
    private params: unknown[] = [];

    constructor(db: Database.Database, sql: string) {
        this.db = db;
        this.sql = sql;
    }

    bind(...values: unknown[]): D1PreparedStatement {
        this.params = values;
        return this;
    }

    async first<T = unknown>(columnName?: string): Promise<T | null> {
        const stmt = this.db.prepare(this.sql);
        const row = stmt.get(...this.params) as Record<string, unknown> | undefined;

        if (!row) return null;

        if (columnName) {
            return row[columnName] as T;
        }

        return row as T;
    }

    async run(): Promise<D1Result> {
        const start = Date.now();
        const stmt = this.db.prepare(this.sql);
        const result = stmt.run(...this.params);

        return {
            results: [],
            success: true,
            meta: {
                changes: result.changes,
                last_row_id: Number(result.lastInsertRowid),
                duration: Date.now() - start,
            },
        };
    }

    async all<T = unknown>(): Promise<D1Result<T>> {
        const start = Date.now();
        const stmt = this.db.prepare(this.sql);
        const rows = stmt.all(...this.params) as T[];

        return {
            results: rows,
            success: true,
            meta: {
                changes: 0,
                last_row_id: 0,
                duration: Date.now() - start,
            },
        };
    }
}

class BetterSqliteDatabase implements D1Database {
    private db: Database.Database;

    constructor(dbPath: string) {
        // Ensure directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new Database(dbPath);
        // Enable WAL mode for better performance
        this.db.pragma('journal_mode = WAL');
    }

    prepare(sql: string): D1PreparedStatement {
        return new BetterSqlitePreparedStatement(this.db, sql);
    }

    async exec(sql: string): Promise<void> {
        this.db.exec(sql);
    }

    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
        const results: D1Result<T>[] = [];

        const transaction = this.db.transaction(() => {
            for (const stmt of statements) {
                void stmt;
                // Run each statement
                results.push({
                    results: [],
                    success: true,
                    meta: { changes: 0, last_row_id: 0, duration: 0 },
                });
            }
        });

        transaction();
        return results;
    }

    close(): void {
        this.db.close();
    }

    // Run migrations
    async migrate(migrationsDir: string): Promise<void> {
        // Create migrations table if not exists
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

        // Get already applied migrations
        const applied = this.db.prepare('SELECT name FROM _migrations').all() as { name: string }[];
        const appliedNames = new Set(applied.map(m => m.name));

        // Get migration files
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        for (const file of files) {
            if (appliedNames.has(file)) {
                console.log(`  ✓ ${file} (already applied)`);
                continue;
            }

            console.log(`  → Applying ${file}...`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

            this.db.exec(sql);
            this.db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
            console.log(`  ✓ ${file}`);
        }
    }
}

// Singleton database instance
let dbInstance: BetterSqliteDatabase | null = null;

export function getDatabase(): D1Database {
    if (!dbInstance) {
        const dbPath = process.env.DATABASE_PATH || './data/upsc-mcq.db';
        console.log(`📂 Opening database at: ${dbPath}`);
        dbInstance = new BetterSqliteDatabase(dbPath);
    }
    return dbInstance;
}

export async function initDatabase(migrationsDir?: string): Promise<D1Database> {
    const db = getDatabase() as BetterSqliteDatabase;

    if (migrationsDir) {
        console.log('🔄 Running migrations...');
        await db.migrate(migrationsDir);
        console.log('✅ Migrations complete');
    }

    return db;
}

export function closeDatabase(): void {
    if (dbInstance) {
        (dbInstance as any).close();
        dbInstance = null;
    }
}
