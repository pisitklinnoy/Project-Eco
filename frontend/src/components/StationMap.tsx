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

    // Center of Khlong U-Taphao basin (Muang Kong -> Bang Sala -> Hat Yai)
    const centerLat = 6.92;
    const centerLng = 100.45;

    const map = L.map(mapContainerRef.current, {
      center: [centerLat, centerLng],
      zoom: 11,
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
      let colorClass = 'bg-blue-600 border-white ring-2 ring-blue-400';
      let statusText = 'ปกติ';
      if (waterLvl >= stn.critical_level) {
        colorClass = 'bg-rose-600 border-white ring-4 ring-rose-400 animate-bounce';
        statusText = 'วิกฤต!';
      } else if (waterLvl >= stn.warning_level) {
        colorClass = 'bg-amber-500 border-white ring-2 ring-amber-400';
        statusText = 'เตือนภัย';
      }

      const iconHtml = `
        <div class="relative flex items-center justify-center cursor-pointer">
          <span class="absolute w-8 h-8 rounded-full ${waterLvl >= stn.warning_level ? 'animate-ping opacity-75' : 'opacity-40'} ${colorClass.split(' ')[0]}"></span>
          <div class="w-7 h-7 rounded-full border-2 ${colorClass} text-white flex items-center justify-center shadow-xl text-[11px] font-extrabold font-mono">
            ${waterLvl.toFixed(1)}
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        html: iconHtml,
        className: 'custom-map-marker',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([stn.latitude, stn.longitude], { icon: customIcon }).addTo(map);

      const popupContent = document.createElement('div');
      popupContent.className = 'p-1 text-slate-900 font-sans';
      popupContent.innerHTML = `
        <div class="font-bold text-sm text-blue-950 mb-0.5">${stn.name}</div>
        <div class="text-xs text-slate-500 mb-2 font-medium">${stn.location_name}</div>
        <div class="flex justify-between items-center text-xs mb-1.5 bg-blue-50/80 p-2 rounded-lg border border-blue-100">
          <span class="font-bold text-slate-700">ระดับน้ำตรวจวัด:</span>
          <span class="font-extrabold text-blue-700 text-sm">${waterLvl.toFixed(2)} ม. (${statusText})</span>
        </div>
        <div class="text-[11px] text-slate-500 mb-2 font-medium">เตือนภัย: ${stn.warning_level} ม. | วิกฤต: ${stn.critical_level} ม. | ตลิ่ง: ${stn.bank_level} ม.</div>
        <button id="btn-${stn.station_code}" class="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow transition">
          ดูข้อมูลสถานีนี้
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
    <div className="bg-white border-2 border-blue-100 rounded-2xl overflow-hidden shadow-[0_4px_20px_-4px_rgba(2,132,199,0.08)] hover:shadow-[0_8px_30px_-4px_rgba(2,132,199,0.12)] transition-all flex flex-col h-full">
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50/90 via-sky-50/50 to-white border-b border-blue-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">แผนที่สารสนเทศภูมิศาสตร์ GIS เฝ้าระวังน้ำท่วมหาดใหญ่</h2>
            <p className="text-[11px] text-slate-500">3 จุดยุทธศาสตร์หลักตามแนวลำน้ำคลองอู่ตะเภา</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-xs">
          <span className="flex items-center space-x-1.5 bg-white px-2.5 py-1 rounded-full border border-emerald-200 text-emerald-700 font-bold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>ปกติ</span>
          </span>
          <span className="flex items-center space-x-1.5 bg-white px-2.5 py-1 rounded-full border border-amber-200 text-amber-700 font-bold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>เตือนภัย</span>
          </span>
          <span className="flex items-center space-x-1.5 bg-white px-2.5 py-1 rounded-full border border-rose-200 text-rose-700 font-bold shadow-sm">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span>
            <span>วิกฤต</span>
          </span>
        </div>
      </div>
      <div ref={mapContainerRef} className="w-full flex-1 min-h-[340px]" />
    </div>
  );
};
