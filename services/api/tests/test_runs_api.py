from __future__ import annotations

import io
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def make_client(tmp_path: Path) -> TestClient:
    settings = Settings(
        database_path=tmp_path / "data" / "app.db",
        storage_root=tmp_path / "storage",
        cors_origins=("http://localhost:3000",),
    )
    app = create_app(settings)
    return TestClient(app)


def test_runs_create_upload_finalize_list_get(tmp_path: Path) -> None:
    with make_client(tmp_path) as client:
        create_res = client.post(
            "/api/runs",
            json={
                "user_id": "student-1",
                "track_id": "oval",
                "mode": "manual",
                "sim_build": "sim-local",
                "client_build": "ui-local",
                "local_run_id": "local-abc",
            },
        )
        assert create_res.status_code == 200, create_res.text
        created = create_res.json()
        run_id = created["run_id"]
        assert created["upload_urls"]["frames"].endswith(f"/api/runs/{run_id}/frames")
        assert created["upload_urls"]["controls"].endswith(f"/api/runs/{run_id}/controls")

        # Minimal zip payload representing captured frames
        frames_zip = io.BytesIO()
        with zipfile.ZipFile(frames_zip, "w") as zf:
            zf.writestr("frames/000000.jpg", b"fake-jpeg")
            zf.writestr("run.json", '{"track_id":"oval"}')

        frames_res = client.post(
            f"/api/runs/{run_id}/frames",
            files={"file": ("frames.zip", frames_zip.getvalue(), "application/zip")},
        )
        assert frames_res.status_code == 200, frames_res.text

        controls_res = client.post(
            f"/api/runs/{run_id}/controls",
            files={"file": ("controls.csv", b"frame_idx,timestamp_ms,steering,throttle,speed\n0,0,0.1,0.5,2.0\n", "text/csv")},
        )
        assert controls_res.status_code == 200, controls_res.text

        finalize_res = client.post(
            f"/api/runs/{run_id}/finalize",
            json={
                "duration_s": 12.3,
                "frame_count": 1,
                "lap_count": 2,
                "off_track_count": 0,
                "best_lap_ms": 4567.8,
            },
        )
        assert finalize_res.status_code == 200, finalize_res.text
        assert finalize_res.json()["status"] == "complete"

        get_res = client.get(f"/api/runs/{run_id}")
        assert get_res.status_code == 200, get_res.text
        run = get_res.json()
        assert run["status"] == "complete"
        assert run["frame_count"] == 1
        assert run["lap_count"] == 2
        assert run["artifacts"]["frames_uri"].endswith("/frames.zip")
        assert run["artifacts"]["controls_uri"].endswith("/controls.csv")
        assert run["artifacts"]["run_json_uri"].endswith("/run.json")

        list_res = client.get("/api/runs", params={"track_id": "oval", "user_id": "student-1"})
        assert list_res.status_code == 200, list_res.text
        items = list_res.json()["items"]
        assert len(items) == 1
        assert items[0]["run_id"] == run_id

        summary_res = client.get("/api/runs/summary")
        assert summary_res.status_code == 200, summary_res.text
        summary = summary_res.json()
        assert summary["completed_runs"] == 1
        assert summary["completed_laps"] == 2
        assert summary["completed_frames"] == 1

        artifact_frames_res = client.get(f"/api/runs/{run_id}/artifacts/frames")
        assert artifact_frames_res.status_code == 200
        assert artifact_frames_res.headers["content-type"].startswith("application/zip")

        artifact_controls_res = client.get(f"/api/runs/{run_id}/artifacts/controls")
        assert artifact_controls_res.status_code == 200
        assert b"frame_idx" in artifact_controls_res.content

        stored_frames = (tmp_path / "storage" / "runs" / run_id / "frames.zip")
        stored_controls = (tmp_path / "storage" / "runs" / run_id / "controls.csv")
        stored_run_json = (tmp_path / "storage" / "runs" / run_id / "run.json")
        assert stored_frames.exists()
        assert stored_controls.exists()
        assert stored_run_json.exists()


def test_finalize_requires_artifacts(tmp_path: Path) -> None:
    with make_client(tmp_path) as client:
        run_id = client.post(
            "/api/runs",
            json={
                "user_id": "student-2",
                "track_id": "oval",
                "mode": "manual",
                "sim_build": "sim-local",
                "client_build": "ui-local",
            },
        ).json()["run_id"]

        finalize_res = client.post(f"/api/runs/{run_id}/finalize", json={})
        assert finalize_res.status_code == 400
        assert "Required artifacts missing" in finalize_res.text


def test_models_and_training_job_endpoints_scaffold(tmp_path: Path) -> None:
    with make_client(tmp_path) as client:
        models_res = client.get("/api/models")
        assert models_res.status_code == 200
        assert models_res.json()["items"] == []

        create_model_res = client.post(
            "/api/models",
            json={
                "model_version": "v0001",
                "status": "ready",
                "architecture": {"type": "cnn_regression"},
                "training": {"frames_total": 100},
                "artifacts": {"onnx_uri": "/models/v0001/model.onnx"},
            },
        )
        assert create_model_res.status_code == 200, create_model_res.text
        assert create_model_res.json()["model_version"] == "v0001"

        get_model_res = client.get("/api/models/v0001")
        assert get_model_res.status_code == 200
        assert get_model_res.json()["artifacts"]["onnx_uri"] == "/models/v0001/model.onnx"

        active_res = client.get("/api/models/active")
        assert active_res.status_code == 200
        assert active_res.json()["active_model_version"] is None

        set_active_res = client.post("/api/models/active", json={"model_version": "v0001"})
        assert set_active_res.status_code == 200
        assert set_active_res.json()["active_model_version"] == "v0001"

        job_res = client.post(
            "/api/train/jobs",
            json={
                "dataset": {"track_ids": ["oval"], "modes": ["manual"]},
                "hyperparams": {"epochs": 2},
                "export": {"onnx": True},
            },
        )
        assert job_res.status_code == 200, job_res.text
        job = job_res.json()
        assert job["status"] == "queued"

        job_get_res = client.get(f"/api/train/jobs/{job['job_id']}")
        assert job_get_res.status_code == 200, job_get_res.text
        job_detail = job_get_res.json()
        assert job_detail["status"] == "queued"
        assert job_detail["config"]["dataset"]["track_ids"] == ["oval"]

        list_jobs_res = client.get("/api/train/jobs", params={"status": "queued"})
        assert list_jobs_res.status_code == 200
        assert len(list_jobs_res.json()["items"]) == 1

        update_job_res = client.post(
            f"/api/train/jobs/{job['job_id']}/update",
            json={"status": "running", "progress": {"epoch": 1, "epochs": 5}},
        )
        assert update_job_res.status_code == 200
        assert update_job_res.json()["status"] == "running"
        assert update_job_res.json()["progress"]["epoch"] == 1
