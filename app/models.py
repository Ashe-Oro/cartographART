from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class ThemeInfo(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    bg: str
    text: str


class ThemesResponse(BaseModel):
    themes: List[ThemeInfo]


class PosterRequest(BaseModel):
    city: str = Field(..., min_length=1, max_length=100, examples=["Tokyo"])
    state: Optional[str] = Field(default=None, max_length=100, examples=["Virginia"])
    country: str = Field(..., min_length=1, max_length=100, examples=["Japan"])
    theme: str = Field(default="feature_based", examples=["noir"])
    distance: int = Field(default=10000, ge=3000, le=50000)


class JobStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    progress: int = 0
    message: Optional[str] = None
    error: Optional[str] = None
    download_url: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "ok"
