'use client';

import { useEffect, useRef } from 'react';

interface Props {
  plots: any[];
  selectedPlotId: string | null;
  onPlotSelect: (feature: any) => void;
  flyTo: [number, number] | null;
  authorityColor: (auth: string) => string;
}

export default function TirupatiMap({ plots, selectedPlotId, onPlotSelect, flyTo, authorityColor }: Props) {
  const mapRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('leaflet').then(L => {
      leafletRef.current = L;
      // Fix default icon
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      if (mapRef.current) return; // Already initialized

      const map = L.map('tirupati-leaflet-map', {
        center: [13.6288, 79.4192],
        zoom: 12,
        zoomControl: true,
      });
      mapRef.current = map;

      // Dark tile layer (CartoDB DarkMatter)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        maxZoom: 19,
      }).addTo(map);
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers when plots change
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    // Clear old markers
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current.clear();

    plots.forEach(feature => {
      const { coordinates, id, authority, plot_number, layout_name, area_sqyd, facing } = feature.properties;
      const [lng, lat] = coordinates;
      const color = authorityColor(authority);
      const isSelected = id === selectedPlotId;

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:${isSelected ? 16 : 10}px;
          height:${isSelected ? 16 : 10}px;
          background:${color};
          border:${isSelected ? '3px solid white' : '2px solid rgba(255,255,255,0.4)'};
          border-radius:50%;
          box-shadow:${isSelected ? `0 0 0 4px ${color}44` : '0 1px 4px rgba(0,0,0,0.6)'};
          cursor:pointer;
          transition:all 0.2s;
        "></div>`,
        iconSize: [isSelected ? 16 : 10, isSelected ? 16 : 10],
        iconAnchor: [isSelected ? 8 : 5, isSelected ? 8 : 5],
      });

      const marker = L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:system-ui;min-width:200px">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px">${plot_number}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:8px">${layout_name}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px">
              <span style="color:#64748b">Area:</span><strong>${area_sqyd} sqyd</strong>
              <span style="color:#64748b">Facing:</span><strong>${facing}</strong>
            </div>
            <div style="margin-top:10px;padding:6px 10px;background:${color};color:white;border-radius:6px;text-align:center;font-size:12px;font-weight:600;cursor:pointer">
              Select This Plot →
            </div>
          </div>
        `, { maxWidth: 240 })
        .on('click', () => onPlotSelect(feature));

      markersRef.current.set(id, marker);
    });
  }, [plots, selectedPlotId, authorityColor, onPlotSelect]);

  // Fly to selected plot
  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo(flyTo, 15, { animate: true, duration: 1 });
    }
  }, [flyTo]);

  return (
    <>
      <div id="tirupati-leaflet-map" style={{ width: '100%', height: '100%', zIndex: 1 }} />
      <style dangerouslySetInnerHTML={{ __html: `
        .leaflet-container { background:#0a0f1e !important; }
        .leaflet-popup-content-wrapper { background:#1e293b; color:#f1f5f9; border:1px solid #334155; border-radius:10px; box-shadow:0 4px 20px rgba(0,0,0,0.5); }
        .leaflet-popup-tip { background:#1e293b; }
        .leaflet-popup-close-button { color:#64748b !important; }
        .leaflet-control-zoom a { background:#1e293b !important; color:#94a3b8 !important; border-color:#334155 !important; }
        .leaflet-control-attribution { background:#0f172aaa !important; color:#475569 !important; font-size:10px !important; }
        .leaflet-control-attribution a { color:#475569 !important; }
      `}} />
    </>
  );
}
