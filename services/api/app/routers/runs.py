from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse

from app.schemas import (
    CreateRunRequest,
    CreateRunResponse,
    FinalizeRunRequest,
    FinalizeRunResponse,
    ListRunsResponse,
    RunsSummaryResponse,
    RunArtifacts,
    RunRecord,
)


router = APIRouter(prefix="/api/runs", tags=["runs"])


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_conn(request: Request) -> sqlite3.Connection:
    return request.app.state.db


def get_storage(request: Request):
    return request.app.state.storage


def row_to_run_record(row: sqlite3.Row) -> RunRecord:
    return RunRecord(
        run_id=row["run_id"],
        user_id=row["user_id"],
        track_id=row["track_id"],
        mode=row["mode"],
        model_version=row["model_version"],
        sim_build=row["sim_build"] or "",
        client_build=row["client_build"] or "",
        notes=row["notes"],
        local_run_id=row["local_run_id"],
        status=row["status"],
        started_at=row["started_at"],
        ended_at=row["ended_at"],
        duration_s=row["duration_s"],
        frame_count=row["frame_count"] or 0,
        lap_count=row["lap_count"] or 0,
        off_track_count=row["off_track_count"] or 0,
        best_lap_ms=row["best_lap_ms"],
        artifacts=RunArtifacts(
            frames_uri=row["frames_uri"],
            controls_uri=row["controls_uri"],
            run_json_uri=row["run_json_uri"],
        ),
        created_at=row["created_at"],
    )


def _require_run(conn: sqlite3.Connection, run_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Run not found")
    return row


@router.post("", response_model=CreateRunResponse)
def create_run(payload: CreateRunRequest, request: Request, conn: sqlite3.Connection = Depends(get_conn)) -> CreateRunResponse:
    now = utc_now_iso()
    run_id = str(uuid.uuid4())
    conn.execute(
        """
        INSERT INTO runs (
            run_id, user_id, track_id, mode, model_version, sim_build, client_build, notes,
            local_run_id, status, started_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'uploading', ?, ?)
        """,
        (
            run_id,
            payload.user_id,
            payload.track_id,
            payload.mode,
            payload.model_version,
            payload.sim_build,
            payload.client_build,
            payload.notes,
            payload.local_run_id,
            payload.started_at or now,
            now,
        ),
    )
    conn.commit()

    base = str(request.base_url).rstrip("/")
    return CreateRunResponse(
        run_id=run_id,
        upload_urls={
            "frames": f"{base}/api/runs/{run_id}/frames",
            "controls": f"{base}/api/runs/{run_id}/controls",
        },
    )


@router.post("/{run_id}/frames")
async def upload_frames(
    run_id: str,
    file: UploadFile = File(...),
    conn: sqlite3.Connection = Depends(get_conn),
    storage=Depends(get_storage),
) -> dict[str, Any]:
    _require_run(conn, run_id)
    contents = await file.read()
    uri = storage.save_run_artifact(run_id, "frames.zip", contents)
    conn.execute("UPDATE runs SET frames_uri = ? WHERE run_id = ?", (uri, run_id))
    conn.commit()
    return {"status": "ok", "run_id": run_id, "frames_uri": uri, "bytes": len(contents)}


@router.post("/{run_id}/controls")
async def upload_controls(
    run_id: str,
    file: UploadFile = File(...),
    conn: sqlite3.Connection = Depends(get_conn),
    storage=Depends(get_storage),
) -> dict[str, Any]:
    _require_run(conn, run_id)
    contents = await file.read()
    uri = storage.save_run_artifact(run_id, "controls.csv", contents)
    conn.execute("UPDATE runs SET controls_uri = ? WHERE run_id = ?", (uri, run_id))
    conn.commit()
    return {"status": "ok", "run_id": run_id, "controls_uri": uri, "bytes": len(contents)}


@router.post("/{run_id}/finalize", response_model=FinalizeRunResponse)
def finalize_run(
    run_id: str,
    payload: FinalizeRunRequest,
    conn: sqlite3.Connection = Depends(get_conn),
    storage=Depends(get_storage),
) -> FinalizeRunResponse:
    row = _require_run(conn, run_id)
    if not row["frames_uri"] or not row["controls_uri"]:
        raise HTTPException(status_code=400, detail="Required artifacts missing: frames and controls must be uploaded before finalize")

    ended_at = payload.ended_at or utc_now_iso()
    duration_s = payload.duration_s
    frame_count = payload.frame_count if payload.frame_count is not None else (row["frame_count"] or 0)
    lap_count = payload.lap_count if payload.lap_count is not None else (row["lap_count"] or 0)
    off_track_count = payload.off_track_count if payload.off_track_count is not None else (row["off_track_count"] or 0)
    best_lap_ms = payload.best_lap_ms if payload.best_lap_ms is not None else row["best_lap_ms"]

    run_json_uri = storage.save_run_artifact(
        run_id,
        "run.json",
        json.dumps(
            {
                "run_id": run_id,
                "status": "complete",
                "ended_at": ended_at,
                "duration_s": duration_s,
                "frame_count": frame_count,
                "lap_count": lap_count,
                "off_track_count": off_track_count,
                "best_lap_ms": best_lap_ms,
            },
            indent=2,
        ).encode("utf-8"),
    )

    conn.execute(
        """
        UPDATE runs
        SET status='complete', ended_at=?, duration_s=?, frame_count=?, lap_count=?, off_track_count=?, best_lap_ms=?, run_json_uri=?
        WHERE run_id=?
        """,
        (ended_at, duration_s, frame_count, lap_count, off_track_count, best_lap_ms, run_json_uri, run_id),
    )
    conn.commit()
    return FinalizeRunResponse(status="complete", run_id=run_id)


@router.get("", response_model=ListRunsResponse)
def list_runs(
    conn: sqlite3.Connection = Depends(get_conn),
    track_id: Optional[str] = None,
    mode: Optional[str] = None,
    user_id: Optional[str] = None,
    model_version: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = None,
) -> ListRunsResponse:
    clauses: list[str] = []
    params: list[Any] = []
    if track_id:
        clauses.append("track_id = ?")
        params.append(track_id)
    if mode:
        clauses.append("mode = ?")
        params.append(mode)
    if user_id:
        clauses.append("user_id = ?")
        params.append(user_id)
    if model_version:
        clauses.append("model_version = ?")
        params.append(model_version)
    if cursor:
        clauses.append("created_at < ?")
        params.append(cursor)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"SELECT * FROM runs {where} ORDER BY created_at DESC LIMIT ?"
    params.append(limit + 1)
    rows = conn.execute(query, params).fetchall()

    next_cursor = None
    if len(rows) > limit:
        next_cursor = rows[limit - 1]["created_at"]
        rows = rows[:limit]

    return ListRunsResponse(items=[row_to_run_record(row) for row in rows], next_cursor=next_cursor)


@router.get("/summary", response_model=RunsSummaryResponse)
def get_runs_summary(
    conn: sqlite3.Connection = Depends(get_conn),
    track_id: Optional[str] = None,
    mode: Optional[str] = None,
    user_id: Optional[str] = None,
    model_version: Optional[str] = None,
) -> RunsSummaryResponse:
    clauses: list[str] = ["status = 'complete'"]
    params: list[Any] = []
    if track_id:
        clauses.append("track_id = ?")
        params.append(track_id)
    if mode:
        clauses.append("mode = ?")
        params.append(mode)
    if user_id:
        clauses.append("user_id = ?")
        params.append(user_id)
    if model_version:
        clauses.append("model_version = ?")
        params.append(model_version)

    where = f"WHERE {' AND '.join(clauses)}"
    row = conn.execute(
        f"""
        SELECT
            COUNT(*) AS completed_runs,
            COALESCE(SUM(lap_count), 0) AS completed_laps,
            COALESCE(SUM(frame_count), 0) AS completed_frames
        FROM runs
        {where}
        """,
        params,
    ).fetchone()
    assert row is not None
    return RunsSummaryResponse(
        completed_runs=int(row["completed_runs"] or 0),
        completed_laps=int(row["completed_laps"] or 0),
        completed_frames=int(row["completed_frames"] or 0),
    )


@router.get("/{run_id}", response_model=RunRecord)
def get_run(run_id: str, conn: sqlite3.Connection = Depends(get_conn)) -> RunRecord:
    row = _require_run(conn, run_id)
    return row_to_run_record(row)


@router.get("/{run_id}/artifacts/{artifact_kind}")
def download_run_artifact(
    run_id: str,
    artifact_kind: str,
    conn: sqlite3.Connection = Depends(get_conn),
):
    row = _require_run(conn, run_id)
    key_map = {
        "frames": "frames_uri",
        "controls": "controls_uri",
        "run-json": "run_json_uri",
    }
    column = key_map.get(artifact_kind)
    if not column:
        raise HTTPException(status_code=404, detail="Artifact kind not found")

    artifact_path = row[column]
    if not artifact_path:
        raise HTTPException(status_code=404, detail="Artifact not uploaded")
    if not os.path.exists(artifact_path):
        raise HTTPException(status_code=404, detail="Artifact file missing on server")

    media_type = {
        "frames": "application/zip",
        "controls": "text/csv",
        "run-json": "application/json",
    }[artifact_kind]
    filename = os.path.basename(artifact_path)
    return FileResponse(path=artifact_path, media_type=media_type, filename=filename)
