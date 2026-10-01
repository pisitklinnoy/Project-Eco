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
import { WhatIfSimulator } from './components/WhatIfSimulator';
import { ClickToCalibrateModal } from './components/ClickToCalibrateModal';
import { Waves, Sliders, TrendingUp } from 'lucide-react';

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
  const [isCalibrateOpen, setIsCalibrateOpen] = useState<boolean>(false);

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

  if (loading && stations.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#f0f7ff] to-[#e0effe] flex flex-col items-center justify-center text-slate-700">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4 shadow-lg shadow-blue-500/20" />
        <h2 className="text-lg font-extrabold text-blue-950">กำลังโหลดระบบเฝ้าระวังน้ำท่วมหาดใหญ่...</h2>
        <p className="text-xs text-slate-500 mt-1">Connecting to Hatyai FloodLens AI Ecosystem</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f0f7ff] via-[#f8fbff] to-[#e6f2fc] text-slate-800 flex flex-col font-sans">
      {/* Navigation Header */}
      <Navbar
        stations={stations}
        selectedStation={selectedStation}
        onSelectStation={setSelectedStation}
        systemStatus="healthy"
      />

      {/* Main Dashboard Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 space-y-10 w-full">
        
        {/* ========================================================= */}
        {/* SECTION 1: GIS Map & Real-Time Telemetry & CCTV           */}
        {/* ========================================================= */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-blue-200/80 gap-2">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-xl bg-blue-600 text-white font-extrabold flex items-center justify-center text-sm shadow-md shadow-blue-600/30">
                01
              </span>
              <div>
                <h2 className="text-base font-extrabold text-blue-950 tracking-tight flex items-center space-x-2">
                  <span>แผนที่ภูมิสารสนเทศ (GIS) และภาพกล้อง CCTV สดประจำสถานี</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  ตรวจวัดระดับน้ำแบบเรียลไทม์จากระบบโทรมาตรและกล้องวงจรปิดด้วย AI Computer Vision
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1.5 text-xs px-3 py-1 rounded-full bg-blue-100/80 text-blue-800 font-bold border border-blue-200 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                <span>อัปเดตอัตโนมัติทุก 30 วินาที</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* GIS Map (Left 7 Cols) */}
            <div className="lg:col-span-7 h-[440px]">
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
                onOpenCalibrate={() => setIsCalibrateOpen(true)}
              />
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* SECTION 2: What-If Flood Scenario Simulation              */}
        {/* ========================================================= */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-sky-300/80 gap-2">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-xl bg-sky-600 text-white font-extrabold flex items-center justify-center text-sm shadow-md shadow-sky-600/30">
                02
              </span>
              <div>
                <h2 className="text-base font-extrabold text-blue-950 tracking-tight flex items-center space-x-2">
                  <span>ห้องทดลองจำลองสถานการณ์น้ำท่วม (What-If Flood Scenario Simulator)</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  ทดสอบผลกระทบของการเปลี่ยนแปลงสภาพอากาศ ฝนตกหนัก มวลน้ำหลาก และการบริหารจัดการประตูน้ำ
                </p>
              </div>
            </div>
            <span className="inline-flex items-center space-x-1.5 text-xs px-3 py-1 rounded-full bg-sky-100 text-sky-800 font-bold border border-sky-200 shadow-sm">
              <Sliders className="w-3.5 h-3.5 text-sky-700" />
              <span>Interactive Simulator</span>
            </span>
          </div>

          <WhatIfSimulator
            station={selectedStation}
            currentWaterLevel={measurement ? measurement.water_level : (selectedStation?.normal_level || 3.0)}
            onApplySimulation={(simForecast) => setForecast(simForecast)}
          />
        </section>

        {/* ========================================================= */}
        {/* SECTION 3: Forecast Horizon & Emergency Alerts Feed       */}
        {/* ========================================================= */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b-2 border-indigo-200/80 gap-2">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-extrabold flex items-center justify-center text-sm shadow-md shadow-indigo-600/30">
                03
              </span>
              <div>
                <h2 className="text-base font-extrabold text-blue-950 tracking-tight flex items-center space-x-2">
                  <span>ระบบพยากรณ์ระดับน้ำล่วงหน้า 1–3 ชม. และศูนย์แจ้งเตือนภัยฉุกเฉิน</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  ประเมินแนวโน้มมวลน้ำด้วยแบบจำลอง และระบบส่งข้อความเตือนภัยเข้าสู่ LINE Messaging Outbox
                </p>
              </div>
            </div>
            <span className="inline-flex items-center space-x-1.5 text-xs px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 font-bold border border-indigo-200 shadow-sm">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-700" />
              <span>Early Warning Horizon</span>
            </span>
          </div>

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
        </section>

      </main>

      {/* Review Agent Modal */}
      <ReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        station={selectedStation}
        measurement={measurement}
        onReviewSubmitted={loadStationData}
      />

      {/* Click to Calibrate Modal */}
      <ClickToCalibrateModal
        isOpen={isCalibrateOpen}
        onClose={() => setIsCalibrateOpen(false)}
        station={selectedStation}
        onCalibrationSaved={loadStationData}
      />

      {/* Footer */}
      <footer className="border-t border-blue-200/80 bg-white py-6 text-center text-xs text-slate-600 shadow-inner">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Waves className="w-4 h-4 text-blue-600" />
            <span className="font-extrabold text-blue-950">Hatyai FloodLens Platform</span>
            <span>&bull; ศูนย์ข้อมูลน้ำท่วมเทศบาลนครหาดใหญ่</span>
          </div>
          <p className="text-slate-500 font-medium">
            ระบบสนับสนุนการตัดสินใจและแจ้งเตือนภัยน้ำท่วมล่วงหน้า &bull; ลุ่มน้ำคลองอู่ตะเภา จ.สงขลา
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
