from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, get_db
from app.models.task import Task
from app.models.schedule import Schedule
from app.models.schedule_block import ScheduleBlock
from app.models.user import User
from app.schemas.task import TaskCreate, TaskResponse, TaskStatusUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.post("/", response_model=TaskResponse, status_code=201)
def create_task(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = Task(**payload.model_dump(), user_id=current_user.id)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/recent", response_model=List[TaskResponse])
def list_recent_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return tasks from the most recently scheduled week."""
    latest_schedule = (
        db.query(Schedule)
        .filter(Schedule.user_id == current_user.id)
        .order_by(Schedule.week_start_date.desc(), Schedule.id.desc())
        .first()
    )
    if not latest_schedule:
        return []
    task_ids = (
        db.query(ScheduleBlock.task_id)
        .filter(
            ScheduleBlock.user_id == current_user.id,
            ScheduleBlock.date >= latest_schedule.week_start_date,
            ScheduleBlock.task_id.isnot(None),
        )
        .distinct()
        .all()
    )
    if not task_ids:
        return []
    id_list = [row[0] for row in task_ids]
    return db.query(Task).filter(Task.id.in_(id_list)).all()


@router.get("/pending", response_model=List[TaskResponse])
def list_pending_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Task)
        .filter(Task.user_id == current_user.id, Task.status == "pending")
        .all()
    )


@router.get("/", response_model=List[TaskResponse])
def list_tasks(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Task).filter(Task.user_id == current_user.id).all()


@router.patch("/{task_id}/status", response_model=TaskResponse)
def update_task_status(
    task_id: int,
    payload: TaskStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = payload.status
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", response_model=TaskResponse)
def cancel_task(
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = db.query(Task).filter(Task.id == task_id, Task.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.status = "cancelled"
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task
