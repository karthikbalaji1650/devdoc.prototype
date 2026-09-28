import pg from 'pg';

/** The app talks to Postgres through this narrow shape, not the full
 * `pg` Pool type, so tests can hand it a pg-mem adapter instead of a
 * real database and exercise the exact same SQL. */
export interface Db {
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString });
}
