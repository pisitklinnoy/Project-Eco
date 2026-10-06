import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Station, WaterMeasurement, RainfallMeasurement, ForecastRecord, AlertEvent } from './types';
import { floodlensApi } from './api/floodlensApi';
import { Navbar, type UserRole } from './components/Navbar';
import { FloatingSidebar } from './components/FloatingSidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { HeroSection } from './components/HeroSection';
import { SectionHeader } from './components/ui/SectionHeader';
import { StationMap } from './components/StationMap';
import { TelemetryCard } from './components/TelemetryCard';
import { StationOverview } from './components/StationOverview';
import { CameraViewer } from './components/CameraViewer';
import { PublicForecastView } from './components/PublicForecastView';
import { ReviewHub } from './components/ReviewHub';
import { AdminCalibrationHub } from './components/AdminCalibrationHub';
import { AdminObservability } from './components/AdminObservability';
import { ReviewModal } from './components/ReviewModal';
import { ClickToCalibrateModal } from './components/ClickToCalibrateModal';
import { OnDemandPredictorModal } from './components/OnDemandPredictorModal';
import { ManualBBoxModal } from './components/ManualBBoxModal';
import { Waves, Cpu, Sparkles, Camera } from 'lucide-react';

export const App: React.FC = () => {
  // Role & Navigation Page State
  const [role, setRole] = useState<UserRole>('public');
  const [activePage, setActivePage] = useState<string>('overview');

  const [stations, setStations] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [measurement, setMeasurement] = useState<WaterMeasurement | null>(null);
  const [stationMeasurements, setStationMeasurements] = useState<Record<string, WaterMeasurement>>({});
  const [stationRain, setStationRain] = useState<Record<string, RainfallMeasurement>>({});
  const [history, setHistory] = useState<WaterMeasurement[]>([]);
  const [forecast, setForecast] = useState<ForecastRecord | null>(null);
  const [forecastError, setForecastError] = useState<string>('');
  const [stationForecasts, setStationForecasts] = useState<Record<string, ForecastRecord>>({});
  const [stationErrors, setStationErrors] = useState<Record<string, string>>({});
  const [refreshingAll, setRefreshingAll] = useState<boolean>(false);
  const refreshInFlight = useRef<boolean>(false);
  const stationCodeRef = useRef<string | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [triggeringForecast, setTriggeringForecast] = useState<boolean>(false);

  // Admin Modals
  const [isReviewOpen, setIsReviewOpen] = useState<boolean>(false);
  const [isCalibrateOpen, setIsCalibrateOpen] = useState<boolean>(false);
  const [isOnDemandOpen, setIsOnDemandOpen] = useState<boolean>(false);
  const [isManualBBoxOpen, setIsManualBBoxOpen] = useState<boolean>(false);

  const selectStation = useCallback((station: Station) => {
    stationCodeRef.current = station.station_code;
    setSelectedStation(station);
    setForecast(null);
    setMeasurement(null);
    setHistory([]);
    setForecastError('');
  }, []);

  // Fetch telemetry for all active stations
  const loadAllStationMeasurements = useCallback(async (stnList: Station[]) => {
    if (!stnList || stnList.length === 0) return;
    try {
      const results = await Promise.all(
        stnList.map(async (stn) => {
          try {
            const [water, rain] = await Promise.allSettled([
              floodlensApi.getLatestWater(stn.station_code),
              floodlensApi.getLatestRain(stn.station_code),
            ]);
            return {
              code: stn.station_code,
              data: water.status === 'fulfilled' ? water.value : null,
              rain: rain.status === 'fulfilled' ? rain.value : null,
            };
          } catch {
            return null;
          }
        })
      );
      const map: Record<string, WaterMeasurement> = {};
      const rainMap: Record<string, RainfallMeasurement> = {};
      results.forEach((r) => {
        if (r && r.data) map[r.code] = r.data;
        if (r && r.rain) rainMap[r.code] = r.rain;
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
      result.stations.forEach((row) => {
        if (row.forecast) forecasts[row.station_code] = row.forecast;
        if (row.error) errors[row.station_code] = row.error;
      });
      setStationForecasts(forecasts);
      setStationErrors(errors);
      await loadAllStationMeasurements(stations);
      const code = stationCodeRef.current;
      if (code) {
        const [water, waterHistory] = await Promise.all([
          floodlensApi.getLatestWater(code),
          floodlensApi.getWaterHistory(code, 24),
        ]);
        if (stationCodeRef.current === code) {
          setMeasurement(water);
          setHistory(waterHistory);
          setForecast(forecasts[code] ?? null);
          setForecastError(errors[code] ?? '');
        }
      }
    } catch (err) {
      console.error('Failed to refresh forecasts and telemetry', err);
      setStationErrors(
        Object.fromEntries(stations.map((s) => [s.station_code, err instanceof Error ? err.message : 'โหลดข้อมูลไม่ได้']))
      );
    } finally {
      refreshInFlight.current = false;
      setRefreshingAll(false);
    }
  }, [stations, loadAllStationMeasurements]);

  useEffect(() => {
    if (stations.length > 0) {
      void refreshAllStations();
      const timer = setInterval(() => void refreshAllStations(), 300000);
      return () => clearInterval(timer);
    }
  }, [refreshAllStations, stations.length]);

  // Initial Load: Stations
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

  // Fetch Station Specific Data
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

      if (latestWater) {
        setStationMeasurements((prev) => ({
          ...prev,
          [selectedStation.station_code]: latestWater,
        }));
      }
    } catch (err) {
      console.error('Failed to load station telemetry', err);
    }
  }, [selectedStation]);

  useEffect(() => {
    loadStationData();
    const timer = setInterval(() => {
      loadStationData();
      if (stations.length > 0) {
        loadAllStationMeasurements(stations);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [loadStationData, loadAllStationMeasurements, stations]);

  // Role switching handler
  const handleSwitchRole = (newRole: UserRole) => {
    setRole(newRole);
    if (newRole === 'public') {
      setActivePage('overview');
    } else {
      setActivePage('admin-review');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Page navigation handler
  const handleNavigate = (pageId: string) => {
    setActivePage(pageId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      if (stationCodeRef.current === code) {
        setForecastError(err instanceof Error ? err.message : 'ไม่สามารถคำนวณพยากรณ์ได้');
      }
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
        role={role}
        activePage={activePage}
        onNavigate={handleNavigate}
        onSwitchRole={handleSwitchRole}
        onOpenReview={() => setIsReviewOpen(true)}
        onOpenCalibrate={() => setIsCalibrateOpen(true)}
        onOpenOnDemand={() => setIsOnDemandOpen(true)}
        onRefresh={loadStationData}
        loading={loading}
      />

      {/* Floating Top Glass Capsule Navbar */}
      <Navbar
        stations={stations}
        selectedStation={selectedStation}
        onSelectStation={selectStation}
        systemStatus="healthy"
        role={role}
        onSwitchRole={handleSwitchRole}
        activePage={activePage}
        onNavigate={handleNavigate}
        alertCount={alerts.filter((a) => a.severity_level === 'CRITICAL').length}
        onOpenOnDemand={() => setIsOnDemandOpen(true)}
      />

      {/* Main Workspace with generous spacing & Bento architecture */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 space-y-12 w-full lg:pl-24">
        
        {/* ========================================================================= */}
        {/* 1. PUBLIC CITIZEN PORTAL (ศูนย์ข้อมูลประชาชน)                                */}
        {/* ========================================================================= */}
        {role === 'public' && (
          <>
            {/* PUBLIC PAGE 1: Overview & Live GIS Map */}
            {activePage === 'overview' && (
              <div className="space-y-12 animate-fadeIn">
                {/* Hero Editorial Header */}
                <HeroSection
                  station={selectedStation}
                  measurement={measurement}
                  stations={stations}
                  stationMeasurements={stationMeasurements}
                  onExploreClick={() => {
                    const el = document.getElementById('gis-map-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  onRetrainHubClick={() => handleNavigate('forecast')}
                  onOpenReview={() => {}}
                  onSelectStation={selectStation}
                />

                {/* Multi-Station Live Cards */}
                <StationOverview
                  stations={stations}
                  measurements={stationMeasurements}
                  rain={stationRain}
                  forecasts={stationForecasts}
                  errors={stationErrors}
                  refreshing={refreshingAll}
                  onRefresh={refreshAllStations}
                  onSelect={selectStation}
                />

                {/* Citizen Science: Instant Water Level Check from Photo */}
                <div className="rounded-[32px] bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 p-6 sm:p-8 text-white shadow-xl shadow-blue-500/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
                  <div className="absolute right-0 top-0 w-80 h-80 bg-white/10 rounded-full blur-3xl pointer-events-none" />
                  <div className="space-y-2 z-10">
                    <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-bold border border-white/30 backdrop-blur-md">
                      <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                      <span>Citizen Science &bull; ตรวจวัดระดับน้ำภาคประชาชน</span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black font-display tracking-tight text-white">
                      ไม่อยู่ใกล้สถานีหลัก? ถ่ายรูปวัดระดับน้ำจุดที่ท่านอยู่ได้ทันที
                    </h3>
                    <p className="text-xs sm:text-sm text-sky-100 max-w-2xl leading-relaxed">
                      หากท่านอยู่ใกล้คลองสาขา ซอย หรือสะพานที่ไม่มีกล้อง CCTV ของรัฐ สามารถถ่ายภาพผิวน้ำหรือเสาวัดน้ำ
                      ส่งให้ระบบ AI ช่วยคำนวณและประเมินระดับน้ำในจุดที่ท่านอยู่ได้ทันที
                    </p>
                  </div>
                  <button
                    onClick={() => setIsOnDemandOpen(true)}
                    className="z-10 shrink-0 flex items-center space-x-2.5 px-5 py-3 rounded-2xl bg-white hover:bg-sky-50 text-blue-900 font-extrabold text-sm shadow-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <Camera className="w-5 h-5 text-blue-600" />
                    <span>ถ่ายรูปหรืออัปโหลดภาพ</span>
                  </button>
                </div>

                {/* GIS Map & Clean Public CCTV Viewer */}
                <section className="space-y-6" id="gis-map-section">
                  <SectionHeader
                    number="01"
                    badge="GIS & Live Surveillance"
                    title="แผนที่ภูมิสารสนเทศ (GIS) & ศูนย์ตรวจการณ์กล้องสด"
                    subtitle="ตรวจวัดระดับน้ำแบบเรียลไทม์ (ม. รทก.) ตามแนวลุ่มน้ำคลองอู่ตะเภา พร้อมกล้อง CCTV ประจำสถานี"
                    actionLabel="อัปเดตอัตโนมัติ 30s"
                  />

                  {/* Public Telemetry Card (Clean without admin buttons) */}
                  <TelemetryCard
                    station={selectedStation}
                    measurement={measurement}
                    loading={loading}
                    onRefresh={loadStationData}
                  />

                  {/* Bento Row: GIS Map (50%) & CCTV Stream (50%) */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                    <div className="h-[540px]">
                      <StationMap
                        stations={stations}
                        selectedStation={selectedStation}
                        onSelectStation={selectStation}
                        latestWater={measurement}
                        measurementsByStation={stationMeasurements}
                      />
                    </div>

                    <div className="h-[540px]">
                      <CameraViewer
                        station={selectedStation}
                        measurement={measurement}
                      />
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* PUBLIC PAGE 2: Forecast & Early Warnings */}
            {activePage === 'forecast' && (
              <PublicForecastView
                stations={stations}
                station={selectedStation}
                onSelectStation={selectStation}
                history={history}
                forecast={forecast}
                alerts={alerts}
                forecastError={forecastError}
                triggeringForecast={triggeringForecast}
                onTriggerForecast={handleTriggerForecast}
                onAlertCreated={loadStationData}
                stationMeasurements={stationMeasurements}
              />
            )}
          </>
        )}

        {/* ========================================================================= */}
        {/* 2. ADMIN & OPERATOR PORTAL (ศูนย์ปฏิบัติการเจ้าหน้าที่ & MLOps)                 */}
        {/* ========================================================================= */}
        {role === 'admin' && (
          <>
            {/* ADMIN PAGE 1: Active Learning & Retrain Hub */}
            {activePage === 'admin-review' && (
              <div className="space-y-8 animate-fadeIn">
                <SectionHeader
                  number="ADMIN 01"
                  badge="Active Learning & Auto Retrain"
                  title="ศูนย์ตรวจทานภาพ (Label Studio) & ฝึกฝน AI อัตโนมัติ"
                  subtitle="ระบบบันทึกผลเฉลยจากผู้เชี่ยวชาญ เปรียบเทียบความคลาดเคลื่อน AI และสั่ง Retrain โมเดลใหม่อัตโนมัติเมื่อครบ 20 ภาพ"
                  actionLabel="20 Images Batch Quota"
                />

                {/* Review Package Trigger Header */}
                <div className="rounded-[28px] bg-white/80 backdrop-blur-xl border border-white/90 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">
                        ตรวจทานผลการวัดน้ำสถานี {selectedStation?.name}
                      </h4>
                      <p className="text-xs text-slate-500">
                        เปิดหน้าต่างตรวจสอบหลักฐานภาพย้อนหลัง 1 ชม. และป้อนค่าน้ำจริงเข้าสู่กระบวนการ Retrain
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsReviewOpen(true)}
                    className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
                  >
                    <span>เปิดแบบฟอร์มตรวจทาน (Human Review)</span>
                  </button>
                </div>

                <ReviewHub onRefreshTelemetry={loadStationData} />
              </div>
            )}

            {/* ADMIN PAGE 2: Vision Calibration & Staff Gauge Tools */}
            {activePage === 'admin-calibration' && (
              <AdminCalibrationHub
                stations={stations}
                station={selectedStation}
                onSelectStation={selectStation}
                measurement={measurement}
                onOpenManualBBox={() => setIsManualBBoxOpen(true)}
                onOpenCalibrate={() => setIsCalibrateOpen(true)}
                onOpenOnDemand={() => setIsOnDemandOpen(true)}
                onOpenReview={() => setIsReviewOpen(true)}
              />
            )}

            {/* ADMIN PAGE 3: System Architecture & Observability */}
            {activePage === 'admin-observability' && (
              <AdminObservability />
            )}
          </>
        )}

      </main>

      {/* Admin Modals */}
      <ReviewModal
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        station={selectedStation}
        measurement={measurement}
        onReviewSubmitted={loadStationData}
      />

      <ClickToCalibrateModal
        isOpen={isCalibrateOpen}
        onClose={() => setIsCalibrateOpen(false)}
        station={selectedStation}
        onCalibrationSaved={loadStationData}
      />

      <ManualBBoxModal
        isOpen={isManualBBoxOpen}
        onClose={() => setIsManualBBoxOpen(false)}
        station={selectedStation}
        onSaved={loadStationData}
      />

      <OnDemandPredictorModal
        isOpen={isOnDemandOpen}
        onClose={() => setIsOnDemandOpen(false)}
        station={selectedStation}
        onPredicted={(res) => {
          const newMeas: WaterMeasurement = {
            id: Date.now(),
            station_code: selectedStation?.station_code || 'STN-BANGSALA',
            timestamp: new Date().toISOString(),
            water_level: res.calculated_water_level_m,
            source_type: 'ON_DEMAND_VISION',
            vision_confidence: res.confidence_score,
            is_reviewed_by_human: true,
          };
          setMeasurement(newMeas);
          if (selectedStation) {
            setStationMeasurements((prev) => ({
              ...prev,
              [selectedStation.station_code]: newMeas,
            }));
          }
          loadStationData();
        }}
      />

      {/* Mobile Floating Bottom Bar */}
      <MobileBottomNav
        role={role}
        activePage={activePage}
        onNavigate={handleNavigate}
        onSwitchRole={handleSwitchRole}
        alertCount={alerts.filter((a) => a.severity_level === 'CRITICAL').length}
      />

      {/* Floating Glass Footer */}
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
          <div className="flex items-center space-x-3">
            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold border border-slate-200">
              โหมดปัจจุบัน: {role === 'public' ? '🌐 ภาคประชาชน' : '🔒 เจ้าหน้าที่/Admin'}
            </span>
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>ระบบทำงานปกติ</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
