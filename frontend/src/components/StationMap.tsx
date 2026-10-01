import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Station, WaterMeasurement } from '../types';
import { MapPin, Navigation } from 'lucide-react';

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

  // 2. Render Circular Dot Markers (แสดงในแผนที่เป็นจุดเหมือนเดิม)
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
        opacity: 0.7,
        dashArray: '6, 6',
        lineCap: 'round',
      }).addTo(map);
    }

    // Add each station as a clean circular dot marker
    stations.forEach((stn) => {
      const isSelected = selectedStation?.station_code === stn.station_code;
      
      const meas = measurementsByStation[stn.station_code] || 
        (isSelected && latestWater ? latestWater : null);
      const waterLvl = meas ? meas.water_level : stn.normal_level;

      // Color coding based on real station-specific thresholds
      let statusText = 'ปกติ';
      let themeColor = '#10b981'; // Emerald Green
      let bgBadge = '#d1fae5';
      let textBadge = '#065f46';
      let borderBadge = '#34d399';
      let pingClass = 'bg-emerald-400 opacity-40';

      if (waterLvl >= stn.critical_level) {
        statusText = 'วิกฤต';
        themeColor = '#ef4444'; // Red
        bgBadge = '#fee2e2';
        textBadge = '#991b1b';
        borderBadge = '#f87171';
        pingClass = 'bg-rose-500 animate-ping opacity-75';
      } else if (waterLvl >= stn.warning_level) {
        statusText = 'เตือนภัย';
        themeColor = '#f59e0b'; // Amber
        bgBadge = '#fef3c7';
        textBadge = '#92400e';
        borderBadge = '#fbbf24';
        pingClass = 'bg-amber-400 animate-ping opacity-75';
      }

      const shortName = stn.name.split(' ')[0];
      const distanceToBank = (stn.bank_level - waterLvl).toFixed(2);

      // Clean circular dot marker (จุดวงกลมพร้อมเรดาร์กะพริบ)
      const iconHtml = `
        <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <!-- Radar Pulse Ring -->
          <span style="position: absolute; width: 34px; height: 34px; border-radius: 9999px; background-color: ${themeColor}; pointer-events: none;" class="${pingClass}"></span>

          <!-- Circular Dot -->
          <div style="
            position: relative;
            width: 28px;
            height: 28px;
            border-radius: 9999px;
            background-color: ${themeColor};
            border: 2.5px solid #ffffff;
            box-shadow: ${isSelected ? '0 0 0 3px #0284c7, 0 4px 10px rgba(0,0,0,0.35)' : '0 2px 6px rgba(0,0,0,0.25)'};
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 800;
            font-family: monospace;
            transition: all 0.2s ease;
            ${isSelected ? 'transform: scale(1.15);' : ''}
          ">
            ${waterLvl.toFixed(1)}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-map-dot-marker',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker([stn.latitude, stn.longitude], { icon: customIcon }).addTo(map);

      // Compact, non-overlapping hover tooltip
      marker.bindTooltip(
        `<strong>${shortName}</strong>: ${waterLvl.toFixed(2)} ม. รทก. (${statusText})`,
        { direction: 'top', offset: [0, -18], className: 'font-sans text-xs' }
      );

      // Popup Content with detailed elevation criteria and "ม. รทก."
      const popupContent = document.createElement('div');
      popupContent.className = 'p-1 text-slate-900 font-sans min-w-[240px]';
      popupContent.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
          <div>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">${stn.station_code}</span>
            <div class="font-extrabold text-sm text-blue-950 mt-1">${stn.name}</div>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full font-bold" style="background:${bgBadge}; color:${textBadge}; border:1px solid ${borderBadge}">
            ${statusText}
          </span>
        </div>

        <div class="text-[11px] text-slate-500 mb-2 font-medium">${stn.location_name}</div>

        <!-- Live Water Level Box -->
        <div class="bg-gradient-to-r from-blue-50 to-sky-50 p-2.5 rounded-xl border border-blue-200 mb-2.5">
          <div class="flex justify-between items-center text-xs">
            <span class="font-bold text-slate-700">ระดับน้ำตรวจวัดล่าสุด:</span>
            <span class="font-extrabold text-base font-mono" style="color: ${themeColor}">
              ${waterLvl.toFixed(2)} ม. รทก.
            </span>
          </div>
          <div class="text-[10px] text-slate-500 flex justify-between mt-1 pt-1 border-t border-blue-200/60 font-medium">
            <span>ระยะห่างก่อนล้นตลิ่ง:</span>
            <span class="font-bold text-slate-800">${distanceToBank} ม.</span>
          </div>
        </div>

        <!-- Criteria Table -->
        <div class="space-y-1 text-[11px] text-slate-600 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
          <div class="flex justify-between">
            <span class="text-slate-500">ระดับตลิ่ง:</span>
            <span class="font-bold text-slate-800">${stn.bank_level.toFixed(2)} ม. รทก.</span>
          </div>
          <div class="flex justify-between">
            <span class="text-rose-600 font-medium">ระดับวิกฤต:</span>
            <span class="font-bold text-rose-600">${stn.critical_level.toFixed(2)} ม. รทก.</span>
          </div>
          <div class="flex justify-between">
            <span class="text-amber-600 font-medium">ระดับเตือนภัย:</span>
            <span class="font-bold text-amber-600">${stn.warning_level.toFixed(2)} ม. รทก.</span>
          </div>
          <div class="flex justify-between">
            <span class="text-emerald-700 font-medium">ระดับปกติ:</span>
            <span class="font-bold text-emerald-700">${stn.normal_level.toFixed(2)} ม. รทก.</span>
          </div>
        </div>

        <button id="btn-${stn.station_code}" class="w-full bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white text-xs font-bold py-2 px-3 rounded-xl shadow-md transition flex items-center justify-center space-x-1">
          <span>เลือกสถานีนี้ & ดูกล้อง CCTV</span>
        </button>
      `;

      popupContent.querySelector(`#btn-${stn.station_code}`)?.addEventListener('click', () => {
        onSelectStation(stn);
        marker.closePopup();
      });

      marker.bindPopup(popupContent, { offset: [0, -14] });
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
    <div className="bg-white border-2 border-blue-100 rounded-2xl overflow-hidden shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all flex flex-col h-full min-h-[480px]">
      
      {/* Map Header with Threshold Legend & Flow Direction */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50/95 via-sky-50/60 to-white border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-md shadow-blue-500/20">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
              แผนที่ภูมิสารสนเทศ (GIS) ลุ่มน้ำคลองอู่ตะเภา
            </h2>
            <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-medium">
              <span>จุดตรวจวัด 3 สถานีหลัก (ม. รทก.)</span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center space-x-1 text-sky-800 bg-sky-100/80 px-2 py-0.5 rounded-md border border-sky-200 text-[10px] font-extrabold">
                <Navigation className="w-3 h-3 text-sky-600 rotate-45 shrink-0" />
                <span>การไหล: สะเดา &rarr; บางศาลา &rarr; หาดใหญ่</span>
              </span>
            </div>
          </div>
        </div>

        {/* Legend Pills strictly matching dot colors */}
        <div className="flex items-center space-x-1.5 text-xs bg-white/90 p-1 rounded-xl border border-blue-200/80 shadow-sm">
          <span className="flex items-center space-x-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 text-emerald-800 font-bold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>ปกติ</span>
          </span>
          <span className="flex items-center space-x-1 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 text-amber-800 font-bold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>เตือนภัย</span>
          </span>
          <span className="flex items-center space-x-1 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200 text-rose-800 font-bold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>วิกฤต</span>
          </span>
        </div>
      </div>

      {/* Map Canvas - Completely clean and unobstructed */}
      <div className="relative flex-1 w-full min-h-[420px]">
        <div ref={mapContainerRef} className="w-full h-full" />
      </div>

    </div>
  );
};

export default StationMap;
