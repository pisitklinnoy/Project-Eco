import os
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "workers"))

from core.database import Base, get_db
import models
from main import app


@pytest.fixture
def db():
    url = os.getenv("TIMESERIES_TEST_DATABASE_URL", "sqlite://")
    if url != "sqlite://" and "floodlens_ts_test" not in url:
        raise RuntimeError("Integration tests require a dedicated floodlens_ts_test database")
    kwargs = {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool} if url == "sqlite://" else {}
    engine = create_engine(url.replace("postgresql://", "postgresql+psycopg2://", 1), **kwargs)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(db):
    from fastapi.testclient import TestClient

    def override():
        yield db

    app.dependency_overrides[get_db] = override
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()
