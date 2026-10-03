"""Additive migration for existing PostgreSQL/SQLite deployments (no data rewrite)."""
from sqlalchemy import inspect, text


def upgrade_timeseries_schema(engine):
    additions = {
        "forecast_records": {"context_json": "JSON", "forecast_key": "VARCHAR(64)"},
        "rainfall_measurements": {"source_type": "VARCHAR(50) NOT NULL DEFAULT 'UNKNOWN'",
                                  "source_url": "VARCHAR(500)", "source_station_id": "INTEGER", "source_sha256": "VARCHAR(64)"},
    }
    with engine.begin() as connection:
        inspector = inspect(connection)
        for table, columns in additions.items():
            if not inspector.has_table(table):
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            for column, definition in columns.items():
                if column not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
        if inspector.has_table("forecast_records"):
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_forecast_records_forecast_key ON forecast_records (forecast_key)"))
