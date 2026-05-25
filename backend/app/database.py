from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = "sqlite:///./sunday.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db():
    # Import models so Base picks them up before create_all
    from app.models import user, weekly_preferences, task, schedule_block, completion, reorganization_log  # noqa: F401
    Base.metadata.create_all(bind=engine)
