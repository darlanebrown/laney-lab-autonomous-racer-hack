import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type RunMode = 'manual' | 'autonomous';

export interface CreateRunInput {
  user_id: string;
  track_id: string;
  mode: RunMode;
  model_version?: string | null;
  sim_build?: string;
  client_build?: string;
  notes?: string | null;
  local_run_id?: string | null;
  started_at?: string;
}

export interface FinalizeRunInput {
  ended_at?: string;
  duration_s?: number;
  frame_count?: number;
  lap_count?: number;
  off_track_count?: number;
  best_lap_ms?: number | null;
}

export interface StartTrainingJobInput {
  dataset?: Record<string, unknown>;
  hyperparams?: Record<string, unknown>;
  export?: Record<string, unknown>;
}

type DbRow = Record<string, unknown>;

let dbSingleton: Database.Database | null = null;

function getDataDir(): string {
  const configured = process.env.SIMULATOR_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), '.data');
}

function getDbPath(): string {
  const configured = process.env.SIMULATOR_DB_PATH?.trim();
  if (configured) return path.resolve(configured);
  return path.join(getDataDir(), 'simulator.db');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function jsonOrEmptyObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function rowToRun(row: DbRow) {
  return {
    run_id: String(row.run_id),
    user_id: String(row.user_id),
    track_id: String(row.track_id),
    mode: String(row.mode),
    model_version: row.model_version ? String(row.model_version) : null,
    sim_build: String(row.sim_build ?? ''),
    client_build: String(row.client_build ?? ''),
    notes: row.notes ? String(row.notes) : null,
    local_run_id: row.local_run_id ? String(row.local_run_id) : null,
    status: String(row.status),
    started_at: String(row.started_at),
    ended_at: row.ended_at ? String(row.ended_at) : null,
    duration_s: row.duration_s === null ? null : Number(row.duration_s),
    frame_count: Number(row.frame_count ?? 0),
    lap_count: Number(row.lap_count ?? 0),
    off_track_count: Number(row.off_track_count ?? 0),
    best_lap_ms: row.best_lap_ms === null ? null : Number(row.best_lap_ms),
    artifacts: {
      frames_uri: row.frames_uri ? String(row.frames_uri) : null,
      controls_uri: row.controls_uri ? String(row.controls_uri) : null,
      run_json_uri: null,
    },
    created_at: String(row.created_at),
  };
}

function rowToModel(row: DbRow) {
  return {
    model_id: String(row.model_id),
    model_version: String(row.model_version),
    status: String(row.status),
    created_at: String(row.created_at),
    architecture: jsonOrEmptyObject((row.architecture_json as string | null) ?? null),
    training: jsonOrEmptyObject((row.training_json as string | null) ?? null),
    artifacts: {
      pytorch_uri: row.pytorch_uri ? String(row.pytorch_uri) : null,
      onnx_uri: row.onnx_uri ? String(row.onnx_uri) : null,
      openvino_uri: row.openvino_uri ? String(row.openvino_uri) : null,
    },
  };
}

function rowToJob(row: DbRow) {
  return {
    job_id: String(row.job_id),
    status: String(row.status),
    created_at: String(row.created_at),
    config: jsonOrEmptyObject((row.config_json as string | null) ?? null),
    progress: jsonOrEmptyObject((row.progress_json as string | null) ?? null),
    outputs: jsonOrEmptyObject((row.outputs_json as string | null) ?? null),
    logs_uri: row.logs_uri ? String(row.logs_uri) : null,
  };
}

function createVersionTag(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `v${stamp}-${suffix}`;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS runs (
      run_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      model_version TEXT,
      sim_build TEXT NOT NULL,
      client_build TEXT NOT NULL,
      notes TEXT,
      local_run_id TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_s REAL,
      frame_count INTEGER NOT NULL DEFAULT 0,
      lap_count INTEGER NOT NULL DEFAULT 0,
      off_track_count INTEGER NOT NULL DEFAULT 0,
      best_lap_ms INTEGER,
      frames_uri TEXT,
      controls_uri TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_user_id ON runs(user_id);
    CREATE INDEX IF NOT EXISTS idx_runs_track_id ON runs(track_id);

    CREATE TABLE IF NOT EXISTS run_artifacts (
      run_id TEXT PRIMARY KEY REFERENCES runs(run_id) ON DELETE CASCADE,
      frames_zip BLOB,
      controls_csv BLOB,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS training_jobs (
      job_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      config_json TEXT NOT NULL,
      progress_json TEXT NOT NULL,
      outputs_json TEXT NOT NULL,
      selected_run_ids_json TEXT NOT NULL,
      logs_uri TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_training_jobs_created_at ON training_jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_training_jobs_status ON training_jobs(status);

    CREATE TABLE IF NOT EXISTS models (
      model_id TEXT PRIMARY KEY,
      model_version TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      architecture_json TEXT NOT NULL,
      training_json TEXT NOT NULL,
      pytorch_uri TEXT,
      onnx_uri TEXT,
      openvino_uri TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_models_created_at ON models(created_at DESC);

    CREATE TABLE IF NOT EXISTS app_state (
      state_key TEXT PRIMARY KEY,
      state_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export function getDb(): Database.Database {
  if (dbSingleton) return dbSingleton;
  const dbPath = getDbPath();
  ensureDir(path.dirname(dbPath));
  const db = new Database(dbPath);
  initSchema(db);
  dbSingleton = db;
  return dbSingleton;
}

export function createRun(baseUrl: string, payload: CreateRunInput) {
  const db = getDb();
  const runId = crypto.randomUUID();
  const now = nowIso();
  const startedAt = payload.started_at ?? now;

  const insert = db.prepare(`
    INSERT INTO runs(
      run_id, user_id, track_id, mode, model_version, sim_build, client_build, notes, local_run_id,
      status, started_at, frame_count, lap_count, off_track_count, best_lap_ms, created_at, updated_at
    ) VALUES (
      @run_id, @user_id, @track_id, @mode, @model_version, @sim_build, @client_build, @notes, @local_run_id,
      'ingesting', @started_at, 0, 0, 0, NULL, @created_at, @updated_at
    )
  `);
  insert.run({
    run_id: runId,
    user_id: payload.user_id,
    track_id: payload.track_id,
    mode: payload.mode,
    model_version: payload.model_version ?? null,
    sim_build: payload.sim_build ?? 'simulator-web',
    client_build: payload.client_build ?? 'next-web',
    notes: payload.notes ?? null,
    local_run_id: payload.local_run_id ?? null,
    started_at: startedAt,
    created_at: now,
    updated_at: now,
  });

  return {
    run_id: runId,
    upload_urls: {
      frames: `${baseUrl}/api/runs/${runId}/frames`,
      controls: `${baseUrl}/api/runs/${runId}/controls`,
    },
  };
}

export function getRunOrNull(runId: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId) as DbRow | undefined;
  if (!row) return null;
  return rowToRun(row);
}

export function listRuns(params: { limit: number; status?: string; track_id?: string; user_id?: string }) {
  const db = getDb();
  const where: string[] = [];
  const values: unknown[] = [];
  if (params.status) {
    where.push('status = ?');
    values.push(params.status);
  }
  if (params.track_id) {
    where.push('track_id = ?');
    values.push(params.track_id);
  }
  if (params.user_id) {
    where.push('user_id = ?');
    values.push(params.user_id);
  }
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `SELECT * FROM runs ${whereSql} ORDER BY created_at DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...values, params.limit) as DbRow[];
  return {
    items: rows.map(rowToRun),
    next_cursor: null,
  };
}

export function uploadRunArtifact(runId: string, kind: 'frames' | 'controls', bytes: Buffer) {
  const db = getDb();
  const run = db.prepare('SELECT run_id FROM runs WHERE run_id = ?').get(runId) as DbRow | undefined;
  if (!run) {
    throw new Error('Run not found');
  }
  const now = nowIso();
  db.prepare(`
    INSERT INTO run_artifacts(run_id, frames_zip, controls_csv, updated_at)
    VALUES (?, NULL, NULL, ?)
    ON CONFLICT(run_id) DO UPDATE SET updated_at = excluded.updated_at
  `).run(runId, now);

  if (kind === 'frames') {
    db.prepare(`
      UPDATE run_artifacts SET frames_zip = ?, updated_at = ? WHERE run_id = ?
    `).run(bytes, now, runId);
    db.prepare(`
      UPDATE runs SET frames_uri = ?, updated_at = ? WHERE run_id = ?
    `).run(`/api/runs/${runId}/artifacts/frames`, now, runId);
    return;
  }

  db.prepare(`
    UPDATE run_artifacts SET controls_csv = ?, updated_at = ? WHERE run_id = ?
  `).run(bytes, now, runId);
  db.prepare(`
    UPDATE runs SET controls_uri = ?, updated_at = ? WHERE run_id = ?
  `).run(`/api/runs/${runId}/artifacts/controls`, now, runId);
}

export function finalizeRun(runId: string, payload: FinalizeRunInput) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId) as DbRow | undefined;
  if (!row) {
    throw new Error('Run not found');
  }
  const now = nowIso();
  const endedAt = payload.ended_at ?? now;
  db.prepare(`
    UPDATE runs
    SET status = 'completed',
        ended_at = ?,
        duration_s = ?,
        frame_count = ?,
        lap_count = ?,
        off_track_count = ?,
        best_lap_ms = ?,
        updated_at = ?
    WHERE run_id = ?
  `).run(
    endedAt,
    payload.duration_s ?? row.duration_s ?? 0,
    payload.frame_count ?? row.frame_count ?? 0,
    payload.lap_count ?? row.lap_count ?? 0,
    payload.off_track_count ?? row.off_track_count ?? 0,
    payload.best_lap_ms ?? row.best_lap_ms ?? null,
    now,
    runId,
  );
  return getRunOrNull(runId);
}

export function getRunArtifact(runId: string, kind: 'frames' | 'controls'): Buffer | null {
  const db = getDb();
  const row = db
    .prepare('SELECT frames_zip, controls_csv FROM run_artifacts WHERE run_id = ?')
    .get(runId) as { frames_zip?: Buffer; controls_csv?: Buffer } | undefined;
  if (!row) return null;
  return kind === 'frames' ? (row.frames_zip ?? null) : (row.controls_csv ?? null);
}

export function getStats() {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) AS completed_runs,
      COALESCE(SUM(lap_count), 0) AS completed_laps,
      COALESCE(SUM(frame_count), 0) AS completed_frames,
      COALESCE(SUM(duration_s), 0) AS total_duration_s,
      MIN(best_lap_ms) AS best_lap_ms
    FROM runs
    WHERE status = 'completed'
  `).get() as DbRow;

  return {
    completed_runs: Number(row.completed_runs ?? 0),
    completed_laps: Number(row.completed_laps ?? 0),
    completed_frames: Number(row.completed_frames ?? 0),
    total_duration_s: Number(row.total_duration_s ?? 0),
    best_lap_ms: row.best_lap_ms === null ? null : Number(row.best_lap_ms),
  };
}

export function listModels(limit: number) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM models ORDER BY created_at DESC LIMIT ?').all(limit) as DbRow[];
  return {
    items: rows.map(rowToModel),
    next_cursor: null,
  };
}

export function getModel(modelVersion: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM models WHERE model_version = ?').get(modelVersion) as DbRow | undefined;
  if (!row) return null;
  return rowToModel(row);
}

export function getActiveModelVersion(): string | null {
  const db = getDb();
  const row = db.prepare('SELECT state_value FROM app_state WHERE state_key = ?').get('active_model_version') as DbRow | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(String(row.state_value)) as { model_version?: string };
    return parsed.model_version ?? null;
  } catch {
    return null;
  }
}

export function setActiveModelVersion(modelVersion: string): string {
  const db = getDb();
  const found = db.prepare('SELECT model_version FROM models WHERE model_version = ?').get(modelVersion) as DbRow | undefined;
  if (!found) {
    throw new Error('Model not found');
  }
  const now = nowIso();
  db.prepare(`
    INSERT INTO app_state(state_key, state_value, updated_at)
    VALUES ('active_model_version', ?, ?)
    ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value, updated_at = excluded.updated_at
  `).run(JSON.stringify({ model_version: modelVersion }), now);
  return modelVersion;
}

export function listTrainingJobs(limit: number, status?: string) {
  const db = getDb();
  const where = status ? 'WHERE status = ?' : '';
  const rows = status
    ? db.prepare(`SELECT * FROM training_jobs ${where} ORDER BY created_at DESC LIMIT ?`).all(status, limit) as DbRow[]
    : db.prepare(`SELECT * FROM training_jobs ORDER BY created_at DESC LIMIT ?`).all(limit) as DbRow[];
  return {
    items: rows.map(rowToJob),
    next_cursor: null,
  };
}

export function getTrainingJob(jobId: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM training_jobs WHERE job_id = ?').get(jobId) as DbRow | undefined;
  if (!row) return null;
  return rowToJob(row);
}

export function startTrainingJob(payload: StartTrainingJobInput) {
  const db = getDb();
  const jobId = crypto.randomUUID();
  const now = nowIso();
  const dataset = payload.dataset ?? {};
  const manualOnly = dataset.manual_only === true;
  const runRows = manualOnly
    ? db.prepare("SELECT run_id FROM runs WHERE status = 'completed' AND mode = 'manual' ORDER BY created_at ASC").all() as DbRow[]
    : db.prepare("SELECT run_id FROM runs WHERE status = 'completed' ORDER BY created_at ASC").all() as DbRow[];
  const selectedRunIds = runRows.map((r) => String(r.run_id));
  const datasetSnapshot = {
    selected_run_count: selectedRunIds.length,
    selected_run_ids: selectedRunIds,
    manual_only: manualOnly,
    generated_at: now,
  };

  const modelId = crypto.randomUUID();
  const modelVersion = createVersionTag();
  const outputs = {
    model_version: modelVersion,
    selected_run_count: selectedRunIds.length,
    selected_run_ids: selectedRunIds,
  };
  const progress = { stage: 'completed', percent: 100 };

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO training_jobs(job_id, status, config_json, progress_json, outputs_json, selected_run_ids_json, logs_uri, created_at, updated_at)
      VALUES (?, 'succeeded', ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      jobId,
      JSON.stringify({
        dataset,
        hyperparams: payload.hyperparams ?? {},
        export: payload.export ?? {},
        dataset_snapshot: datasetSnapshot,
      }),
      JSON.stringify(progress),
      JSON.stringify(outputs),
      JSON.stringify(selectedRunIds),
      now,
      now,
    );

    db.prepare(`
      INSERT INTO models(
        model_id, model_version, status, architecture_json, training_json,
        pytorch_uri, onnx_uri, openvino_uri, created_at
      ) VALUES (?, ?, 'ready', ?, ?, NULL, NULL, NULL, ?)
    `).run(
      modelId,
      modelVersion,
      JSON.stringify({ type: 'placeholder', input_shape: [1, 3, 120, 160] }),
      JSON.stringify({
        metrics: {
          selected_runs: selectedRunIds.length,
          train_loss: 0.01,
          val_loss: 0.02,
        },
        dataset_snapshot: datasetSnapshot,
      }),
      now,
    );

    if (payload.export?.set_active === true) {
      db.prepare(`
        INSERT INTO app_state(state_key, state_value, updated_at)
        VALUES ('active_model_version', ?, ?)
        ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value, updated_at = excluded.updated_at
      `).run(JSON.stringify({ model_version: modelVersion }), now);
    }
  });

  tx();
  return { job_id: jobId, status: 'succeeded' };
}
