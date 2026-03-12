from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.database import engine, Base
from app.routers import plants, watering, auth

# 创建数据库表
Base.metadata.create_all(bind=engine)

# 自动迁移：为已有表补充新字段
with engine.connect() as conn:
    columns = [col["name"] for col in inspect(engine).get_columns("plants")]
    if "photo_url" not in columns:
        conn.execute(text("ALTER TABLE plants ADD COLUMN photo_url VARCHAR(500)"))
        conn.commit()

app = FastAPI(title="Plant Sprite", description="植物浇水提醒服务", version="1.0.0")

app.include_router(auth.router)
app.include_router(plants.router)
app.include_router(watering.router)

# 静态文件目录
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def root():
    """返回 H5 交互页面"""
    return FileResponse(STATIC_DIR / "index.html")
