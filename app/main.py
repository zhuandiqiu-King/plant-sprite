from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.database import engine, Base
from app.routers import plants, watering, auth, chat, user

# 创建数据库表
Base.metadata.create_all(bind=engine)

# 自动迁移：为已有表补充新字段
with engine.connect() as conn:
    plant_cols = [col["name"] for col in inspect(engine).get_columns("plants")]
    if "photo_url" not in plant_cols:
        conn.execute(text("ALTER TABLE plants ADD COLUMN photo_url TEXT"))
        conn.commit()
    user_cols = [col["name"] for col in inspect(engine).get_columns("users")]
    if "preferences" not in user_cols:
        conn.execute(text("ALTER TABLE users ADD COLUMN preferences TEXT"))
        conn.commit()

app = FastAPI(title="夯夯家", description="家庭生活助手服务", version="2.0.0")

app.include_router(auth.router)
app.include_router(plants.router)
app.include_router(watering.router)
app.include_router(chat.router)
app.include_router(user.router)

# 静态文件目录
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def root():
    """返回 H5 交互页面"""
    return FileResponse(STATIC_DIR / "index.html")
