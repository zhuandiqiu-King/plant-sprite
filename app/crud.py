from __future__ import annotations

from datetime import date, timedelta, datetime
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.models import Plant, WateringRecord
from app.schemas import PlantCreate, PlantUpdate


def create_plant(db: Session, data: PlantCreate, user_id: int | None = None) -> Plant:
    """添加植物，next_watering_date = 今天 + interval"""
    plant = Plant(
        name=data.name,
        watering_interval=data.watering_interval,
        category=data.category.value,
        note=data.note,
        photo_url=data.photo_url,
        next_watering_date=date.today() + timedelta(days=data.watering_interval),
        user_id=user_id,
    )
    db.add(plant)
    db.commit()
    db.refresh(plant)
    return plant


def get_plants(db: Session, user_id: int | None = None) -> List[Plant]:
    """获取植物列表，按 user_id 过滤"""
    stmt = select(Plant).order_by(Plant.next_watering_date)
    if user_id is not None:
        stmt = stmt.where(Plant.user_id == user_id)
    return list(db.scalars(stmt).all())


def get_plant(db: Session, plant_id: int, user_id: int | None = None) -> Optional[Plant]:
    """获取单个植物，验证归属"""
    plant = db.get(Plant, plant_id)
    if plant and user_id is not None and plant.user_id != user_id:
        return None
    return plant


def update_plant(db: Session, plant: Plant, data: PlantUpdate) -> Plant:
    """编辑植物信息；若修改了 interval，则重新计算 next_watering_date"""
    update_data = data.model_dump(exclude_unset=True)
    if "category" in update_data and update_data["category"] is not None:
        update_data["category"] = update_data["category"].value

    old_interval = plant.watering_interval
    for key, val in update_data.items():
        setattr(plant, key, val)

    # interval 变化时重算下次浇水日期
    if "watering_interval" in update_data and update_data["watering_interval"] != old_interval:
        plant.next_watering_date = date.today() + timedelta(days=plant.watering_interval)

    db.commit()
    db.refresh(plant)
    return plant


def delete_plant(db: Session, plant: Plant) -> None:
    db.delete(plant)
    db.commit()


def water_plant(db: Session, plant: Plant) -> WateringRecord:
    """浇水打卡：更新 next_watering_date 并记录"""
    plant.next_watering_date = date.today() + timedelta(days=plant.watering_interval)
    record = WateringRecord(plant_id=plant.id, watered_at=datetime.now())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_reminders(db: Session, user_id: int | None = None) -> List[Plant]:
    """获取今天及逾期需要浇水的植物"""
    stmt = select(Plant).where(Plant.next_watering_date <= date.today()).order_by(
        Plant.next_watering_date
    )
    if user_id is not None:
        stmt = stmt.where(Plant.user_id == user_id)
    return list(db.scalars(stmt).all())


def get_watering_records(db: Session, plant_id: int) -> List[WateringRecord]:
    """获取某植物的浇水历史"""
    stmt = (
        select(WateringRecord)
        .where(WateringRecord.plant_id == plant_id)
        .order_by(WateringRecord.watered_at.desc())
    )
    return list(db.scalars(stmt).all())
