from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


RunMode = Literal["manual", "autonomous"]


class CreateRunRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=120)
    track_id: str = Field(min_length=1, max_length=120)
    mode: RunMode
    model_version: Optional[str] = None
    sim_build: str = ""
    client_build: str = ""
    notes: Optional[str] = None
    local_run_id: Optional[str] = None
    started_at: Optional[str] = None


class CreateRunResponse(BaseModel):
    run_id: str
    upload_urls: dict[str, str]


class FinalizeRunRequest(BaseModel):
    ended_at: Optional[str] = None
    duration_s: Optional[float] = None
    frame_count: Optional[int] = None
    lap_count: Optional[int] = None
    off_track_count: Optional[int] = None
    best_lap_ms: Optional[float] = None


class FinalizeRunResponse(BaseModel):
    status: Literal["complete"]
    run_id: str


class RunArtifacts(BaseModel):
    frames_uri: Optional[str] = None
    controls_uri: Optional[str] = None
    run_json_uri: Optional[str] = None


class RunRecord(BaseModel):
    run_id: str
    user_id: str
    track_id: str
    mode: RunMode
    model_version: Optional[str] = None
    sim_build: str
    client_build: str
    notes: Optional[str] = None
    local_run_id: Optional[str] = None
    status: str
    started_at: str
    ended_at: Optional[str] = None
    duration_s: Optional[float] = None
    frame_count: int
    lap_count: int
    off_track_count: int
    best_lap_ms: Optional[float] = None
    artifacts: RunArtifacts
    created_at: str


class ListRunsResponse(BaseModel):
    items: list[RunRecord]
    next_cursor: Optional[str] = None


class RunsSummaryResponse(BaseModel):
    completed_runs: int
    completed_laps: int
    completed_frames: int


class ModelRecord(BaseModel):
    model_id: str
    model_version: str
    status: str
    created_at: str
    architecture: dict = Field(default_factory=dict)
    training: dict = Field(default_factory=dict)
    artifacts: dict = Field(default_factory=dict)


class ListModelsResponse(BaseModel):
    items: list[ModelRecord]
    next_cursor: Optional[str] = None


class CreateModelRequest(BaseModel):
    model_version: str
    status: str = "ready"
    architecture: dict = Field(default_factory=dict)
    training: dict = Field(default_factory=dict)
    artifacts: dict = Field(default_factory=dict)


class SetActiveModelRequest(BaseModel):
    model_version: str


class ActiveModelResponse(BaseModel):
    active_model_version: Optional[str] = None


class StartTrainingJobRequest(BaseModel):
    dataset: dict = Field(default_factory=dict)
    hyperparams: dict = Field(default_factory=dict)
    export: dict = Field(default_factory=dict)


class StartTrainingJobResponse(BaseModel):
    job_id: str
    status: str


class TrainingJobRecord(BaseModel):
    job_id: str
    status: str
    created_at: str
    config: dict = Field(default_factory=dict)
    progress: dict = Field(default_factory=dict)
    outputs: dict = Field(default_factory=dict)
    logs_uri: Optional[str] = None


class ListTrainingJobsResponse(BaseModel):
    items: list[TrainingJobRecord]
    next_cursor: Optional[str] = None


class UpdateTrainingJobRequest(BaseModel):
    status: Optional[str] = None
    progress: Optional[dict] = None
    output_model_version: Optional[str] = None
    logs_uri: Optional[str] = None
