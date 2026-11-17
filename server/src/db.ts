import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Everything the app stores lives here: database, secret key, generated files. */
export const DATA_DIR = path.resolve(process.env.ZSI_DATA_DIR ?? path.join(here, '../../data'));
export const WORKSPACE_DIR = path.join(DATA_DIR, 'workspace');
mkdirSync(WORKSPACE_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'zsicreative.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  graph TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  api_key_enc TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  models TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  modality TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL,
  request TEXT NOT NULL,
  error TEXT,
  output_text TEXT,
  output_asset_ids TEXT NOT NULL DEFAULT '[]',
  cost_estimate REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_id TEXT,
  type TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL
);
`);

export const now = () => new Date().toISOString();
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
