import json
import os
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.schemas import PlantCreate, PlantUpdate, PlantOut
from app.models import User, FamilyMember
from app.auth import get_current_user
from app import crud

router = APIRouter(prefix="/api/plants", tags=["plants"])


def _get_family_id(current_user: User) -> int | None:
    """获取当前用户的活跃家庭 ID，没有家庭返回 None"""
    return current_user.current_family_id


def _get_family_role(db: Session, family_id: int, user_id: int) -> str:
    """获取用户在家庭中的角色"""
    member = db.scalars(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id,
            FamilyMember.user_id == user_id,
        )
    ).first()
    return member.role if member else "member"


# ---- 名称重复检查 ----

@router.get("/check-name")
def check_name(
    name: str,
    exclude_id: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """检查植物名称是否已存在（当前家庭范围内）"""
    family_id = _get_family_id(current_user)
    exists = crud.check_plant_name(db, name.strip(), family_id=family_id, exclude_id=exclude_id)
    return {"exists": exists}


# ---- 拍照识别植物 ----

class IdentifyRequest(BaseModel):
    image: str  # base64 编码的图片


class IdentifyResponse(BaseModel):
    name: str
    watering_interval: int
    category: str
    description: str
    care_tips: str


@router.post("/identify", response_model=IdentifyResponse)
def identify_plant(req: IdentifyRequest):
    """拍照识别植物：接收 base64 图片，调用通义千问 VL 返回植物信息"""
    api_key = os.getenv("DASHSCOPE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="未配置 DASHSCOPE_API_KEY 环境变量，请先设置后重试",
        )

    from openai import OpenAI

    client = OpenAI(
        api_key=api_key,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )

    # 确保 base64 带有 data URI 前缀
    image_data = req.image
    if not image_data.startswith("data:"):
        image_data = f"data:image/jpeg;base64,{image_data}"

    try:
        resp = client.chat.completions.create(
            model="qwen-vl-plus",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": image_data},
                        },
                        {
                            "type": "text",
                            "text": (
                                "请识别这张图片中的植物，返回 JSON 格式（不要用 markdown 代码块包裹），字段如下：\n"
                                '- "name": 植物中文名称\n'
                                '- "watering_interval": 建议浇水间隔天数（整数）\n'
                                '- "category": 分类，只能是 "indoor" 或 "outdoor"\n'
                                '- "description": 植物简介，2-3句话介绍品种和外观特征\n'
                                '- "care_tips": 结构化养护建议，格式为 "- 光照：xxx\\n- 温度：xxx\\n- 湿度：xxx\\n- 施肥：xxx\\n- 土壤：xxx\\n- 注意：xxx"\n'
                                "只返回 JSON，不要其他内容。"
                            ),
                        },
                    ],
                }
            ],
        )
        content = resp.choices[0].message.content.strip()
        # 尝试从返回内容中提取 JSON（兼容模型返回 markdown 代码块的情况）
        json_match = re.search(r"\{.*\}", content, re.DOTALL)
        if not json_match:
            raise ValueError(f"AI 返回内容无法解析为 JSON: {content}")
        result = json.loads(json_match.group())

        return IdentifyResponse(
            name=result.get("name", "未知植物"),
            watering_interval=int(result.get("watering_interval", 7)),
            category=result.get("category", "indoor") if result.get("category") in ("indoor", "outdoor") else "indoor",
            description=result.get("description", ""),
            care_tips=result.get("care_tips", ""),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"识别失败：{str(e)}")


@router.post("", response_model=PlantOut, status_code=201)
def add_plant(data: PlantCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    family_id = _get_family_id(current_user)
    return crud.create_plant(db, data, user_id=current_user.id, family_id=family_id, created_by=current_user.id)


@router.get("", response_model=list[PlantOut])
def list_plants(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    family_id = _get_family_id(current_user)
    return crud.get_plants(db, family_id=family_id)


@router.get("/{plant_id}", response_model=PlantOut)
def get_plant(plant_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    family_id = _get_family_id(current_user)
    plant = crud.get_plant(db, plant_id, family_id=family_id)
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return plant


@router.put("/{plant_id}", response_model=PlantOut)
def update_plant(plant_id: int, data: PlantUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    family_id = _get_family_id(current_user)
    plant = crud.get_plant(db, plant_id, family_id=family_id)
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return crud.update_plant(db, plant, data)


@router.delete("/{plant_id}", status_code=204)
def delete_plant(plant_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    family_id = _get_family_id(current_user)
    plant = crud.get_plant(db, plant_id, family_id=family_id)
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    # 权限检查：仅管理员或植物添加者可删除
    role = _get_family_role(db, family_id, current_user.id)
    if role != "admin" and plant.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="只有管理员或植物添加者才能删除")
    crud.delete_plant(db, plant)
