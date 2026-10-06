import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Station, WaterMeasurement } from '../types';
import { MapPin, Navigation } from 'lucide-react';
import { getStationFlagInfo } from './CameraViewer';

export const getShortStationCode = (station: Station): string => {
  const code = (station.station_code || '').toUpperCase();
  const name = station.name || '';
  if (code.includes('MUANGKONG') || code.includes('X.173') || name.includes('ม่วงก็อง')) return 'X.173A';
  if (code.includes('BANGSALA') || code.includes('X.90') || name.includes('บางศาลา')) return 'X.90';
  if (code.includes('HATYAI') || code.includes('X.44') || name.includes('หาดใหญ่')) return 'X.44';
  return station.station_code;
};

interface StationMapProps {
  stations: Station[];
  selectedStation: Station | null;
  onSelectStation: (stn: Station) => void;
  latestWater?: WaterMeasurement | null;
  measurementsByStation?: Record<string, WaterMeasurement>;
}

export const StationMap: React.FC<StationMapProps> = ({
  stations,
  selectedStation,
  onSelectStation,
  latestWater,
  measurementsByStation = {},
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [code: string]: L.Marker }>({});
  const polylineRef = useRef<L.Polyline | null>(null);

  // 1. Initialize Map Instance
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Center coordinates for Khlong U-Taphao Basin
    const centerLat = 6.915;
    const centerLng = 100.445;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 11,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors &bull; กรมชลประทาน &bull; เทศบาลนครหาดใหญ่',
      maxZoom: 18,
    }).addTo(map);

    mapInstanceRef.current = map;

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(resizeTimer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2. Render Circular Dot Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || stations.length === 0) return;

    // Clear existing markers
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Connect stations along Khlong U-Taphao (Muang Kong -> Bang Sala -> Hat Yai Nai)
    const sortedStations = [...stations].sort((a, b) => a.latitude - b.latitude);
    const riverCoords: [number, number][] = sortedStations.map((s) => [s.latitude, s.longitude]);

    if (riverCoords.length >= 2) {
      polylineRef.current = L.polyline(riverCoords, {
        color: '#0284c7',
        weight: 3.5,
        opacity: 0.75,
        dashArray: '6, 6',
        lineCap: 'round',
      }).addTo(map);
    }

    // Add each station as a high-precision GIS coin marker
    stations.forEach((stn) => {
      const isSelected = selectedStation?.station_code === stn.station_code;
      
      // Resolution priority:
      // 1. If currently selected station and latestWater exists, use latestWater
      // 2. Otherwise lookup from measurementsByStation by exact station_code
      // 3. Fallback lookup by code variations (e.g. without 'STN-', fuzzy key match)
      const meas = (isSelected && latestWater) 
        ? latestWater 
        : (measurementsByStation[stn.station_code] 
           || (stn.station_code.startsWith('STN-') ? measurementsByStation[stn.station_code.replace('STN-', '')] : null)
           || Object.entries(measurementsByStation).find(([k]) => k.toUpperCase().includes(stn.station_code.toUpperCase().replace('STN-', '')))?.[1]
           || null);

      const waterLvl = meas && meas.water_level != null ? Number(meas.water_level) : stn.normal_level;
      const shortCode = getShortStationCode(stn);
      const shortName = stn.name.split(' ')[0];
      const distanceToBank = (stn.bank_level - waterLvl).toFixed(2);
      const formattedWaterLvl = waterLvl.toFixed(2);

      // Warning flag and risk color coding according to official basin criteria
      const flagInfo = getStationFlagInfo(stn, waterLvl);

      let themeColor = '#10b981'; // Green (default)
      let bgBadge = '#ecfdf5';
      let textBadge = '#065f46';
      let borderBadge = '#a7f3d0';
      let pingClass = 'bg-emerald-400 opacity-40';

      if (flagInfo.flagColor === 'red') {
        themeColor = '#ef4444'; // Red
        bgBadge = '#fef2f2';
        textBadge = '#991b1b';
        borderBadge = '#fecaca';
        pingClass = 'bg-rose-500 animate-ping opacity-75';
      } else if (flagInfo.flagColor === 'yellow') {
        themeColor = '#f59e0b'; // Amber
        bgBadge = '#fffbeb';
        textBadge = '#92400e';
        borderBadge = '#fde68a';
        pingClass = 'bg-amber-400 animate-ping opacity-75';
      }

      // High-precision GIS coin marker with 2-decimal display and station code tag
      const iconHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; user-select: none;">
          <!-- Floating Station Code Tag -->
          <div style="
            background: rgba(15, 23, 42, 0.92);
            backdrop-filter: blur(4px);
            color: #ffffff;
            font-size: 10px;
            font-weight: 700;
            padding: 1px 7px;
            border-radius: 9999px;
            white-space: nowrap;
            border: 1px solid rgba(255, 255, 255, 0.25);
            box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            letter-spacing: 0.02em;
            margin-bottom: 2px;
          ">${shortCode}</div>

          <!-- Coin Wrapper -->
          <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
            <!-- Radar Pulse Ring -->
            <span style="position: absolute; width: 44px; height: 44px; border-radius: 9999px; background-color: ${themeColor}; pointer-events: none;" class="${pingClass}"></span>

            <!-- Circular Coin Marker -->
            <div style="
              position: relative;
              width: 42px;
              height: 42px;
              border-radius: 9999px;
              background-color: ${themeColor};
              border: 2.5px solid #ffffff;
              box-shadow: ${isSelected ? '0 0 0 3px #0284c7, 0 8px 18px rgba(0,0,0,0.35)' : '0 4px 12px rgba(0,0,0,0.22)'};
              color: #ffffff;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              line-height: 1.05;
              transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
              ${isSelected ? 'transform: scale(1.15);' : ''}
            ">
              <span style="font-size: 11.5px; font-weight: 800; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; letter-spacing: -0.02em;">
                ${formattedWaterLvl}
              </span>
              <span style="font-size: 8.5px; font-weight: 700; opacity: 0.95;">ม.</span>
            </div>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-map-dot-marker',
        iconSize: [60, 68],
        iconAnchor: [30, 40],
      });

      const marker = L.marker([stn.latitude, stn.longitude], { icon: customIcon }).addTo(map);

      // Compact, non-overlapping hover tooltip
      marker.bindTooltip(
        `<strong>${shortName} (${shortCode})</strong>: ${formattedWaterLvl} ม. รทก. [${flagInfo.flagName} - ${flagInfo.statusTitle}]`,
        { direction: 'top', offset: [0, -36], className: 'font-sans text-xs' }
      );

      // Popup Content with detailed elevation criteria, flag guide, and "ม. รทก."
      const popupContent = document.createElement('div');
      popupContent.className = 'p-1 text-slate-900 font-sans min-w-[270px]';
      popupContent.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
          <div>
            <div class="flex items-center space-x-1.5">
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white">${stn.station_code}</span>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-mono">${shortCode}</span>
            </div>
            <div class="font-extrabold text-sm text-slate-900 mt-1">${stn.name}</div>
          </div>
          <span class="text-xs px-2.5 py-0.5 rounded-full font-bold shadow-sm whitespace-nowrap" style="background:${bgBadge}; color:${textBadge}; border:1px solid ${borderBadge}">
            ${flagInfo.flagName} (${flagInfo.statusTitle})
          </span>
        </div>

        <div class="text-[11px] text-slate-500 mb-2 font-medium">${stn.location_name}</div>

        <!-- Live Water Level Box -->
        <div class="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80 mb-2.5">
          <div class="flex justify-between items-center text-xs">
            <span class="font-semibold text-slate-700">ระดับน้ำตรวจวัดล่าสุด:</span>
            <span class="font-extrabold text-base font-mono" style="color: ${themeColor}">
              ${formattedWaterLvl} ม. รทก.
            </span>
          </div>
          <div class="text-[10px] text-slate-500 flex justify-between mt-1 pt-1 border-t border-slate-200/60 font-medium">
            <span>ระยะห่างก่อนล้นตลิ่ง:</span>
            <span class="font-bold text-slate-800">${distanceToBank} ม.</span>
          </div>
        </div>

        <!-- Official Warning Flag Criteria Guide -->
        <div class="mb-3 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/60">
          <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
            <span>เกณฑ์สีธงเตือนภัย</span>
            <span class="font-semibold text-slate-700 font-mono">${shortCode}</span>
          </div>
          <div class="text-[11px] font-medium text-slate-700 space-y-1">
            <div class="p-1.5 rounded-lg bg-white/80 border border-slate-200/50 text-[10.5px] leading-relaxed text-slate-600">
              ${flagInfo.thresholdGuide}
            </div>
          </div>
          <div class="mt-2 pt-1.5 border-t border-slate-200/50 flex justify-between text-[10px] text-slate-500">
            <span>ระดับตลิ่งวิกฤต:</span>
            <span class="font-bold text-slate-700 font-mono">${stn.bank_level.toFixed(2)} ม. รทก.</span>
          </div>
        </div>

        <button id="btn-${stn.station_code}" class="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold py-2 px-3 rounded-xl shadow-md transition flex items-center justify-center space-x-1 cursor-pointer">
          <span>เลือกสถานีนี้ & ดูกล้อง CCTV</span>
        </button>
      `;

      popupContent.querySelector(`#btn-${stn.station_code}`)?.addEventListener('click', () => {
        onSelectStation(stn);
        marker.closePopup();
      });

      marker.bindPopup(popupContent, { offset: [0, -28] });
      markersRef.current[stn.station_code] = marker;
    });

    // Pan to selected station
    if (selectedStation) {
      map.panTo([selectedStation.latitude, selectedStation.longitude], {
        animate: true,
        duration: 0.8,
      });
    }
  }, [stations, selectedStation, latestWater, measurementsByStation, onSelectStation]);

  return (
    <div className="relative overflow-hidden rounded-[32px] sm:rounded-[36px] bg-white/85 backdrop-blur-2xl border border-white/80 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.05)] transition-all hover:shadow-[0_25px_60px_-15px_rgba(2,132,199,0.08)] flex flex-col h-full min-h-[480px]">
      
      {/* Map Header with Threshold Legend & Flow Direction */}
      <div className="px-5 py-4 bg-white/60 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-2xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shadow-sm">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 font-display tracking-tight">
              แผนที่ภูมิสารสนเทศ (GIS) ลุ่มน้ำคลองอู่ตะเภา
            </h2>
            <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-medium mt-0.5">
              <span>จุดตรวจวัด 3 สถานีหลัก (ม. รทก.)</span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center space-x-1 text-sky-700 bg-sky-50 px-2.5 py-0.5 rounded-full border border-sky-200/60 text-[10px] font-semibold">
                <Navigation className="w-3 h-3 text-sky-600 rotate-45 shrink-0" />
                <span>การไหล: สะเดา &rarr; บางศาลา &rarr; หาดใหญ่</span>
              </span>
            </div>
          </div>
        </div>

        {/* Legend Pills strictly matching dot colors & flag criteria */}
        <div className="flex items-center space-x-1.5 text-xs bg-slate-50/90 p-1 rounded-2xl border border-slate-200/60 shadow-sm">
          <span className="flex items-center space-x-1.5 bg-emerald-50/80 px-2.5 py-1 rounded-xl border border-emerald-200 text-emerald-800 font-semibold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>ธงเขียว (ปกติ)</span>
          </span>
          <span className="flex items-center space-x-1.5 bg-amber-50/80 px-2.5 py-1 rounded-xl border border-amber-200 text-amber-800 font-semibold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>ธงเหลือง (เฝ้าระวัง)</span>
          </span>
          <span className="flex items-center space-x-1.5 bg-rose-50/80 px-2.5 py-1 rounded-xl border border-rose-200 text-rose-800 font-semibold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>ธงแดง (วิกฤต)</span>
          </span>
        </div>
      </div>

      {/* Map Canvas - Clean and unobstructed */}
      <div className="relative flex-1 w-full min-h-[420px]">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

    </div>
  );
};

export default StationMap;
