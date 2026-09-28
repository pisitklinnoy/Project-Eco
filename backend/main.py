import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import engine, Base
import models # ensure all SQLAlchemy models are registered
from api.v1 import api_router

# OpenTelemetry & Prometheus Observability
from prometheus_fastapi_instrumentator import Instrumentator
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter

# Initialize database schema
try:
    Base.metadata.create_all(bind=engine)
    print("[Database] Schema synchronized successfully.")
except Exception as e:
    print(f"[Database] Schema creation note: {e}")

app = FastAPI(
    title=settings.app_name,
    description="""
    ## Hatyai FloodLens AI Ecosystem Platform
    ระบบเฝ้าระวังและพยากรณ์ระดับน้ำในพื้นที่หาดใหญ่ด้วย AI จากข้อมูลอนุกรมเวลาและภาพกล้อง
    - **Station & GIS**: ข้อมูลพิกัดสถานีเฝ้าระวัง
    - **Telemetry & Water Level**: ระดับน้ำและปริมาณฝนล่าสุด
    - **AI Forecast Engine**: พยากรณ์ระดับน้ำล่วงหน้า 1-3 ชม.
    - **Human-in-the-Loop**: ระบบช่วยตรวจทานภาพและเชื่อมโยง Label Studio
    - **Emergency Alerting**: ส่งแจ้งเตือนระดับน้ำวิกฤตผ่าน LINE Messaging API
    """,
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OpenTelemetry Tracing Setup
try:
    resource = Resource.create({"service.name": "floodlens_backend"})
    provider = TracerProvider(resource=resource)
    processor = BatchSpanProcessor(OTLPSpanExporter(endpoint=settings.otel_exporter_endpoint, insecure=True))
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    print(f"[OpenTelemetry] Tracing initialized -> OTLP: {settings.otel_exporter_endpoint}")
except Exception as e:
    print(f"[OpenTelemetry] Setup note: {e}")

tracer = trace.get_tracer("floodlens_backend")

@app.middleware("http")
async def trace_requests_middleware(request, call_next):
    span_name = f"{request.method} {request.url.path}"
    with tracer.start_as_current_span(span_name) as span:
        span.set_attribute("http.method", request.method)
        span.set_attribute("http.url", str(request.url))
        span.set_attribute("http.route", request.url.path)
        try:
            response = await call_next(request)
            span.set_attribute("http.status_code", response.status_code)
            return response
        except Exception as exc:
            span.record_exception(exc)
            raise exc

# Prometheus Metrics Exporter
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# Register APIs
app.include_router(api_router, prefix="/api/v1")

@app.get("/", tags=["System"])
def root():
    return {
        "project": "Hatyai FloodLens",
        "description": "ระบบเฝ้าระวังและพยากรณ์ระดับน้ำหาดใหญ่ด้วย AI",
        "status": "online",
        "docs": "/docs",
        "version": settings.app_version
    }

@app.get("/health", tags=["System"])
def health():
    return {"status": "healthy"}
