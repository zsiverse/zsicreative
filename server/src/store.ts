import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import type { Asset, Job, ModelDef, ProviderInput, ProviderPublic, ProjectSummary, Project } from '@zsi/shared';
import { providerKindInfo } from '@zsi/shared';
import { db, newId, now, WORKSPACE_DIR } from './db.js';
import { decrypt, encrypt } from './secrets.js';
import type { ProviderConfig } from './providers/types.js';

export const bus = new EventEmitter();
bus.setMaxListeners(100);

// ---------- projects ----------

export function listProjects(): ProjectSummary[] {
  return (
    db
      .prepare(
        `SELECT p.id, p.name, p.updated_at,
          COALESCE((SELECT SUM(cost_estimate) FROM jobs j WHERE j.project_id = p.id AND j.status = 'done'), 0) AS total
         FROM projects p ORDER BY p.updated_at DESC`,
      )
      .all() as any[]
  ).map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at, totalCost: r.total }));
}

export function getProject(id: string): Project | undefined {
  const r = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
  if (!r) return;
  const total = (db.prepare(`SELECT COALESCE(SUM(cost_estimate),0) AS t FROM jobs WHERE project_id = ? AND status = 'done'`).get(id) as any).t;
  return { id: r.id, name: r.name, updatedAt: r.updated_at, totalCost: total, graph: JSON.parse(r.graph) };
}

export function createProject(name: string): Project {
  const id = newId('prj');
  const t = now();
  db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name, t, t);
  return getProject(id)!;
}

export function updateProject(id: string, patch: { name?: string; graph?: unknown }) {
  const cur = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!cur) return;
  if (patch.name != null) db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(patch.name, id);
  if (patch.graph != null) db.prepare('UPDATE projects SET graph = ? WHERE id = ?').run(JSON.stringify(patch.graph), id);
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), id);
  return getProject(id);
}

export function deleteProject(id: string) {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ---------- providers ----------

function rowToPublic(r: any): ProviderPublic {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    baseUrl: r.base_url,
    enabled: !!r.enabled,
    hasKey: !!r.api_key_enc,
    models: JSON.parse(r.models),
  };
}

export function listProviders(): ProviderPublic[] {
  return (db.prepare('SELECT * FROM providers ORDER BY created_at').all() as any[]).map(rowToPublic);
}

export function getProviderConfig(id: string): ProviderConfig | undefined {
  const r = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as any;
  if (!r) return;
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    baseUrl: r.base_url,
    apiKey: r.api_key_enc ? decrypt(r.api_key_enc) : undefined,
    models: JSON.parse(r.models),
  };
}

export function createProvider(input: ProviderInput): ProviderPublic {
  const info = providerKindInfo(input.kind);
  if (!info) throw new Error(`Unknown provider kind: ${input.kind}`);
  const id = newId('prv');
  db.prepare(
    'INSERT INTO providers (id, kind, name, base_url, api_key_enc, enabled, models, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    input.kind,
    input.name || info.label,
    input.baseUrl || info.defaultBaseUrl,
    input.apiKey ? encrypt(input.apiKey) : null,
    input.enabled === false ? 0 : 1,
    JSON.stringify(input.models ?? info.suggestedModels),
    now(),
  );
  return rowToPublic(db.prepare('SELECT * FROM providers WHERE id = ?').get(id));
}

export function updateProvider(id: string, input: Partial<ProviderInput>): ProviderPublic | undefined {
  const r = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as any;
  if (!r) return;
  const models: ModelDef[] | undefined = input.models;
  db.prepare('UPDATE providers SET name = ?, base_url = ?, enabled = ?, models = ? WHERE id = ?').run(
    input.name ?? r.name,
    input.baseUrl ?? r.base_url,
    input.enabled == null ? r.enabled : input.enabled ? 1 : 0,
    models ? JSON.stringify(models) : r.models,
    id,
  );
  if (input.apiKey !== undefined) {
    db.prepare('UPDATE providers SET api_key_enc = ? WHERE id = ?').run(input.apiKey ? encrypt(input.apiKey) : null, id);
  }
  return rowToPublic(db.prepare('SELECT * FROM providers WHERE id = ?').get(id));
}

export function deleteProvider(id: string) {
  db.prepare('DELETE FROM providers WHERE id = ?').run(id);
}

/** First run: add the free demo provider so the canvas works out of the box. */
export function ensureDemoProvider() {
  const n = (db.prepare('SELECT COUNT(*) AS n FROM providers').get() as any).n;
  if (n === 0) createProvider({ kind: 'mock', name: 'Demo (offline)' });
}

// ---------- jobs ----------

export function rowToJob(r: any): Job {
  return {
    id: r.id,
    projectId: r.project_id,
    nodeId: r.node_id,
    providerId: r.provider_id,
    model: r.model,
    modality: r.modality,
    status: r.status,
    progress: r.progress ?? undefined,
    error: r.error ?? undefined,
    outputText: r.output_text ?? undefined,
    outputAssetIds: JSON.parse(r.output_asset_ids),
    costEstimate: r.cost_estimate,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getJob(id: string): Job | undefined {
  const r = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  return r ? rowToJob(r) : undefined;
}

// ---------- assets ----------

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

export function mimeFromName(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const found = Object.entries(EXT).find(([, e]) => e === ext || (ext === 'jpeg' && e === 'jpg'));
  return found?.[0] ?? 'application/octet-stream';
}

function typeFromMime(mime: string): Asset['type'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

function rowToAsset(r: any): Asset {
  return {
    id: r.id,
    projectId: r.project_id,
    jobId: r.job_id ?? undefined,
    type: r.type,
    filename: r.filename,
    mime: r.mime,
    url: `/files/${r.project_id}/${r.filename}`,
    createdAt: r.created_at,
  };
}

export function saveAsset(projectId: string, data: Buffer, mime: string, opts: { jobId?: string; sourceUrl?: string } = {}): Asset {
  const id = newId('ast');
  const filename = `${id}.${EXT[mime] ?? 'bin'}`;
  const dir = path.join(WORKSPACE_DIR, projectId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, filename), data);
  db.prepare(
    'INSERT INTO assets (id, project_id, job_id, type, filename, mime, source_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, projectId, opts.jobId ?? null, typeFromMime(mime), filename, mime, opts.sourceUrl ?? null, now());
  const asset = getAsset(id)!;
  bus.emit('event', { type: 'asset', asset });
  return asset;
}

export function getAsset(id: string): Asset | undefined {
  const r = db.prepare('SELECT * FROM assets WHERE id = ?').get(id);
  return r ? rowToAsset(r) : undefined;
}

export function assetPath(a: Asset) {
  return path.join(WORKSPACE_DIR, a.projectId, a.filename);
}

export function listAssets(projectId: string): Asset[] {
  return (db.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as any[]).map(rowToAsset);
}
