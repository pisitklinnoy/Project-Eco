import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Station, WaterMeasurement } from '../types';
import { MapPin, Navigation, Compass } from 'lucide-react';

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

    // Clean OpenStreetMap CartoDB / OSM tiles
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

  // 2. Render Markers, Risk Colors, and River Flow Route
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

    // Connect stations along Khlong U-Taphao (South to North: Muang Kong -> Bang Sala -> Hat Yai Nai)
    const sortedStations = [...stations].sort((a, b) => a.latitude - b.latitude);
    const riverCoords: [number, number][] = sortedStations.map((s) => [s.latitude, s.longitude]);

    if (riverCoords.length >= 2) {
      polylineRef.current = L.polyline(riverCoords, {
        color: '#0284c7',
        weight: 4,
        opacity: 0.7,
        dashArray: '8, 8',
        lineCap: 'round',
      }).addTo(map);
    }

    // Add each station marker with individual accurate thresholds and "ม. รทก." values
    stations.forEach((stn) => {
      const isSelected = selectedStation?.station_code === stn.station_code;
      
      // Determine true water level
      const meas = measurementsByStation[stn.station_code] || 
        (isSelected && latestWater ? latestWater : null);
      const waterLvl = meas ? meas.water_level : stn.normal_level;

      // Color coding based on real station-specific thresholds
      let statusText = 'ปกติ';
      let themeColor = '#10b981'; // Emerald
      let bgBadge = '#d1fae5';
      let textBadge = '#065f46';
      let borderBadge = '#34d399';
      let ringPingClass = 'bg-emerald-400';

      if (waterLvl >= stn.critical_level) {
        statusText = 'วิกฤต';
        themeColor = '#ef4444'; // Red
        bgBadge = '#fee2e2';
        textBadge = '#991b1b';
        borderBadge = '#f87171';
        ringPingClass = 'bg-rose-500 animate-ping';
      } else if (waterLvl >= stn.warning_level) {
        statusText = 'เตือนภัย';
        themeColor = '#f59e0b'; // Amber
        bgBadge = '#fef3c7';
        textBadge = '#92400e';
        borderBadge = '#fbbf24';
        ringPingClass = 'bg-amber-400 animate-ping';
      }

      // Format station short code
      const shortCode = stn.station_code.replace('STN-', '');
      const distanceToBank = (stn.bank_level - waterLvl).toFixed(2);

      // Custom HTML Marker with explicit "ม. รทก." and distinct level color
      const markerHtml = `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer; transform: translate(-50%, -100%);">
          <!-- Radar Pulse Ring -->
          <div style="position: absolute; bottom: 8px; width: 34px; height: 34px; border-radius: 9999px; background-color: ${themeColor}; opacity: ${waterLvl >= stn.warning_level ? '0.75' : '0.25'}; pointer-events: none;" class="${ringPingClass}"></div>

          <!-- Pin Head Box -->
          <div style="
            background: #ffffff;
            border: 2px solid ${isSelected ? '#0284c7' : themeColor};
            border-radius: 12px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 4px 6px -2px rgba(0, 0, 0, 0.1);
            padding: 5px 8px;
            min-width: 110px;
            text-align: center;
            position: relative;
            z-index: 20;
            transition: all 0.2s ease;
            ${isSelected ? 'transform: scale(1.08); box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.4);' : ''}
          ">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-bottom: 2px;">
              <span style="font-size: 10px; font-weight: 800; color: #1e293b; letter-spacing: -0.02em;">${shortCode}</span>
              <span style="
                font-size: 9px;
                font-weight: 800;
                background-color: ${bgBadge};
                color: ${textBadge};
                border: 1px solid ${borderBadge};
                border-radius: 9999px;
                padding: 1px 5px;
                line-height: 1.1;
              ">${statusText}</span>
            </div>

            <!-- Water Level Value in ม. รทก. -->
            <div style="display: flex; align-items: baseline; justify-content: center; gap: 3px;">
              <span style="font-size: 14px; font-weight: 900; color: ${themeColor}; font-family: monospace;">
                ${waterLvl.toFixed(2)}
              </span>
              <span style="font-size: 9px; font-weight: 700; color: #475569;">
                ม. รทก.
              </span>
            </div>
          </div>

          <!-- Bottom Arrow Pin Pointer -->
          <div style="
            width: 0; 
            height: 0; 
            border-left: 7px solid transparent;
            border-right: 7px solid transparent;
            border-top: 8px solid ${isSelected ? '#0284c7' : themeColor};
            margin-top: -1px;
            z-index: 21;
          "></div>
          
          <!-- Bottom Anchor Dot -->
          <div style="
            width: 8px; 
            height: 8px; 
            border-radius: 9999px; 
            background: ${themeColor}; 
            border: 2px solid white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            margin-top: -3px;
            z-index: 19;
          "></div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'custom-station-pin',
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const marker = L.marker([stn.latitude, stn.longitude], { icon: customIcon }).addTo(map);

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

      marker.bindPopup(popupContent, { offset: [0, -32] });
      markersRef.current[stn.station_code] = marker;
    });

    // Pan smoothly to selected station
    if (selectedStation) {
      map.panTo([selectedStation.latitude, selectedStation.longitude], {
        animate: true,
        duration: 0.8,
      });
    }
  }, [stations, selectedStation, latestWater, measurementsByStation, onSelectStation]);

  return (
    <div className="bg-white border-2 border-blue-100 rounded-2xl overflow-hidden shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all flex flex-col h-full min-h-[500px]">
      
      {/* Map Header with Real Threshold Legends */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50/95 via-sky-50/60 to-white border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-md shadow-blue-500/20">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight flex items-center space-x-2">
              <span>แผนที่ภูมิสารสนเทศ (GIS) ลุ่มน้ำคลองอู่ตะเภา</span>
            </h2>
            <p className="text-[11px] text-slate-500 font-medium">
              แสดงระดับน้ำแบบเรียลไทม์ (ม. รทก.) ตามจุดยุทธศาสตร์ 3 สถานีหลัก
            </p>
          </div>
        </div>

        {/* Legend Pill Bar matching exact colors */}
        <div className="flex items-center space-x-1.5 text-xs bg-white/90 p-1 rounded-xl border border-blue-200/80 shadow-sm">
          <span className="flex items-center space-x-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 text-emerald-800 font-bold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>ปกติ</span>
          </span>
          <span className="flex items-center space-x-1 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200 text-amber-800 font-bold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span>เตือนภัย</span>
          </span>
          <span className="flex items-center space-x-1 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200 text-rose-800 font-bold text-[11px]">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            <span>วิกฤต</span>
          </span>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative flex-1 w-full min-h-[440px]">
        <div ref={mapContainerRef} className="w-full h-full" />
        
        {/* River Flow Direction Tag */}
        <div className="absolute bottom-3 left-3 z-[400] bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-sky-200 shadow-md text-[11px] text-slate-700 flex items-center space-x-2 font-medium">
          <Navigation className="w-3.5 h-3.5 text-sky-600 rotate-45" />
          <span>ทิศทางการไหล: ต้นน้ำสะเดา &rarr; บางศาลา &rarr; เข้าเมืองหาดใหญ่</span>
        </div>

        {/* Active Selection Indicator */}
        {selectedStation && (
          <div className="absolute top-3 right-3 z-[400] bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-blue-200 shadow-lg text-[11px] text-blue-950 flex items-center space-x-1.5 font-bold">
            <Compass className="w-3.5 h-3.5 text-blue-600 animate-spin" />
            <span>พิกัดปัจจุบัน: {selectedStation.name.split(' ')[0]}</span>
          </div>
        )}
      </div>

    </div>
  );
};

export default StationMap;
