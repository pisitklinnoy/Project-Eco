import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Station, WaterMeasurement } from '../types';
import { MapPin } from 'lucide-react';

interface StationMapProps {
  stations: Station[];
  selectedStation: Station | null;
  onSelectStation: (stn: Station) => void;
  latestWater?: WaterMeasurement | null;
}

export const StationMap: React.FC<StationMapProps> = ({
  stations,
  selectedStation,
  onSelectStation,
  latestWater,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<{ [code: string]: L.Marker }>({});

  // 1. Initialize Map Instance Once with proper cleanup
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const centerLat = 7.005;
    const centerLng = 100.47;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    mapInstanceRef.current = map;

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Update Markers when stations or selectedStation change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear existing markers
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};

    // Custom marker function
    stations.forEach((stn) => {
      const isSelected = selectedStation?.station_code === stn.station_code;
      const waterLvl = isSelected && latestWater ? latestWater.water_level : stn.normal_level;

      // Color coding based on risk
      let colorClass = 'bg-emerald-500 border-emerald-300';
      let statusText = 'ปกติ';
      if (waterLvl >= stn.critical_level) {
        colorClass = 'bg-red-500 border-red-300 animate-bounce';
        statusText = 'วิกฤต!';
      } else if (waterLvl >= stn.warning_level) {
        colorClass = 'bg-amber-500 border-amber-300';
        statusText = 'เตือนภัย';
      }

      const iconHtml = `
        <div class="relative flex items-center justify-center">
          <span class="absolute w-8 h-8 rounded-full ${waterLvl >= stn.warning_level ? 'animate-ping opacity-75' : ''} ${colorClass.split(' ')[0]}"></span>
          <div class="w-6 h-6 rounded-full border-2 ${colorClass} text-white flex items-center justify-center shadow-lg text-[10px] font-bold">
            ${waterLvl.toFixed(1)}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-map-marker',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([stn.latitude, stn.longitude], { icon: customIcon }).addTo(map);

      const popupContent = document.createElement('div');
      popupContent.className = 'p-1 text-slate-900';
      popupContent.innerHTML = `
        <div class="font-bold text-sm text-slate-800">${stn.name}</div>
        <div class="text-xs text-slate-500 mb-2">${stn.location_name}</div>
        <div class="flex justify-between items-center text-xs mb-1">
          <span class="font-medium text-slate-600">ระดับน้ำ:</span>
          <span class="font-bold text-blue-600 text-sm">${waterLvl.toFixed(2)} ม. (${statusText})</span>
        </div>
        <div class="text-[11px] text-slate-400 mb-2">เกณฑ์วิกฤต: ${stn.critical_level} ม. | ตลิ่ง: ${stn.bank_level} ม.</div>
        <button id="btn-${stn.station_code}" class="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-1 px-2 rounded transition">
          ดูรายละเอียดจุดนี้
        </button>
      `;

      popupContent.querySelector(`#btn-${stn.station_code}`)?.addEventListener('click', () => {
        onSelectStation(stn);
        marker.closePopup();
      });

      marker.bindPopup(popupContent);
      markersRef.current[stn.station_code] = marker;
    });

    // Pan to selected station if changed
    if (selectedStation) {
      map.panTo([selectedStation.latitude, selectedStation.longitude], { animate: true });
    }
  }, [stations, selectedStation, latestWater, onSelectStation]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col h-full">
      <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <MapPin className="w-4 h-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-white">แผนที่จุดเฝ้าระวังคลองหาดใหญ่ (GIS Map)</h2>
        </div>
        <div className="flex items-center space-x-3 text-xs text-slate-400">
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>ปกติ</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>เตือนภัย</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span>วิกฤต</span>
          </span>
        </div>
      </div>
      <div ref={mapContainerRef} className="w-full h-80 lg:h-96" />
    </div>
  );
};
