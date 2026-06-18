'use client';

import { useEffect, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Filter, ChevronRight, ExternalLink, Home, X } from 'lucide-react';

// Types
interface PlotProperties {
  id: string;
  layout_name: string;
  plot_number: string;
  survey_no: string;
  lp_number: string;
  authority: 'TUDA' | 'DTCP' | 'Municipal';
  locality: string;
  area_sqyd: number;
  area_sqft: number;
  area_sqm: number;
  width_ft: number;
  depth_ft: number;
  width_m: number;
  depth_m: number;
  facing: string;
  road_width_ft: number;
  corner_plot: boolean;
  layout_approved_year: number;
  price_per_sqyd_approx: number;
  coordinates: [number, number];
  amenities?: string[];
  nearby_landmarks?: string[];
}

interface Feature {
  type: 'Feature';
  geometry: { type: string; coordinates: [number, number] };
  properties: PlotProperties;
}

const API = process.env.NEXT_PUBLIC_ENGINE_URL || 'http://localhost:8000';

// Dynamic Leaflet map (no SSR)
const TirupatiMap = dynamic(() => import('@/components/tirupati/tirupati-map'), {
  ssr: false,
  loading: () => (
    <div className="tirupati-map-loading">
      <div className="map-spinner" />
      <p>Loading Tirupati map…</p>
    </div>
  ),
});

export default function TirupatiLandSelector() {
  const router = useRouter();
  const [allPlots, setAllPlots] = useState<Feature[]>([]);
  const [filteredPlots, setFilteredPlots] = useState<Feature[]>([]);
  const [selectedPlot, setSelectedPlot] = useState<Feature | null>(null);
  const [autoBrief, setAutoBrief] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [filterAuthority, setFilterAuthority] = useState('');
  const [filterFacing, setFilterFacing] = useState('');
  const [filterAreaMin, setFilterAreaMin] = useState('');
  const [filterAreaMax, setFilterAreaMax] = useState('');
  const [cornerOnly, setCornerOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [mapFlyTo, setMapFlyTo] = useState<[number, number] | null>(null);

  // Fetch all plots + stats
  useEffect(() => {
    Promise.all([
      fetch(`${API}/layouts/tirupati`).then(r => r.json()),
      fetch(`${API}/layouts/tirupati/stats`).then(r => r.json()),
    ])
      .then(([data, statsData]) => {
        setAllPlots(data.features || []);
        setFilteredPlots(data.features || []);
        setStats(statsData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Client-side filtering
  useEffect(() => {
    let f = allPlots;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      f = f.filter(
        p =>
          p.properties.layout_name.toLowerCase().includes(q) ||
          p.properties.plot_number.toLowerCase().includes(q) ||
          p.properties.locality.toLowerCase().includes(q) ||
          (p.properties.survey_no || '').toLowerCase().includes(q),
      );
    }
    if (filterAuthority) f = f.filter(p => p.properties.authority === filterAuthority);
    if (filterFacing)
      f = f.filter(p => p.properties.facing.toLowerCase() === filterFacing.toLowerCase());
    if (filterAreaMin) f = f.filter(p => p.properties.area_sqyd >= Number(filterAreaMin));
    if (filterAreaMax) f = f.filter(p => p.properties.area_sqyd <= Number(filterAreaMax));
    if (cornerOnly) f = f.filter(p => p.properties.corner_plot);
    setFilteredPlots(f);
  }, [allPlots, searchQ, filterAuthority, filterFacing, filterAreaMin, filterAreaMax, cornerOnly]);

  const selectPlot = useCallback(async (feature: Feature) => {
    setSelectedPlot(feature);
    setMapFlyTo([feature.properties.coordinates[1], feature.properties.coordinates[0]]);
    try {
      const res = await fetch(`${API}/layouts/tirupati/${feature.properties.id}`);
      const data = await res.json();
      setAutoBrief(data.auto_brief);
    } catch {
      // ignore
    }
  }, []);

  const goToStudio = () => {
    if (!autoBrief || !selectedPlot) return;
    const params = new URLSearchParams({
      city: 'Tirupati',
      state: 'AP',
      width: String(autoBrief.plot_width_ft),
      depth: String(autoBrief.plot_depth_ft),
      facing: autoBrief.facing,
      bhk: String(autoBrief.suggested_bhk),
      authority: autoBrief.authority,
      lp: autoBrief.lp_number || '',
      plot_id: selectedPlot.properties.id,
      layout: selectedPlot.properties.layout_name,
    });
    router.push(`/studio?${params.toString()}`);
  };

  const authorityColor = (auth: string) => {
    if (auth === 'TUDA') return '#3b82f6';
    if (auth === 'DTCP') return '#10b981';
    return '#f59e0b';
  };

  return (
    <div className="tirupati-page">
      {/* ── Header ── */}
      <div className="tirupati-header">
        <div className="tirupati-header-left">
          <div className="tirupati-badge">🗺 Tirupati Land Selector</div>
          <h1>Select Your Government-Approved Plot</h1>
          <p>Browse all TUDA, DTCP &amp; Municipal approved layouts in Tirupati. Click any plot to generate your house plan.</p>
        </div>
        {stats && (
          <div className="tirupati-stats">
            <div className="stat-chip">
              <span>{stats.total_plots}</span>Plots
            </div>
            <div className="stat-chip">
              <span>{stats.total_layouts}</span>Layouts
            </div>
            <div className="stat-chip tuda">
              <span>{stats.by_authority?.TUDA || 0}</span>TUDA
            </div>
            <div className="stat-chip dtcp">
              <span>{stats.by_authority?.DTCP || 0}</span>DTCP
            </div>
            <div className="stat-chip muni">
              <span>{stats.by_authority?.Municipal || 0}</span>Municipal
            </div>
          </div>
        )}
      </div>

      <div className="tirupati-body">
        {/* ── Left: Search Panel ── */}
        <div className="tirupati-search-panel">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search layout, plot no., locality…"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              id="tirupati-search-input"
            />
            {searchQ && (
              <button onClick={() => setSearchQ('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </div>

          <button className="filter-toggle" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={14} /> Filters {showFilters ? '▲' : '▼'}
          </button>

          {showFilters && (
            <div className="filter-panel">
              <label htmlFor="filter-authority">Authority</label>
              <select
                id="filter-authority"
                value={filterAuthority}
                onChange={e => setFilterAuthority(e.target.value)}
              >
                <option value="">All Authorities</option>
                <option value="TUDA">TUDA</option>
                <option value="DTCP">DTCP</option>
                <option value="Municipal">Municipal</option>
              </select>

              <label htmlFor="filter-facing">Facing</label>
              <select
                id="filter-facing"
                value={filterFacing}
                onChange={e => setFilterFacing(e.target.value)}
              >
                <option value="">All Facings</option>
                <option>East</option>
                <option>West</option>
                <option>North</option>
                <option>South</option>
              </select>

              <label>Area (sq yards)</label>
              <div className="range-row">
                <input
                  type="number"
                  placeholder="Min"
                  value={filterAreaMin}
                  onChange={e => setFilterAreaMin(e.target.value)}
                  id="filter-area-min"
                />
                <span>–</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filterAreaMax}
                  onChange={e => setFilterAreaMax(e.target.value)}
                  id="filter-area-max"
                />
              </div>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={cornerOnly}
                  onChange={e => setCornerOnly(e.target.checked)}
                  id="filter-corner"
                />
                Corner plots only
              </label>
            </div>
          )}

          <div className="results-count">
            {loading ? 'Loading plots…' : `${filteredPlots.length} plots found`}
          </div>

          <div className="plot-list" role="list">
            {filteredPlots.slice(0, 80).map(f => (
              <button
                key={f.properties.id}
                id={`plot-item-${f.properties.id}`}
                className={`plot-list-item ${selectedPlot?.properties.id === f.properties.id ? 'selected' : ''}`}
                onClick={() => selectPlot(f)}
                role="listitem"
              >
                <div className="plot-item-top">
                  <span className="plot-no">{f.properties.plot_number}</span>
                  <span
                    className="authority-badge"
                    style={{
                      background: authorityColor(f.properties.authority) + '22',
                      color: authorityColor(f.properties.authority),
                      border: `1px solid ${authorityColor(f.properties.authority)}44`,
                    }}
                  >
                    {f.properties.authority}
                  </span>
                </div>
                <div className="plot-item-name">{f.properties.layout_name}</div>
                <div className="plot-item-meta">
                  <span>📐 {f.properties.area_sqyd} sqyd</span>
                  <span>↕ {f.properties.facing}</span>
                  <span>🛣 {f.properties.road_width_ft}ft road</span>
                </div>
                <div className="plot-item-price">
                  ~₹{(f.properties.price_per_sqyd_approx / 1000).toFixed(0)}K/sqyd
                </div>
              </button>
            ))}
            {filteredPlots.length > 80 && (
              <p className="more-hint">+{filteredPlots.length - 80} more — use filters to narrow down</p>
            )}
          </div>
        </div>

        {/* ── Center: Map ── */}
        <div className="tirupati-map-panel">
          <TirupatiMap
            plots={filteredPlots}
            selectedPlotId={selectedPlot?.properties.id || null}
            onPlotSelect={selectPlot}
            flyTo={mapFlyTo}
            authorityColor={authorityColor}
          />
          <div className="map-legend" aria-label="Map legend">
            <span className="legend-dot" style={{ background: '#3b82f6' }} /> TUDA
            <span className="legend-dot" style={{ background: '#10b981' }} /> DTCP
            <span className="legend-dot" style={{ background: '#f59e0b' }} /> Municipal
          </div>
        </div>

        {/* ── Right: Plot Detail ── */}
        <div className={`tirupati-detail-panel ${selectedPlot ? 'active' : ''}`}>
          {!selectedPlot ? (
            <div className="detail-empty">
              <MapPin size={40} />
              <h3>Select a plot</h3>
              <p>
                Click any plot on the map or from the list to see full details and generate your house
                plan.
              </p>
            </div>
          ) : (
            <div className="detail-content">
              <div className="detail-header">
                <div>
                  <div className="detail-plot-no">{selectedPlot.properties.plot_number}</div>
                  <div className="detail-layout-name">{selectedPlot.properties.layout_name}</div>
                </div>
                <span
                  className="detail-authority-badge"
                  style={{ background: authorityColor(selectedPlot.properties.authority) }}
                >
                  {selectedPlot.properties.authority}
                </span>
              </div>

              <div className="detail-dims">
                <div className="dim-card">
                  <span className="dim-label">Area</span>
                  <span className="dim-value">{selectedPlot.properties.area_sqyd} sq yd</span>
                  <span className="dim-sub">{selectedPlot.properties.area_sqft} sq ft</span>
                </div>
                <div className="dim-card">
                  <span className="dim-label">Dimensions</span>
                  <span className="dim-value">
                    {selectedPlot.properties.width_ft}×{selectedPlot.properties.depth_ft} ft
                  </span>
                  <span className="dim-sub">
                    {selectedPlot.properties.width_m}×{selectedPlot.properties.depth_m} m
                  </span>
                </div>
                <div className="dim-card">
                  <span className="dim-label">Facing</span>
                  <span className="dim-value">{selectedPlot.properties.facing}</span>
                  <span className="dim-sub">{selectedPlot.properties.road_width_ft}ft road</span>
                </div>
                <div className="dim-card">
                  <span className="dim-label">LP Number</span>
                  <span className="dim-value" style={{ fontSize: '0.75rem' }}>
                    {selectedPlot.properties.lp_number}
                  </span>
                  <span className="dim-sub">
                    Approved {selectedPlot.properties.layout_approved_year}
                  </span>
                </div>
              </div>

              {selectedPlot.properties.corner_plot && (
                <div className="corner-badge">⭐ Corner Plot — Extra setback on secondary road</div>
              )}

              {autoBrief && (
                <>
                  <div className="detail-section-title">TUDA Setbacks</div>
                  <div className="setback-table">
                    <div className="sb-row">
                      <span>Front</span>
                      <span>{autoBrief.setbacks.front_m}m</span>
                    </div>
                    <div className="sb-row">
                      <span>Rear</span>
                      <span>{autoBrief.setbacks.rear_m}m</span>
                    </div>
                    <div className="sb-row">
                      <span>Side (Left)</span>
                      <span>{autoBrief.setbacks.side_left_m}m</span>
                    </div>
                    <div className="sb-row">
                      <span>Side (Right)</span>
                      <span>{autoBrief.setbacks.side_right_m}m</span>
                    </div>
                    <div className="sb-row">
                      <span>Max FAR</span>
                      <span>{autoBrief.max_far}</span>
                    </div>
                  </div>

                  <div className="detail-section-title">AI Recommendation</div>
                  <div className="ai-rec">
                    <div className="rec-row">
                      <span>Suggested BHK</span>
                      <strong>{autoBrief.suggested_bhk} BHK</strong>
                    </div>
                    <div className="rec-row">
                      <span>Suggested Floors</span>
                      <strong>G+{autoBrief.suggested_floors}</strong>
                    </div>
                    <div className="rec-row">
                      <span>Climate Zone</span>
                      <strong>Composite (NBC)</strong>
                    </div>
                    <div className="rec-row">
                      <span>Seismic Zone</span>
                      <strong>Zone II (Low)</strong>
                    </div>
                  </div>
                </>
              )}

              <div className="detail-price">
                ≈ ₹{selectedPlot.properties.price_per_sqyd_approx.toLocaleString('en-IN')}/sqyd
                <span>
                  · Total ~₹
                  {(
                    (selectedPlot.properties.price_per_sqyd_approx *
                      selectedPlot.properties.area_sqyd) /
                    100000
                  ).toFixed(1)}
                  L land cost
                </span>
              </div>

              {selectedPlot.properties.amenities && selectedPlot.properties.amenities.length > 0 && (
                <>
                  <div className="detail-section-title">Amenities</div>
                  <div className="amenity-list">
                    {selectedPlot.properties.amenities.map((a: string) => (
                      <span key={a} className="amenity-chip">
                        {a}
                      </span>
                    ))}
                  </div>
                </>
              )}

              <div className="verify-links">
                <a href="https://tuda.ap.gov.in" target="_blank" rel="noopener noreferrer">
                  Verify on TUDA <ExternalLink size={12} />
                </a>
                <a href="https://meebhoomi.ap.gov.in" target="_blank" rel="noopener noreferrer">
                  Meebhoomi <ExternalLink size={12} />
                </a>
                <a href="https://bhunaksha.ap.gov.in" target="_blank" rel="noopener noreferrer">
                  Bhu-Naksha <ExternalLink size={12} />
                </a>
                <a href="https://rera.ap.gov.in" target="_blank" rel="noopener noreferrer">
                  RERA AP <ExternalLink size={12} />
                </a>
              </div>

              <button id="btn-generate-plan" className="generate-btn" onClick={goToStudio}>
                <Home size={18} /> Generate House Plan for This Plot
                <ChevronRight size={18} />
              </button>

              <p className="disclaimer">
                ⚠ Reference data only. Verify plot legal status at TUDA &amp; Meebhoomi before
                purchase.
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .tirupati-page {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 64px);
          overflow: hidden;
          background: #0a0a0f;
          color: #e2e8f0;
          font-family: var(--font-inter, system-ui, sans-serif);
        }

        /* ── Header ── */
        .tirupati-header {
          padding: 14px 24px;
          background: linear-gradient(135deg, #0f172a 0%, #1a2035 100%);
          border-bottom: 1px solid #1e293b;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-shrink: 0;
        }
        .tirupati-header-left h1 {
          font-size: 1.2rem;
          font-weight: 800;
          margin: 4px 0 2px;
          background: linear-gradient(135deg, #60a5fa, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .tirupati-header-left p {
          font-size: 0.78rem;
          color: #64748b;
          margin: 0;
        }
        .tirupati-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: linear-gradient(135deg, #1e3a5f, #1e1e3f);
          color: #60a5fa;
          font-size: 0.68rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: 20px;
          border: 1px solid #2563eb33;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .tirupati-stats {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .stat-chip {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #1a2235;
          border: 1px solid #2d3748;
          border-radius: 10px;
          padding: 6px 12px;
          font-size: 0.68rem;
          color: #64748b;
          min-width: 52px;
        }
        .stat-chip span {
          font-size: 1.15rem;
          font-weight: 800;
          color: #f1f5f9;
          line-height: 1.2;
        }
        .stat-chip.tuda span { color: #60a5fa; }
        .stat-chip.dtcp span { color: #34d399; }
        .stat-chip.muni span { color: #fbbf24; }

        /* ── 3-Panel Body ── */
        .tirupati-body {
          display: grid;
          grid-template-columns: 300px 1fr 340px;
          flex: 1;
          overflow: hidden;
        }

        /* ── Search Panel ── */
        .tirupati-search-panel {
          display: flex;
          flex-direction: column;
          background: #0d1117;
          border-right: 1px solid #1e293b;
          overflow: hidden;
        }
        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: #131c2e;
          border-bottom: 1px solid #1e293b;
          color: #64748b;
        }
        .search-box input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #f1f5f9;
          font-size: 0.85rem;
        }
        .search-box input::placeholder { color: #475569; }
        .search-box button {
          background: none;
          border: none;
          cursor: pointer;
          color: #64748b;
          padding: 2px;
          display: flex;
          align-items: center;
        }
        .search-box button:hover { color: #94a3b8; }

        .filter-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: none;
          border: none;
          border-bottom: 1px solid #1e293b;
          color: #64748b;
          font-size: 0.75rem;
          cursor: pointer;
          text-align: left;
          transition: color 0.15s;
        }
        .filter-toggle:hover { color: #94a3b8; background: #0f1825; }

        .filter-panel {
          padding: 12px;
          border-bottom: 1px solid #1e293b;
          display: flex;
          flex-direction: column;
          gap: 7px;
          background: #0b0f1a;
        }
        .filter-panel label {
          font-size: 0.68rem;
          color: #475569;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .filter-panel select,
        .filter-panel input[type="number"] {
          width: 100%;
          background: #131c2e;
          border: 1px solid #2d3748;
          color: #f1f5f9;
          padding: 6px 8px;
          border-radius: 6px;
          font-size: 0.8rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .filter-panel select:focus,
        .filter-panel input[type="number"]:focus { border-color: #3b82f6; }
        .range-row { display: flex; align-items: center; gap: 6px; }
        .range-row input { width: calc(50% - 10px) !important; }
        .range-row span { color: #334155; }
        .checkbox-label {
          display: flex !important;
          align-items: center;
          gap: 8px;
          color: #94a3b8 !important;
          font-size: 0.8rem !important;
          text-transform: none !important;
          letter-spacing: 0 !important;
          cursor: pointer;
          font-weight: 400 !important;
        }

        .results-count {
          padding: 7px 12px;
          font-size: 0.7rem;
          color: #475569;
          border-bottom: 1px solid #1e293b;
          background: #0d1117;
        }

        /* ── Plot List ── */
        .plot-list {
          flex: 1;
          overflow-y: auto;
          padding: 6px;
        }
        .plot-list::-webkit-scrollbar { width: 4px; }
        .plot-list::-webkit-scrollbar-track { background: #0d1117; }
        .plot-list::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 2px; }

        .plot-list-item {
          width: 100%;
          text-align: left;
          background: #111827;
          border: 1px solid #1e293b;
          border-radius: 9px;
          padding: 9px 11px;
          margin-bottom: 5px;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .plot-list-item:hover {
          background: #172033;
          border-color: #3b82f633;
          transform: translateX(1px);
        }
        .plot-list-item.selected {
          background: #172d4a;
          border-color: #3b82f6;
          box-shadow: 0 0 0 1px #3b82f622, 0 2px 8px rgba(59,130,246,0.15);
        }
        .plot-item-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 3px;
        }
        .plot-no { font-weight: 700; font-size: 0.8rem; color: #f1f5f9; }
        .authority-badge {
          font-size: 0.62rem;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          letter-spacing: 0.03em;
        }
        .plot-item-name {
          font-size: 0.7rem;
          color: #94a3b8;
          margin-bottom: 4px;
          line-height: 1.3;
        }
        .plot-item-meta {
          display: flex;
          gap: 8px;
          font-size: 0.66rem;
          color: #475569;
          flex-wrap: wrap;
          margin-bottom: 3px;
        }
        .plot-item-price { font-size: 0.7rem; color: #fbbf24; font-weight: 700; }
        .more-hint {
          text-align: center;
          color: #334155;
          font-size: 0.7rem;
          padding: 10px;
          font-style: italic;
        }

        /* ── Map Panel ── */
        .tirupati-map-panel {
          position: relative;
          background: #080e1c;
        }
        .tirupati-map-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 14px;
          color: #334155;
        }
        .tirupati-map-loading p { font-size: 0.8rem; }
        .map-spinner {
          width: 36px;
          height: 36px;
          border: 3px solid #1e293b;
          border-top-color: #3b82f6;
          border-radius: 50%;
          animation: tirupati-spin 0.9s linear infinite;
        }
        @keyframes tirupati-spin { to { transform: rotate(360deg); } }

        .map-legend {
          position: absolute;
          bottom: 16px;
          left: 16px;
          background: #0f172aee;
          border: 1px solid #334155;
          border-radius: 8px;
          padding: 7px 12px;
          display: flex;
          gap: 14px;
          align-items: center;
          font-size: 0.7rem;
          color: #94a3b8;
          z-index: 1000;
          backdrop-filter: blur(8px);
        }
        .legend-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          margin-right: 4px;
          vertical-align: middle;
        }

        /* ── Detail Panel ── */
        .tirupati-detail-panel {
          background: #0d1117;
          border-left: 1px solid #1e293b;
          overflow-y: auto;
          transition: opacity 0.3s;
        }
        .tirupati-detail-panel::-webkit-scrollbar { width: 4px; }
        .tirupati-detail-panel::-webkit-scrollbar-thumb { background: #2d3748; border-radius: 2px; }

        .detail-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 12px;
          color: #2d3748;
          padding: 32px;
          text-align: center;
        }
        .detail-empty h3 { color: #334155; margin: 0; font-size: 1rem; }
        .detail-empty p { font-size: 0.78rem; color: #1e293b; line-height: 1.5; }

        .detail-content { padding: 16px; }

        .detail-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 14px;
          padding-bottom: 12px;
          border-bottom: 1px solid #1e293b;
        }
        .detail-plot-no { font-size: 1rem; font-weight: 800; color: #f1f5f9; }
        .detail-layout-name { font-size: 0.72rem; color: #64748b; margin-top: 3px; line-height: 1.4; }
        .detail-authority-badge {
          font-size: 0.68rem;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 6px;
          color: #fff;
          flex-shrink: 0;
          letter-spacing: 0.04em;
        }

        .detail-dims {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px;
          margin-bottom: 14px;
        }
        .dim-card {
          background: #111827;
          border: 1px solid #1e293b;
          border-radius: 8px;
          padding: 9px 11px;
        }
        .dim-label {
          display: block;
          font-size: 0.6rem;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 3px;
        }
        .dim-value { display: block; font-size: 0.88rem; font-weight: 700; color: #f1f5f9; }
        .dim-sub { display: block; font-size: 0.66rem; color: #64748b; margin-top: 1px; }

        .corner-badge {
          background: #78350f18;
          border: 1px solid #f59e0b33;
          color: #fbbf24;
          border-radius: 7px;
          padding: 6px 11px;
          font-size: 0.72rem;
          margin-bottom: 12px;
        }

        .detail-section-title {
          font-size: 0.63rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #475569;
          margin: 12px 0 7px;
        }

        .setback-table {
          background: #111827;
          border: 1px solid #1e293b;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 10px;
        }
        .sb-row {
          display: flex;
          justify-content: space-between;
          padding: 7px 12px;
          border-bottom: 1px solid #0d1117;
          font-size: 0.76rem;
        }
        .sb-row:last-child { border-bottom: none; }
        .sb-row span:first-child { color: #64748b; }
        .sb-row span:last-child { color: #f1f5f9; font-weight: 600; }

        .ai-rec {
          background: #111827;
          border: 1px solid #1e293b;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 12px;
        }
        .rec-row {
          display: flex;
          justify-content: space-between;
          padding: 7px 12px;
          border-bottom: 1px solid #0d1117;
          font-size: 0.76rem;
        }
        .rec-row:last-child { border-bottom: none; }
        .rec-row span { color: #64748b; }
        .rec-row strong { color: #60a5fa; }

        .detail-price {
          background: #1a2235;
          border: 1px solid #2d3748;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 0.8rem;
          color: #fbbf24;
          font-weight: 700;
          margin-bottom: 12px;
        }
        .detail-price span {
          font-weight: 400;
          color: #64748b;
          font-size: 0.7rem;
          margin-left: 4px;
        }

        .amenity-list {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-bottom: 12px;
        }
        .amenity-chip {
          background: #1a2a1a;
          border: 1px solid #2d4a2d;
          color: #4ade80;
          font-size: 0.65rem;
          padding: 3px 8px;
          border-radius: 4px;
        }

        .verify-links {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .verify-links a {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.66rem;
          color: #60a5fa;
          background: #1e3a5f18;
          border: 1px solid #2563eb22;
          border-radius: 6px;
          padding: 4px 8px;
          text-decoration: none;
          transition: background 0.15s;
        }
        .verify-links a:hover { background: #1e3a5f44; }

        .generate-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 16px;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          border: none;
          border-radius: 10px;
          color: #fff;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          margin-bottom: 10px;
          transition: opacity 0.2s, transform 0.15s;
          box-shadow: 0 4px 20px rgba(37,99,235,0.3);
        }
        .generate-btn:hover { opacity: 0.92; transform: translateY(-1px); }
        .generate-btn:active { transform: translateY(0); }

        .disclaimer {
          font-size: 0.63rem;
          color: #2d3748;
          text-align: center;
          line-height: 1.5;
          margin: 0;
        }
      `}</style>
    </div>
  );
}
