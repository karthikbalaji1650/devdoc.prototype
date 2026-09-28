import { newDb } from 'pg-mem';
import type { Db } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

const SCHEMA = `
CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  department VARCHAR(255),
  role VARCHAR(64) NOT NULL DEFAULT 'firmware-lead',
  avatar_bg VARCHAR(64),
  initials VARCHAR(8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE documents (
  id VARCHAR(64) PRIMARY KEY,
  doc_number VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255),
  author VARCHAR(255),
  department VARCHAR(255),
  doc_date DATE,
  version VARCHAR(32) DEFAULT '1.0',
  classification VARCHAR(32) DEFAULT 'INTERNAL ONLY',
  status VARCHAR(32) DEFAULT 'APPROVED',
  template_type VARCHAR(64) DEFAULT 'technical-analysis',
  document_json JSONB NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
`;

export interface TestUser {
  id: string;
  name: string;
  email: string;
  role: string;
  password: string;
}

export const TEST_USERS: TestUser[] = [
  { id: 'usr-01', name: 'Manivannan Thangavel', email: 'mani.thangavel@sanmina.com', role: 'admin', password: 'demo-pass-1' },
  { id: 'usr-02', name: 'Vaishnavi Aasaithambi', email: 'vaishnavi.aasaithambi@sanmina.com', role: 'release-manager', password: 'demo-pass-2' },
  { id: 'usr-03', name: 'Judia Lumina', email: 'judia.lumina@sanmina.com', role: 'firmware-lead', password: 'demo-pass-3' },
];

/** A fresh in-memory Postgres per test, with the real schema and the
 * three demo users (real bcrypt hashes) seeded — no Docker required. */
export async function createTestDb(): Promise<Db> {
  const mem = newDb({ autoCreateForeignKeyIndices: true });
  mem.public.none(SCHEMA);
  const { Pool } = mem.adapters.createPg();
  const db: Db = new Pool();
  for (const u of TEST_USERS) {
    const hash = await hashPassword(u.password);
    await db.query('INSERT INTO users (id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5)', [
      u.id, u.name, u.email, hash, u.role,
    ]);
  }
  return db;
}
