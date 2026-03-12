from __future__ import annotations

from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field
from enum import Enum


class CategoryEnum(str, Enum):
    indoor = "indoor"
    outdoor = "outdoor"


# --- Plant schemas ---

class PlantCreate(BaseModel):
    name: str = Field(..., max_length=100, examples=["绿萝"])
    watering_interval: int = Field(..., gt=0, le=365, examples=[7])
    category: CategoryEnum = CategoryEnum.indoor
    note: Optional[str] = None
    photo_url: Optional[str] = None


class PlantUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    watering_interval: Optional[int] = Field(None, gt=0, le=365)
    category: Optional[CategoryEnum] = None
    note: Optional[str] = None
    photo_url: Optional[str] = None


class PlantOut(BaseModel):
    id: int
    name: str
    watering_interval: int
    category: str
    note: Optional[str]
    photo_url: Optional[str]
    next_watering_date: date
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- WateringRecord schemas ---

class WateringRecordOut(BaseModel):
    id: int
    plant_id: int
    watered_at: datetime

    model_config = {"from_attributes": True}


# --- Auth schemas ---

class WxLoginRequest(BaseModel):
    code: str
    nickname: str = ""
    avatar_url: Optional[str] = None


class UserOut(BaseModel):
    id: int
    nickname: str
    avatar_url: Optional[str]

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    token: str
    user: UserOut
