/**
 * map.js — Leaflet world map with HDI colouring and click-to-select.
 *
 * Loads world GeoJSON with built-in alpha-3 country codes,
 * then colours by HDI and selection state.
 */
const MapView = (() => {

  // ── Colour helpers ────────────────────────────────────────────────

  // Standard intuitive multitone gradient mapped to HDI [0, 1]
  const STOPS = [
    [0.00, [215,  25,  28]],
    [0.20, [253, 174,  97]],
    [0.40, [255, 255, 191]],
    [0.60, [217, 239, 139]],
    [0.80, [145, 207,  96]],
    [1.00, [ 26, 152,  80]],
  ];

  function hdiColor(hdi) {
    for (let i = 0; i < STOPS.length - 1; i++) {
      const [lo, cLo] = STOPS[i];
      const [hi, cHi] = STOPS[i + 1];
      if (hdi <= hi) {
        const t = (hdi - lo) / (hi - lo);
        const r = Math.round(cLo[0] + t * (cHi[0] - cLo[0]));
        const g = Math.round(cLo[1] + t * (cHi[1] - cLo[1]));
        const b = Math.round(cLo[2] + t * (cHi[2] - cLo[2]));
        return `rgb(${r},${g},${b})`;
      }
    }
    return '#aaa';
  }

  // ── State ─────────────────────────────────────────────────────────
  let _map        = null;
  let _geoLayer   = null;
  let _onToggle   = null;   // callback(iso3, selected: bool)

  function _resolveIso3(feature) {
    const byProps = feature?.properties?.cca3
      ?? feature?.properties?.iso_a3
      ?? feature?.properties?.adm0_a3
      ?? feature?.properties?.ISO_A3
      ?? feature?.properties?.ADM0_A3
      ?? feature?.properties?.['ISO3166-1-Alpha-3'];

    if (byProps) {
      const iso3 = String(byProps).toUpperCase();
      if (/^[A-Z]{3}$/.test(iso3)) return iso3;
    }

    const byIso2 = feature?.properties?.['ISO3166-1-Alpha-2'];
    if (byIso2) {
      const resolved = Data.resolve(String(byIso2));
      if (resolved) return resolved;
    }

    const name = feature?.properties?.name
      ?? feature?.properties?.ADMIN
      ?? feature?.properties?.admin;
    if (!name) return null;
    return Data.resolve(name);
  }

  // ── Init ──────────────────────────────────────────────────────────
  async function init(containerId, onToggle) {
    _onToggle = onToggle;

    _map = L.map(containerId, {
      worldCopyJump: false,
      minZoom: 1,
      maxZoom: 6,
      zoomSnap: 0.5,
    }).setView([20, 10], 1.5);

    // No tile layer — background is controlled by CSS theme variables

    const geojson = _normalizeAntimeridian(await _loadWorldGeoJson());

    _geoLayer = L.geoJSON(geojson, {
      coordsToLatLng: coords => L.latLng(coords[1], coords[0], true),
      style:        _styleFeature,
      onEachFeature: _bindFeature,
    }).addTo(_map);

    window.setTimeout(() => _map.invalidateSize(), 0);
    window.addEventListener('resize', () => {
      if (_map) _map.invalidateSize();
    });
  }

  async function _loadWorldGeoJson() {
    const sources = [
      'https://cdn.jsdelivr.net/gh/datasets/geo-countries@master/data/countries.geojson',
      'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
    ];

    for (const url of sources) {
      try {
        const res = await fetch(url);
        if (res.ok) return await res.json();
      } catch {
        // try next source
      }
    }

    throw new Error('Unable to load world GeoJSON from known sources');
  }

  function _unwrapRing(ring) {
    if (!Array.isArray(ring) || ring.length === 0) return ring;

    const out = [];
    let prevLon = Number(ring[0][0]);
    out.push([prevLon, Number(ring[0][1])]);

    for (let i = 1; i < ring.length; i++) {
      const lat = Number(ring[i][1]);
      let lon = Number(ring[i][0]);

      while (lon - prevLon > 180) lon -= 360;
      while (lon - prevLon < -180) lon += 360;

      out.push([lon, lat]);
      prevLon = lon;
    }

    return out;
  }

  function _normalizeGeometry(geometry) {
    if (!geometry || !geometry.type) return geometry;

    if (geometry.type === 'Polygon') {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(_unwrapRing),
      };
    }

    if (geometry.type === 'MultiPolygon') {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map(poly => poly.map(_unwrapRing)),
      };
    }

    return geometry;
  }

  function _normalizeAntimeridian(geojson) {
    if (!geojson || !Array.isArray(geojson.features)) return geojson;

    return {
      ...geojson,
      features: geojson.features.map(feature => ({
        ...feature,
        geometry: _normalizeGeometry(feature.geometry),
      })),
    };
  }

  // ── Styling ───────────────────────────────────────────────────────
  function _styleFeature(feature) {
    const iso3    = _resolveIso3(feature);
    const entry   = iso3 ? Data.HDI_BY_ISO3[iso3] : null;
    const noDataEntry = iso3 ? Data.NO_HDI_BY_ISO3[iso3] : null;
    const selected = iso3 ? _selected.has(iso3) : false;

    return {
      fillColor:   selected ? '#58a6ff' : (entry ? hdiColor(entry.hdi) : (noDataEntry ? '#9ca3af' : '#d1d5db')),
      fillOpacity: selected ? 0.75 : (entry ? 0.80 : (noDataEntry ? 0.65 : 0.35)),
      color:       selected ? '#2563eb' : (noDataEntry ? '#6b7280' : '#fff'),
      weight:      selected ? 1.5 : (noDataEntry ? 1.1 : 0.6),
      dashArray:   noDataEntry ? '4 2' : undefined,
    };
  }

  function _bindFeature(feature, layer) {
    const iso3  = _resolveIso3(feature);
    const entry = iso3 ? Data.HDI_BY_ISO3[iso3] : null;

    if (!entry) {
      const noDataEntry = iso3 ? Data.NO_HDI_BY_ISO3[iso3] : null;
      layer.on('mouseover', () =>
        layer.bindTooltip(
          noDataEntry
            ? `<strong>${noDataEntry.country}</strong><br>${I18n.t('no_hdi_data')}`
            : (iso3 ?? '—'),
          { sticky: true }
        ).openTooltip()
      );
      return;
    }

    layer.on('mouseover', () => {
      const yearPart = entry.year ? `<br>${I18n.t('tooltip_year', { year: entry.year })}` : '';
      layer.bindTooltip(
        `<strong>${entry.country}</strong><br>${I18n.t('tooltip_hdi', { hdi: entry.hdi.toFixed(3) })}${yearPart}`,
        { sticky: true }
      ).openTooltip();
    });

    layer.on('click', () => {
      const nowSelected = !_selected.has(iso3);
      _onToggle(iso3, nowSelected);      // let app.js update state
    });
  }

  // ── Selection (read from external state) ─────────────────────────
  const _selected = new Set();   // kept in sync by App

  function setSelected(iso3Set) {
    _selected.clear();
    for (const iso3 of iso3Set) _selected.add(iso3);
    _refresh();
  }

  function _refresh() {
    if (!_geoLayer) return;
    _geoLayer.setStyle(_styleFeature);
  }

  // ── Public ────────────────────────────────────────────────────────
  return { init, setSelected };
})();
