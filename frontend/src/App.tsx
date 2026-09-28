import React, { useState, useEffect, useCallback } from 'react';
import type { Station, WaterMeasurement, ForecastRecord, AlertEvent } from './types';
import { floodlensApi } from './api/floodlensApi';
import { Navbar } from './components/Navbar';
import { StationMap } from './components/StationMap';
import { TelemetryCard } from './components/TelemetryCard';
import { ForecastChart } from './components/ForecastChart';
import { CameraViewer } from './components/CameraViewer';
import { AlertsList } from './components/AlertsList';
import { ReviewModal } from './components/ReviewModal';

export const App: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [measurement, setMeasurement] = useState<WaterMeasurement | null>(null);
  const [history, setHistory] = useState<WaterMeasurement[]>([]);
  const [forecast, setForecast] = useState<ForecastRecord | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [triggeringForecast, setTriggeringForecast] = useState<boolean>(false);
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);

  // 1. Initial Load: Stations
  useEffect(() => {
    floodlensApi
      .getStations()
      .then((data) => {
        setStations(data);
        if (data.length > 0) {
          setSelectedStation(data[0]);
        }
      })
      .catch((err) => console.error('Failed to load stations', err))
      .finally(() => setLoading(false));
  }, []);

  // 2. Fetch Station Specific Data
  const loadStationData = useCallback(async () => {
    if (!selectedStation) return;
    try {
      const [latestWater, waterHistory, latestForecast, recentAlerts] = await Promise.all([
        floodlensApi.getLatestWater(selectedStation.station_code),
        floodlensApi.getWaterHistory(selectedStation.station_code, 24),
        floodlensApi.getLatestForecast(selectedStation.station_code),
        floodlensApi.getRecentAlerts(10),
      ]);
      setMeasurement(latestWater);
      setHistory(waterHistory);
      setForecast(latestForecast);
      setAlerts(recentAlerts);
    } catch (err) {
      console.error('Failed to load station telemetry', err);
    }
  }, [selectedStation]);

  useEffect(() => {
    loadStationData();
    // Auto-refresh interval (every 30 seconds)
    const timer = setInterval(loadStationData, 30000);
    return () => clearInterval(timer);
  }, [loadStationData]);

  // Handle Manual Forecast Trigger
  const handleTriggerForecast = async () => {
    if (!selectedStation) return;
    setTriggeringForecast(true);
    try {
      const res = await floodlensApi.triggerForecast(selectedStation.station_code);
      setForecast(res);
      await loadStationData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการคำนวณผลพยากรณ์');
    } finally {
      setTriggeringForecast(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar
        stations={stations}
        selectedStation={selectedStation}
        onSelectStation={setSelectedStation}
        systemStatus="healthy"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 space-y-6 w-full">
        {/* Top Grid: GIS Map & Current Telemetry / Camera */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* GIS Map (Left 7 Cols) */}
          <div className="lg:col-span-7 h-[420px]">
            <StationMap
              stations={stations}
              selectedStation={selectedStation}
              onSelectStation={setSelectedStation}
              latestWater={measurement}
            />
          </div>

          {/* Telemetry & Camera (Right 5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <TelemetryCard
              station={selectedStation}
              measurement={measurement}
              loading={loading}
              onRefresh={loadStationData}
              onOpenReview={() => setIsReviewOpen(true)}
            />
            <CameraViewer
              station={selectedStation}
              measurement={measurement}
              onOpenReview={() => setIsReviewOpen(true)}
            />
          </div>
        </div>

        {/* Bottom Grid: 1-3h Forecast Chart & Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Forecast Chart (Left 8 Cols) */}
          <div className="lg:col-span-8">
            <ForecastChart
              station={selectedStation}
              history={history}
              forecast={forecast}
              onTriggerForecast={handleTriggerForecast}
              triggering={triggeringForecast}
            />
          </div>

          {/* Alerts Feed (Right 4 Cols) */}
          <div className="lg:col-span-4">
            <AlertsList
              alerts={alerts}
              selectedStation={selectedStation}
              onAlertCreated={loadStationData}
            />
          </div>
        </div>
      </main>

      {/* Review Agent Modal */}
      <ReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        station={selectedStation}
        measurement={measurement}
        onReviewSubmitted={loadStationData}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>
          Hatyai FloodLens &bull; ระบบเฝ้าระวังและพยากรณ์ระดับน้ำในพื้นที่หาดใหญ่ด้วย AI &bull; สงขลา
        </p>
      </footer>
    </div>
  );
};

export default App;
