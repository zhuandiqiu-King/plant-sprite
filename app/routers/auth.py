"""微信登录相关接口"""
from __future__ import annotations

import os
import random
import time

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import WxLoginRequest, LoginResponse, UserOut
from app.auth import wx_code2session, create_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

# 动物 emoji + 名称，用于生成默认头像和昵称
ANIMAL_POOL = [
    ("🐱", "猫咪"), ("🐰", "兔兔"), ("🐶", "柴犬"), ("🐼", "熊猫"),
    ("🦊", "狐狸"), ("🐧", "企鹅"), ("🐨", "考拉"), ("🦦", "水獭"),
    ("🐹", "仓鼠"), ("🦔", "刺猬"),
]
ADJ_POOL = ["快乐", "可爱", "元气", "呆萌", "活泼", "勇敢", "温柔", "开心"]


def _generate_unique_nickname(db: Session) -> tuple[str, str]:
    """生成全局唯一的默认昵称，返回 (昵称, 对应动物emoji)"""
    for _ in range(10):
        emoji, animal = random.choice(ANIMAL_POOL)
        adj = random.choice(ADJ_POOL)
        num = random.randint(1000, 9999)
        nickname = f"{adj}{animal}{num}"
        exists = db.scalars(select(User).where(User.nickname == nickname)).first()
        if not exists:
            return nickname, emoji
    # 极端情况：加时间戳保证唯一
    emoji, animal = random.choice(ANIMAL_POOL)
    return f"{animal}{int(time.time()) % 100000}", emoji


@router.post("/login", response_model=LoginResponse)
async def login(req: WxLoginRequest, db: Session = Depends(get_db)):
    """微信登录：code → openid → 查/创建用户 → 返回 JWT"""
    if not os.getenv("WX_APPID") or not os.getenv("WX_SECRET"):
        openid = f"dev_{req.code}"
    else:
        openid = await wx_code2session(req.code)

    # 查找或创建用户
    user = db.scalars(select(User).where(User.openid == openid)).first()
    is_new = user is None

    if is_new:
        nickname = req.nickname
        avatar_url = req.avatar_url
        # 自动生成默认昵称和头像
        if not nickname:
            nickname, emoji = _generate_unique_nickname(db)
            if not avatar_url:
                avatar_url = f"emoji:{emoji}"
        user = User(openid=openid, nickname=nickname, avatar_url=avatar_url)
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        if req.nickname:
            user.nickname = req.nickname
        if req.avatar_url:
            user.avatar_url = req.avatar_url
        db.commit()
        db.refresh(user)

    token = create_token(user.id)
    return LoginResponse(
        token=token,
        user=UserOut.model_validate(user),
        is_new_user=is_new,
    )


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return current_user
