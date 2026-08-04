"""
IBM Verify Group Management API.

Exposes IBM Verify SCIM Groups to the Admin UI.
Supports listing groups, creating/deleting groups, and managing group membership.
All endpoints require Admin role.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
from app.database import get_db
from app.models import User
from app.services.verify_client import verify_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/groups", tags=["groups"])


def _require_admin(current_user: User) -> None:
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin role required")


class GroupOut(BaseModel):
    id: str
    displayName: str
    memberCount: int
    members: list[dict]


class GroupCreate(BaseModel):
    displayName: str
    description: Optional[str] = ""


class GroupAddMembersRequest(BaseModel):
    user_ids: list[str]


@router.get("")
async def list_groups(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all IBM Verify groups with member counts."""
    _require_admin(current_user)
    try:
        result = await verify_client.list_groups()
        return result
    except Exception as exc:
        logger.error("list_groups failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"IBM Verify group list failed: {exc}")


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_group(
    req: GroupCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new group in IBM Verify."""
    _require_admin(current_user)
    if not req.displayName.strip():
        raise HTTPException(status_code=400, detail="displayName is required")
    try:
        result = await verify_client.create_group(req.displayName.strip(), req.description or "")
        return result
    except Exception as exc:
        logger.error("create_group failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"IBM Verify group create failed: {exc}")


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_group(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a group from IBM Verify."""
    _require_admin(current_user)
    try:
        await verify_client.delete_group(group_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except Exception as exc:
        logger.error("delete_group %s failed: %s", group_id, exc)
        raise HTTPException(status_code=502, detail=f"IBM Verify group delete failed: {exc}")


@router.get("/{group_id}/members")
async def get_group_members(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get members of a group."""
    _require_admin(current_user)
    try:
        result = await verify_client.get_group(group_id)
        return {
            "id": result.get("id"),
            "displayName": result.get("displayName", ""),
            "members": result.get("members", []),
        }
    except Exception as exc:
        logger.error("get_group_members %s failed: %s", group_id, exc)
        raise HTTPException(status_code=502, detail=f"IBM Verify get group failed: {exc}")


@router.post("/{group_id}/members")
async def add_group_members(
    group_id: str,
    req: GroupAddMembersRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Add one or more users to a group."""
    _require_admin(current_user)
    if not req.user_ids:
        raise HTTPException(status_code=400, detail="user_ids list is required")
    try:
        for uid in req.user_ids:
            await verify_client._add_user_to_group(uid, group_id, group_id)
        return {"status": "ok", "added": len(req.user_ids)}
    except Exception as exc:
        logger.error("add_group_members %s failed: %s", group_id, exc)
        raise HTTPException(status_code=502, detail=f"IBM Verify add member failed: {exc}")


@router.delete("/{group_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_group_member(
    group_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a user from a group."""
    _require_admin(current_user)
    try:
        await verify_client._remove_user_from_group(user_id, group_id, group_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except Exception as exc:
        logger.error("remove_group_member %s/%s failed: %s", group_id, user_id, exc)
        raise HTTPException(status_code=502, detail=f"IBM Verify remove member failed: {exc}")
