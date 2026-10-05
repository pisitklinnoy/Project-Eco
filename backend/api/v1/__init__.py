from fastapi import APIRouter
from api.v1.stations_router import router as stations_router
from api.v1.water_router import router as water_router
from api.v1.forecast_router import router as forecast_router
from api.v1.review_router import router as review_router
from api.v1.alerts_router import router as alerts_router
from api.v1.vision_router import router as vision_router

api_router = APIRouter()
api_router.include_router(stations_router)
api_router.include_router(water_router)
api_router.include_router(forecast_router)
api_router.include_router(review_router)
api_router.include_router(alerts_router)
api_router.include_router(vision_router)
