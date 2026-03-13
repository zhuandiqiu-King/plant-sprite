"""家庭组管理接口"""
from __future__ import annotations

import random
import string
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Family, FamilyMember, User
from app.schemas import (
    FamilyCreate, FamilyOut, FamilyDetailOut, FamilyMemberOut,
    InviteOut, JoinFamilyRequest, SwitchFamilyRequest, TransferAdminRequest,
)
from app.auth import get_current_user

router = APIRouter(prefix="/api/family", tags=["family"])


# ---- 工具函数 ----

def _require_membership(db: Session, family_id: int, user_id: int) -> FamilyMember:
    """校验用户是否为该家庭成员，返回成员记录"""
    member = db.scalars(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id,
            FamilyMember.user_id == user_id,
        )
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="你不是该家庭的成员")
    return member


def _require_admin(db: Session, family_id: int, user_id: int) -> FamilyMember:
    """校验用户是否为该家庭管理员"""
    member = _require_membership(db, family_id, user_id)
    if member.role != "admin":
        raise HTTPException(status_code=403, detail="只有管理员才能执行此操作")
    return member


def _build_family_out(db: Session, family: Family, user_id: int) -> FamilyOut:
    """构建 FamilyOut，含 member_count 和 my_role"""
    count = db.scalar(
        select(func.count()).where(FamilyMember.family_id == family.id)
    )
    member = db.scalars(
        select(FamilyMember).where(
            FamilyMember.family_id == family.id,
            FamilyMember.user_id == user_id,
        )
    ).first()
    return FamilyOut(
        id=family.id,
        name=family.name,
        is_personal=family.is_personal,
        created_at=family.created_at,
        member_count=count or 0,
        my_role=member.role if member else "member",
    )


def _generate_code(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=length))


def _get_first_family_id(db: Session, user_id: int, exclude_id: int = None) -> int | None:
    """获取用户的第一个家庭 ID（排除指定的）"""
    stmt = select(FamilyMember.family_id).where(FamilyMember.user_id == user_id)
    if exclude_id:
        stmt = stmt.where(FamilyMember.family_id != exclude_id)
    row = db.scalars(stmt).first()
    return row


# ---- 固定路径接口（必须在动态路径 /{family_id} 之前） ----

@router.post("", response_model=FamilyOut)
def create_family(
    req: FamilyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """搭一个夯夯家"""
    fam = Family(name=req.name, created_by=current_user.id)
    db.add(fam)
    db.flush()
    db.add(FamilyMember(family_id=fam.id, user_id=current_user.id, role="admin"))
    # 如果用户还没有当前家庭，自动设为当前
    if not current_user.current_family_id:
        current_user.current_family_id = fam.id
    db.commit()
    db.refresh(fam)
    return _build_family_out(db, fam, current_user.id)


@router.get("", response_model=list[FamilyOut])
def list_families(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取当前用户的所有家庭"""
    memberships = db.scalars(
        select(FamilyMember).where(FamilyMember.user_id == current_user.id)
    ).all()
    result = []
    for m in memberships:
        fam = db.get(Family, m.family_id)
        if fam:
            result.append(_build_family_out(db, fam, current_user.id))
    return result


@router.put("/switch", response_model=FamilyOut)
def switch_family(
    req: SwitchFamilyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """切换当前家庭"""
    _require_membership(db, req.family_id, current_user.id)
    current_user.current_family_id = req.family_id
    db.commit()
    fam = db.get(Family, req.family_id)
    return _build_family_out(db, fam, current_user.id)


@router.post("/join", response_model=FamilyOut)
def join_family(
    req: JoinFamilyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """通过邀请码加入家庭"""
    fam = db.scalars(
        select(Family).where(Family.invite_code == req.invite_code)
    ).first()
    if not fam:
        raise HTTPException(status_code=400, detail="邀请码无效，请联系家庭管理员重新邀请")
    if fam.invite_expires_at and fam.invite_expires_at < datetime.now():
        raise HTTPException(status_code=400, detail="邀请码已过期，请联系管理员重新生成")

    # 检查是否已是成员
    existing = db.scalars(
        select(FamilyMember).where(
            FamilyMember.family_id == fam.id,
            FamilyMember.user_id == current_user.id,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="你已经是这个家庭的成员了")

    db.add(FamilyMember(family_id=fam.id, user_id=current_user.id, role="member"))
    # 自动切换到新家庭
    current_user.current_family_id = fam.id
    db.commit()
    return _build_family_out(db, fam, current_user.id)


# ---- 动态路径接口 /{family_id} ----

@router.get("/{family_id}", response_model=FamilyDetailOut)
def get_family(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取家庭详情（含成员列表）"""
    _require_membership(db, family_id, current_user.id)
    fam = db.get(Family, family_id)
    if not fam:
        raise HTTPException(status_code=404, detail="家庭不存在")

    out = _build_family_out(db, fam, current_user.id)
    members_db = db.scalars(
        select(FamilyMember).where(FamilyMember.family_id == family_id)
    ).all()
    members = []
    for m in members_db:
        u = db.get(User, m.user_id)
        members.append(FamilyMemberOut(
            id=m.id,
            user_id=m.user_id,
            nickname=u.nickname if u else "",
            avatar_url=u.avatar_url if u else None,
            role=m.role,
            joined_at=m.joined_at,
        ))
    return FamilyDetailOut(
        **out.model_dump(),
        members=members,
    )


@router.put("/{family_id}", response_model=FamilyOut)
def update_family(
    family_id: int,
    req: FamilyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """修改家庭名称（仅管理员）"""
    _require_admin(db, family_id, current_user.id)
    fam = db.get(Family, family_id)
    fam.name = req.name
    db.commit()
    db.refresh(fam)
    return _build_family_out(db, fam, current_user.id)


@router.delete("/{family_id}")
def dissolve_family(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """解散家庭（仅管理员）"""
    _require_admin(db, family_id, current_user.id)
    fam = db.get(Family, family_id)
    if not fam:
        raise HTTPException(status_code=404, detail="家庭不存在")

    # 重置成员的 current_family_id
    members = db.scalars(
        select(FamilyMember).where(FamilyMember.family_id == family_id)
    ).all()
    for m in members:
        u = db.get(User, m.user_id)
        if u and u.current_family_id == family_id:
            alt = _get_first_family_id(db, u.id, exclude_id=family_id)
            u.current_family_id = alt

    # 删除家庭下的植物关联（植物 family_id 置空）
    from app.models import Plant
    db.query(Plant).filter(Plant.family_id == family_id).update(
        {"family_id": None}
    )

    db.delete(fam)
    db.commit()
    return {"detail": "家庭已解散"}


@router.post("/{family_id}/invite", response_model=InviteOut)
def generate_invite(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """生成邀请码（24h 有效，仅管理员）"""
    _require_admin(db, family_id, current_user.id)
    fam = db.get(Family, family_id)
    if not fam:
        raise HTTPException(status_code=404, detail="家庭不存在")
    # 生成唯一码
    for _ in range(10):
        code = _generate_code()
        exists = db.scalars(
            select(Family).where(Family.invite_code == code)
        ).first()
        if not exists:
            break
    fam.invite_code = code
    fam.invite_expires_at = datetime.now() + timedelta(hours=24)
    db.commit()
    return InviteOut(invite_code=code, expires_at=fam.invite_expires_at)


@router.delete("/{family_id}/members/{user_id}")
def remove_member(
    family_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """移除成员（仅管理员）"""
    _require_admin(db, family_id, current_user.id)
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能移除自己，请使用转让管理员后退出")
    member = db.scalars(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id,
            FamilyMember.user_id == user_id,
        )
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="该用户不是家庭成员")
    # 重置被移除者的 current_family_id
    target = db.get(User, user_id)
    if target and target.current_family_id == family_id:
        alt = _get_first_family_id(db, user_id, exclude_id=family_id)
        target.current_family_id = alt
    db.delete(member)
    db.commit()
    return {"detail": "成员已移除"}


@router.post("/{family_id}/transfer")
def transfer_admin(
    family_id: int,
    req: TransferAdminRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """转让管理员"""
    _require_admin(db, family_id, current_user.id)
    target_user_id = req.target_user_id
    target_member = db.scalars(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id,
            FamilyMember.user_id == target_user_id,
        )
    ).first()
    if not target_member:
        raise HTTPException(status_code=404, detail="目标用户不是家庭成员")
    # 当前 admin 降为 member
    my_member = db.scalars(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id,
            FamilyMember.user_id == current_user.id,
        )
    ).first()
    my_member.role = "member"
    target_member.role = "admin"
    # 更新 family.created_by
    fam = db.get(Family, family_id)
    fam.created_by = target_user_id
    db.commit()
    return {"detail": "管理员已转让"}


@router.post("/{family_id}/leave")
def leave_family(
    family_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """退出家庭"""
    member = _require_membership(db, family_id, current_user.id)
    fam = db.get(Family, family_id)
    if member.role == "admin":
        count = db.scalar(
            select(func.count()).where(FamilyMember.family_id == family_id)
        )
        if count > 1:
            raise HTTPException(
                status_code=400,
                detail="请先将管理员转让给其他成员后再退出",
            )
    # 重置 current_family_id
    if current_user.current_family_id == family_id:
        alt = _get_first_family_id(db, current_user.id, exclude_id=family_id)
        current_user.current_family_id = alt
    db.delete(member)
    db.commit()
    return {"detail": "已退出家庭"}
