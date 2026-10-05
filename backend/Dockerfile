FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv from official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

COPY backend/requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt
COPY TimeSeries-Integration /opt/TimeSeries-Integration
RUN uv pip install --system --no-cache /opt/TimeSeries-Integration
COPY time_series_ecosystem /time_series_ecosystem

COPY backend/ .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

