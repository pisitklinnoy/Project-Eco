from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from core.config import settings

Base = declarative_base()

def create_db_engine():
    connect_args = {"connect_timeout": 2} if "postgresql" in settings.database_url else {}
    pg_engine = create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)
    try:
        with pg_engine.connect() as conn:
            pass
        return pg_engine
    except Exception as e:
        print(f"[Database] PostgreSQL connection not ready ({e}). Falling back to local SQLite database.")
        return create_engine("sqlite:///./floodlens_local.db", connect_args={"check_same_thread": False})

engine = create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
