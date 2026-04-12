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
  let _colorMode  = 'hdi';  // 'hdi' | 'income'
  let _highlightIso3 = null;       // single-country highlight
  let _highlightFilter = null;     // function(iso3) → bool for group highlight
  const _layerByIso3 = {};         // iso3 → [layer, ...]

  // Income-group colours: 4 discrete samples from the HDI ramp.
  function _incomeColor(group) {
    switch (group) {
      case 'low':          return hdiColor(0.10);
      case 'lower_middle': return hdiColor(0.35);
      case 'upper_middle': return hdiColor(0.65);
      case 'high':         return hdiColor(0.90);
      default:             return '#9ca3af';
    }
  }

  function setColorMode(mode) {
    _colorMode = (mode === 'income') ? 'income' : 'hdi';
    _refresh();
  }
  function getColorMode() { return _colorMode; }

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
    const union   = iso3 ? Data.COUNTRY_BY_ISO3[iso3] : null;
    const noDataEntry = iso3 ? Data.NO_HDI_BY_ISO3[iso3] : null;
    const selected = iso3 ? _selected.has(iso3) : false;

    let fillColor, fillOpacity;
    if (selected) {
      fillColor = '#58a6ff';
      fillOpacity = 0.75;
    } else if (union && _colorMode === 'income' && union.incomeGroup) {
      fillColor = _incomeColor(union.incomeGroup);
      fillOpacity = 0.80;
    } else if (union && _colorMode === 'income' && !union.incomeGroup) {
      fillColor = '#9ca3af';
      fillOpacity = 0.45;
    } else if (union && Number.isFinite(union.hdi)) {
      fillColor = hdiColor(union.hdi);
      fillOpacity = 0.80;
    } else if (noDataEntry) {
      fillColor = '#9ca3af';
      fillOpacity = 0.65;
    } else {
      fillColor = '#d1d5db';
      fillOpacity = 0.35;
    }

    // Dim when another country/group is highlighted.
    const isHighlighted = _highlightIso3
      ? (iso3 === _highlightIso3)
      : _highlightFilter
        ? (iso3 && _highlightFilter(iso3))
        : true;
    if (!isHighlighted && (_highlightIso3 || _highlightFilter)) {
      fillOpacity *= 0.22;
    }

    return {
      fillColor,
      fillOpacity,
      color: selected ? '#2563eb' : (noDataEntry ? '#6b7280' : '#fff'),
      weight: selected ? 1.5 : (noDataEntry ? 1.1 : 0.6),
      dashArray: noDataEntry ? '4 2' : undefined,
    };
  }

  function _buildTooltip(iso3) {
    if (!iso3) return '—';
    const union = Data.COUNTRY_BY_ISO3[iso3];
    const noDataEntry = Data.NO_HDI_BY_ISO3[iso3];

    if (!union && !noDataEntry) return iso3;

    const lang = (typeof I18n !== 'undefined' && I18n.getLang) ? I18n.getLang() : 'en';
    const country = union ? Data.getCountryLabel(iso3, lang) : noDataEntry.country;
    const lines = [`<strong>${country}</strong>`];

    if (union && Number.isFinite(union.hdi)) {
      const yearSuffix = union.hdiYear ? ` (${union.hdiYear})` : '';
      lines.push(`${I18n.t('tooltip_hdi', { hdi: union.hdi.toFixed(3) })}${yearSuffix}`);
    } else if (union) {
      lines.push(I18n.t('no_hdi_data'));
    }

    if (union && union.incomeGroup) {
      const groupLabel = I18n.t(`income_group_${union.incomeGroup}`);
      const yearSuffix = union.incomeYear ? ` (${union.incomeYear})` : '';
      lines.push(`${groupLabel}${yearSuffix}`);
    }

    if (!union && noDataEntry) {
      lines.push(I18n.t('no_hdi_data'));
    }

    return lines.join('<br>');
  }

  function _bindFeature(feature, layer) {
    const iso3 = _resolveIso3(feature);
    const isSelectable = iso3 && Data.COUNTRY_BY_ISO3[iso3];

    if (iso3) {
      if (!_layerByIso3[iso3]) _layerByIso3[iso3] = [];
      _layerByIso3[iso3].push(layer);
    }

    layer.on('mouseover', () => {
      layer.bindTooltip(_buildTooltip(iso3), { sticky: true }).openTooltip();
      if (iso3) {
        _highlightIso3 = iso3;
        _highlightFilter = null;
        _refresh();
      }
    });

    layer.on('mouseout', () => {
      if (_highlightIso3 === iso3) {
        _highlightIso3 = null;
        _refresh();
      }
    });

    if (isSelectable) {
      layer.on('click', () => {
        const nowSelected = !_selected.has(iso3);
        _onToggle(iso3, nowSelected);
      });
    }
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
  /**
   * Highlight countries matching a filter function.
   * Pass null to clear the highlight.
   * @param {((iso3: string) => boolean)|null} filterFn
   */
  function setHighlightFilter(filterFn) {
    _highlightFilter = filterFn;
    _highlightIso3 = null;
    _refresh();
  }

  return { init, setSelected, setColorMode, getColorMode, setHighlightFilter };
})();
