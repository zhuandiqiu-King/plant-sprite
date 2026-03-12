"""AI 对话接口 — 调用通义千问大模型"""
from __future__ import annotations

import json
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.auth import get_current_user
from app.schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/api", tags=["chat"])

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
CHAT_MODEL = "qwen-plus"

# 对话风格映射
STYLE_MAP = {
    "gentle": "温柔贴心、语气柔和，像一个关心家人的好朋友",
    "humorous": "幽默风趣、善用比喻和俏皮话，让人开心",
    "professional": "专业严谨、条理清晰，给出有依据的建议",
    "energetic": "元气满满、充满活力，用积极阳光的语气鼓励用户",
}

# 小动物角色映射
CHARACTER_MAP = {
    "none": "",
    "cat": '你是一只可爱的小猫咪🐱，说话时偶尔会用"喵~"作为语气词，性格温柔慵懒又有点傲娇',
    "rabbit": '你是一只软萌的小兔叽🐰，说话时偶尔会用"叽~"作为语气词，性格活泼可爱又有点害羞',
    "dog": '你是一只忠诚的小狗勾🐶，说话时偶尔会用"汪~"作为语气词，性格热情开朗又很贴心',
    "bear": '你是一只憨厚的小熊仔🐻，说话时偶尔会用"嗯哼~"作为语气词，性格稳重可靠又暖萌',
    "fox": '你是一只聪明的小狐狸🦊，说话时偶尔会用"嘿嘿~"作为语气词，性格机灵有趣又优雅',
    "penguin": '你是一只呆萌的小企鹅🐧，说话时偶尔会用"咕咕~"作为语气词，性格认真负责又有点笨拙可爱',
}

BASE_SYSTEM_PROMPT = """你是"植物精灵"，一个专注家庭生活场景的 AI 助手。你可以回答以下方面的问题：
🌿 植物养护：浇水、施肥、病虫害、光照建议等
🏠 家居清洁：清洁技巧、去污方法、收纳整理等
🐾 宠物护理：喂养、日常护理建议等
🍳 烹饪技巧：食材处理、菜谱建议、厨房小窍门等
🔧 工具使用：本小程序工具箱功能的使用方法（如植物管理工具可以添加植物、设置浇水提醒、拍照识别植物等）

请用简洁友好的中文回复。回复不要太长，控制在 200 字以内。如果用户问的问题超出以上范围，请礼貌地引导回家庭生活话题。"""


def build_system_prompt(user: User) -> str:
    """根据用户偏好构建个性化 system prompt"""
    prompt = BASE_SYSTEM_PROMPT

    # 解析用户偏好
    prefs = {}
    if user.preferences:
        try:
            prefs = json.loads(user.preferences)
        except (json.JSONDecodeError, TypeError):
            pass

    parts = []

    # 对话风格
    style = prefs.get("chat_style", "gentle")
    style_desc = STYLE_MAP.get(style, STYLE_MAP["gentle"])
    parts.append(f"你的对话风格：{style_desc}。")

    # 角色人设
    character = prefs.get("character", "none")
    if character == "custom":
        custom_desc = prefs.get("custom_character", "")
        if custom_desc:
            parts.append(f"你的角色人设：{custom_desc}。")
    else:
        char_desc = CHARACTER_MAP.get(character, "")
        if char_desc:
            parts.append(char_desc)

    # 称呼方式
    nickname = prefs.get("nickname", "")
    if nickname:
        parts.append(f'请称呼用户为"{nickname}"。')

    if parts:
        prompt += "\n\n" + "\n".join(parts)

    return prompt


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, current_user: User = Depends(get_current_user)):
    """AI 对话：发送消息，获取 AI 回复"""
    if not DASHSCOPE_API_KEY:
        raise HTTPException(status_code=500, detail="AI 服务未配置")

    system_prompt = build_system_prompt(current_user)

    # 调用通义千问 API（兼容 OpenAI 格式）
    import httpx

    url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": CHAT_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": req.message},
        ],
        "max_tokens": 500,
        "temperature": 0.8,
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload, headers=headers)
            data = resp.json()

        if "choices" not in data or not data["choices"]:
            raise HTTPException(status_code=500, detail="AI 回复异常，请稍后再试")

        reply = data["choices"][0]["message"]["content"]
        return ChatResponse(reply=reply)

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="AI 回复超时，请稍后再试")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(status_code=500, detail="AI 服务异常，请稍后再试")
