import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Station, WaterMeasurement, RainfallMeasurement, ForecastRecord, AlertEvent } from './types';
import { floodlensApi } from './api/floodlensApi';
import { Navbar } from './components/Navbar';
import { FloatingSidebar } from './components/FloatingSidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { HeroSection } from './components/HeroSection';
import { SectionHeader } from './components/ui/SectionHeader';
import { StationMap } from './components/StationMap';
import { TelemetryCard } from './components/TelemetryCard';
import { ForecastChart } from './components/ForecastChart';
import { ForecastHistory } from './components/ForecastHistory';
import { StationOverview } from './components/StationOverview';
import { CameraViewer } from './components/CameraViewer';
import { AlertsList } from './components/AlertsList';
import { ReviewModal } from './components/ReviewModal';
import { WhatIfSimulator } from './components/WhatIfSimulator';
import { ClickToCalibrateModal } from './components/ClickToCalibrateModal';
import { Waves } from 'lucide-react';

export const App: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [measurement, setMeasurement] = useState<WaterMeasurement | null>(null);
  const [stationMeasurements, setStationMeasurements] = useState<Record<string, WaterMeasurement>>({});
  const [stationRain, setStationRain] = useState<Record<string, RainfallMeasurement>>({});
  const [history, setHistory] = useState<WaterMeasurement[]>([]);
  const [forecast, setForecast] = useState<ForecastRecord | null>(null);
  const [forecastError, setForecastError] = useState('');
  const [stationForecasts, setStationForecasts] = useState<Record<string, ForecastRecord>>({});
  const [stationErrors, setStationErrors] = useState<Record<string, string>>({});
  const [refreshingAll, setRefreshingAll] = useState(false);
  const refreshInFlight = useRef(false);
  const stationCodeRef = useRef<string | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [triggeringForecast, setTriggeringForecast] = useState<boolean>(false);
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [isCalibrateOpen, setIsCalibrateOpen] = useState<boolean>(false);

  const selectStation = useCallback((station: Station) => {
    stationCodeRef.current = station.station_code;
    setSelectedStation(station);
    setForecast(null);
    setMeasurement(null);
    setHistory([]);
    setForecastError('');
  }, []);

  // Active section tracking for floating navbar & sidebar
  const [activeSection, setActiveSection] = useState<string>('hero');

  // Fetch telemetry for all active stations
  const loadAllStationMeasurements = useCallback(async (stnList: Station[]) => {
    if (!stnList || stnList.length === 0) return;
    try {
      const results = await Promise.all(
        stnList.map(async (stn) => {
          try {
            const [water, rain] = await Promise.allSettled([floodlensApi.getLatestWater(stn.station_code), floodlensApi.getLatestRain(stn.station_code)]);
            return { code: stn.station_code, data: water.status === 'fulfilled' ? water.value : null, rain: rain.status === 'fulfilled' ? rain.value : null };
          } catch {
            return null;
          }
        })
      );
      const map: Record<string, WaterMeasurement> = {};
      const rainMap: Record<string, RainfallMeasurement> = {};
      results.forEach((r) => {
        if (r && r.data) map[r.code] = r.data;
        if (r?.rain) rainMap[r.code] = r.rain;
      });
      setStationMeasurements(map);
      setStationRain(rainMap);
    } catch (err) {
      console.error('Failed to load all station measurements', err);
    }
  }, []);

  const refreshAllStations = useCallback(async () => {
    if (refreshInFlight.current || !stations.length) return;
    refreshInFlight.current = true;
    setRefreshingAll(true);
    try {
      const result = await floodlensApi.refreshAllForecasts();
      const forecasts: Record<string, ForecastRecord> = {};
      const errors: Record<string, string> = {};
      result.stations.forEach(row => {
        if (row.forecast) forecasts[row.station_code] = row.forecast;
        if (row.error) errors[row.station_code] = row.error;
      });
      setStationForecasts(forecasts);
      setStationErrors(errors);
      await loadAllStationMeasurements(stations);
      const code = stationCodeRef.current;
      if (code) {
        const [water, waterHistory] = await Promise.all([floodlensApi.getLatestWater(code), floodlensApi.getWaterHistory(code, 24)]);
        if (stationCodeRef.current === code) {
          setMeasurement(water);
          setHistory(waterHistory);
          setForecast(forecasts[code] ?? null);
          setForecastError(errors[code] ?? '');
        }
      }
    } catch (err) {
      setStationErrors(Object.fromEntries(stations.map(station => [station.station_code, err instanceof Error ? err.message : 'โหลดข้อมูลไม่ได้'])));
    } finally {
      refreshInFlight.current = false;
      setRefreshingAll(false);
    }
  }, [stations, loadAllStationMeasurements]);

  useEffect(() => {
    void refreshAllStations();
    const timer = setInterval(() => void refreshAllStations(), 300000);
    return () => clearInterval(timer);
  }, [refreshAllStations]);

  // 1. Initial Load: Stations
  useEffect(() => {
    floodlensApi
      .getStations()
      .then((data) => {
        setStations(data);
        if (data.length > 0) {
          selectStation(data[0]);
          loadAllStationMeasurements(data);
        }
      })
      .catch((err) => console.error('Failed to load stations', err))
      .finally(() => setLoading(false));
  }, [loadAllStationMeasurements, selectStation]);

  // 2. Fetch Station Specific Data
  const loadStationData = useCallback(async () => {
    if (!selectedStation) return;
    const code = selectedStation.station_code;
    try {
      const [waterResult, historyResult, forecastResult, alertsResult] = await Promise.allSettled([
        floodlensApi.getLatestWater(selectedStation.station_code),
        floodlensApi.getWaterHistory(selectedStation.station_code, 24),
        floodlensApi.getLatestForecast(selectedStation.station_code),
        floodlensApi.getRecentAlerts(10),
      ]);
      if (stationCodeRef.current !== code) return;
      const latestWater = waterResult.status === 'fulfilled' ? waterResult.value : null;
      const waterHistory = historyResult.status === 'fulfilled' ? historyResult.value : [];
      const latestForecast = forecastResult.status === 'fulfilled' ? forecastResult.value : null;
      const recentAlerts = alertsResult.status === 'fulfilled' ? alertsResult.value : [];
      setMeasurement(latestWater);
      setHistory(waterHistory);
      setForecast(latestForecast);
      setAlerts(recentAlerts);
      setForecastError(forecastResult.status === 'rejected' ? String(forecastResult.reason) : '');

      // Update in dictionary
      setStationMeasurements((prev) => {
        const next = { ...prev };
        if (latestWater) next[code] = latestWater;
        else delete next[code];
        return next;
      });
    } catch (err) {
      console.error('Failed to load station telemetry', err);
    }
  }, [selectedStation]);

  useEffect(() => {
    loadStationData();
    // Auto-refresh interval (every 30 seconds)
    const timer = setInterval(() => {
      loadStationData();
      if (stations.length > 0) {
        loadAllStationMeasurements(stations);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [loadStationData, loadAllStationMeasurements, stations]);

  // Handle section scrolling observer
  useEffect(() => {
    const handleScroll = () => {
      const sections = ['hero', 'gis-cctv', 'cctv-inspector', 'simulation', 'forecast-alerts'];
      const scrollPos = window.scrollY + 200;

      for (const sectionId of sections) {
        const el = document.getElementById(sectionId);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(sectionId);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleNavigate = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element) {
      const offsetTop = element.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({
        top: Math.max(0, offsetTop),
        behavior: 'smooth',
      });
    }
  };

  // Handle Manual Forecast Trigger
  const handleTriggerForecast = async () => {
    if (!selectedStation) return;
    setTriggeringForecast(true);
    setForecastError('');
    const code = selectedStation.station_code;
    try {
      await refreshAllStations();
      const res = await floodlensApi.getLatestForecast(selectedStation.station_code);
      if (stationCodeRef.current !== code) return;
      setForecast(res);
      await loadStationData();
    } catch (err) {
      if (stationCodeRef.current === code) setForecastError(err instanceof Error ? err.message : 'ไม่สามารถคำนวณพยากรณ์ได้');
    } finally {
      setTriggeringForecast(false);
    }
  };

  if (loading && stations.length === 0) {
    return (
      <div className="min-h-screen bg-[#F5F7FA] flex flex-col items-center justify-center text-slate-800">
        <div className="relative">
          <div className="w-14 h-14 rounded-full border-4 border-slate-900 border-t-transparent animate-spin mb-4 shadow-xl" />
          <Waves className="w-6 h-6 text-sky-600 absolute top-4 left-4" />
        </div>
        <h2 className="text-xl font-bold font-display text-slate-900 mt-2">Hatyai FloodLens AI</h2>
        <p className="text-xs text-slate-500 mt-1">Connecting to intelligent flood telemetry ecosystem...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-slate-800 flex flex-col font-sans selection:bg-slate-900 selection:text-white relative overflow-x-hidden">
      
      {/* Subtle Ambient Background Gradient Orbs */}
      <div className="fixed top-0 left-1/3 w-[600px] h-[600px] bg-sky-100/35 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed bottom-1/4 right-10 w-[500px] h-[500px] bg-blue-100/30 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Floating Desktop Sidebar Navigation Rail */}
      <FloatingSidebar
        activeSection={activeSection}
        onNavigate={handleNavigate}
        onOpenReview={() => setIsReviewOpen(true)}
        onOpenCalibrate={() => setIsCalibrateOpen(true)}
        onRefresh={loadStationData}
        loading={loading}
      />

      {/* Floating Top Glass Capsule Navbar */}
      <Navbar
        stations={stations}
        selectedStation={selectedStation}
        onSelectStation={selectStation}
        systemStatus="healthy"
        activeSection={activeSection}
        onNavigate={handleNavigate}
        alertCount={alerts.filter((a) => a.severity_level === 'CRITICAL').length}
      />

      {/* Main Workspace with generous spacing & Bento architecture */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 space-y-16 w-full lg:pl-24">
        
        {/* ========================================================= */}
        {/* HERO SECTION: Editorial Luxury Spatial Overview           */}
        {/* ========================================================= */}
        <HeroSection
          station={selectedStation}
          measurement={measurement}
          stations={stations}
          stationMeasurements={stationMeasurements}
          onExploreClick={() => handleNavigate('gis-cctv')}
          onSimulateClick={() => handleNavigate('simulation')}
          onOpenReview={() => setIsReviewOpen(true)}
          onSelectStation={selectStation}
        />

        <StationOverview stations={stations} measurements={stationMeasurements} rain={stationRain} forecasts={stationForecasts}
          errors={stationErrors} refreshing={refreshingAll} onRefresh={refreshAllStations} onSelect={selectStation} />

        {/* ========================================================= */}
        {/* SECTION 1: GIS Map & Real-Time Telemetry & CCTV Zoom      */}
        {/* ========================================================= */}
        <section className="space-y-6" id="gis-cctv">
          <SectionHeader
            number="01"
            badge="GIS & AI Vision"
            title="แผนที่ภูมิสารสนเทศ (GIS) และศูนย์ตรวจการณ์กล้อง AI Vision"
            subtitle="ตรวจวัดระดับน้ำแบบเรียลไทม์ (ม. รทก.) ตามแนวลุ่มน้ำคลองอู่ตะเภา พร้อมระบบซูมตรวจสอบสเกลเสาวัดน้ำ"
            actionLabel="อัปเดตอัตโนมัติ 30s"
          />

          {/* Strategic Telemetry Summary Ribbon */}
          <TelemetryCard
            station={selectedStation}
            measurement={measurement}
            loading={loading}
            onRefresh={loadStationData}
            onOpenReview={() => setIsReviewOpen(true)}
          />

          {/* Bento Row: GIS Map (50%) & CCTV Live Stream with Zoom (50%) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch" id="cctv-inspector">
            {/* GIS Map with Accurate 'ม. รทก.' & Color-coded Risk Dots */}
            <div className="h-[540px]">
              <StationMap
                stations={stations}
                selectedStation={selectedStation}
                onSelectStation={selectStation}
                latestWater={measurement}
                measurementsByStation={stationMeasurements}
              />
            </div>

            {/* High-Definition Zoomable CCTV Live Camera & Staff Gauge Inspector */}
            <div className="h-[540px]">
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
        <section className="space-y-6" id="simulation">
          <SectionHeader
            number="02"
            badge="What-If Simulator"
            title="ห้องทดลองจำลองสถานการณ์น้ำท่วม (What-If Flood Scenario Simulator)"
            subtitle="ทดสอบผลกระทบของการเปลี่ยนแปลงสภาพอากาศ ฝนตกหนัก มวลน้ำหลาก และการบริหารจัดการประตูน้ำ"
            actionLabel="Interactive Modeler"
          />

          <WhatIfSimulator
            station={selectedStation}
            currentWaterLevel={measurement ? measurement.water_level : (selectedStation?.normal_level || 3.0)}
            onApplySimulation={(simForecast) => setForecast(simForecast)}
          />
        </section>

        {/* ========================================================= */}
        {/* SECTION 3: Forecast Horizon & Emergency Alerts Feed       */}
        {/* ========================================================= */}
        <section className="space-y-6" id="forecast-alerts">
          <SectionHeader
            number="03"
            badge="Early Warning Horizon"
            title="ระบบพยากรณ์ระดับน้ำล่วงหน้า 1–3 ชม. และศูนย์แจ้งเตือนภัยฉุกเฉิน"
            subtitle="ประเมินแนวโน้มมวลน้ำด้วยแบบจำลอง AI และระบบส่งข้อความเตือนภัยเข้าสู่ LINE Messaging Outbox"
            actionLabel="3h Prediction"
          />

          {/* Bento Asymmetric Row: Forecast Chart (8 Cols) & Alerts Feed (4 Cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <ForecastChart
                station={selectedStation}
                history={history}
                forecast={forecast}
                onTriggerForecast={handleTriggerForecast}
                triggering={triggeringForecast}
                error={forecastError}
              />
              <ForecastHistory stationCode={selectedStation?.station_code ?? null} refreshKey={forecast?.id ?? 0} />
            </div>

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

      {/* Mobile Floating Bottom Bar */}
      <MobileBottomNav
        activeSection={activeSection}
        onNavigate={handleNavigate}
        alertCount={alerts.filter((a) => a.severity_level === 'CRITICAL').length}
      />

      {/* Floating Glass Footer Capsule */}
      <footer className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mb-16 lg:mb-6 lg:pl-24">
        <div className="rounded-[32px] bg-white/70 backdrop-blur-xl border border-white/80 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center">
              <Waves className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold font-display text-slate-900 text-sm block">Hatyai FloodLens Platform</span>
              <span>ศูนย์ข้อมูลน้ำท่วมเทศบาลนครหาดใหญ่ &bull; ลุ่มน้ำคลองอู่ตะเภา จ.สงขลา</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-[11px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-700">ระบบเฝ้าระวังอัตโนมัติทำงานปกติ</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
