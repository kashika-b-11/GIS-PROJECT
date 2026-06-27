const map = L.map('map', { preferCanvas: true }).setView([31.1048, 77.1734], 8);
const listEl = document.getElementById('list');
const searchForm = document.getElementById('village-search');
const searchInput = document.getElementById('village-query');

let villagesLayer;
let assetsLayer;
let highlightedLayer;
let panchayatBubbleLayer;
let activeRequestId = 0;
const panchayatCache = new Map();
const assetCache = new Map();

const assetColors = {
    health: { stroke: '#c62828', fill: '#ff8a80', label: 'Health' },
    education: { stroke: '#1565c0', fill: '#82b1ff', label: 'Education' },
    safety: { stroke: '#6a1b9a', fill: '#ce93d8', label: 'Safety' },
    infrastructure: { stroke: '#ef6c00', fill: '#ffcc80', label: 'Infrastructure' },
    governance: { stroke: '#2e7d32', fill: '#a5d6a7', label: 'Governance' },
    livelihood: { stroke: '#00897b', fill: '#80cbc4', label: 'Livelihood' },
    forest: { stroke: '#33691e', fill: '#c5e1a5', label: 'Forest' },
    other: { stroke: '#455a64', fill: '#b0bec5', label: 'Other' }
};

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

function getProp(feature, names) {
    for (const n of names) {
        if (feature.properties && feature.properties[n] !== undefined && feature.properties[n] !== null && feature.properties[n] !== '') {
            return feature.properties[n];
        }
    }
    return undefined;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function getPanchayatName(feature) {
    return getProp(feature, ['panchayat', 'Gram_Panch', 'Gram_Panchayat', 'PANCHAYAT', 'Panchayat', 'NAME', 'Name']) || 'Panchayat';
}

function getVillageName(feature) {
    return getProp(feature, ['Village_Ve', 'Village_Name', 'Village', 'VILLAGE', 'NAME', 'NAME_', 'Village_Na']) || 'Village';
}

function featureLatLng(feature) {
    const geometry = feature && feature.geometry;
    if (!geometry || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates)) return null;
    return [geometry.coordinates[1], geometry.coordinates[0]];
}

function getVillageDetails(feature) {
    const latlng = featureLatLng(feature);
    return {
        name: getVillageName(feature),
        district: getProp(feature, ['District_C']) || '',
        block: getProp(feature, ['Block_Code']) || '',
        subDistrict: getProp(feature, ['Sub_Distri']) || '',
        lat: latlng ? latlng[0] : null,
        lng: latlng ? latlng[1] : null
    };
}

function getAssetName(feature) {
    return getProp(feature, ['asset_name']) || 'Unnamed asset';
}

function formatCoordinate(value) {
    return Number.isFinite(value) ? value.toFixed(6) : 'Not available';
}

function setSidebar(html) {
    listEl.innerHTML = html;
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.json();
}

function clearHighlight() {
    if (highlightedLayer) {
        map.removeLayer(highlightedLayer);
        highlightedLayer = null;
    }
}

function clearAssetsLayer() {
    if (assetsLayer) {
        map.removeLayer(assetsLayer);
        assetsLayer = null;
    }
}

function clearPanchayatBubble() {
    if (panchayatBubbleLayer) {
        map.removeLayer(panchayatBubbleLayer);
        panchayatBubbleLayer = null;
    }
}

function haversineKm(lat1, lng1, lat2, lng2) {
    const earthRadiusKm = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function collectFeaturePoints(features) {
    return features.map(featureLatLng).filter(point => Array.isArray(point));
}

function buildVillagePopup(details, highlighted = false) {
    const districtLine = details.district ? `<br/>District: ${escapeHtml(details.district)}` : '';
    const blockLine = details.block ? `<br/>Block: ${escapeHtml(details.block)}` : '';
    const subDistrictLine = details.subDistrict ? `<br/>Sub-district: ${escapeHtml(details.subDistrict)}` : '';

    return `
        <strong>${escapeHtml(details.name)}</strong>
        ${highlighted ? '<br/><span class="muted">Selected village</span>' : ''}
        <br/>Latitude: ${formatCoordinate(details.lat)}
        <br/>Longitude: ${formatCoordinate(details.lng)}
        ${districtLine}${blockLine}${subDistrictLine}
    `;
}

function buildAssetPopup(feature) {
    const props = feature.properties || {};
    const category = assetColors[props.asset_category] || assetColors.other;
    const distanceLine = props.distance_km !== undefined ? `<br/>Distance: ${escapeHtml(String(props.distance_km))} km` : '';
    const panchayatLine = props.panchayat_name ? `<br/>Panchayat: ${escapeHtml(props.panchayat_name)}` : '';
    const villageLine = props.village_name ? `<br/>Village: ${escapeHtml(props.village_name)}` : '';
    const districtLine = props.district_name ? `<br/>District: ${escapeHtml(props.district_name)}` : '';
    const blockLine = props.block_name ? `<br/>Block: ${escapeHtml(props.block_name)}` : '';
    const officeLine = props.office_name ? `<br/>Office: ${escapeHtml(props.office_name)}` : '';
    const addressLine = props.asset_address ? `<br/>Address: ${escapeHtml(props.asset_address)}` : '';

    return `
        <strong>${escapeHtml(getAssetName(feature))}</strong>
        <br/><span class="muted">${escapeHtml(category.label)} - ${escapeHtml(props.department_name || '')}</span>
        ${distanceLine}${panchayatLine}${villageLine}${districtLine}${blockLine}${officeLine}${addressLine}
    `;
}

function buildVillageAssetsPopup(villages, panchayatName, assets = null) {
    const sortedVillageFeatures = [...villages.features]
        .sort((a, b) => String(getVillageName(a)).localeCompare(String(getVillageName(b))));
    const sortedAssetFeatures = assets
        ? [...assets.features].sort((a, b) => String(getAssetName(a)).localeCompare(String(getAssetName(b))))
        : [];

    return `
        <div style="min-width:260px;max-width:360px">
            <strong>${escapeHtml(panchayatName)}</strong>
            <div class="muted">${sortedVillageFeatures.length} villages, ${sortedAssetFeatures.length} nearby assets</div>
            <div style="max-height:180px;overflow:auto;margin-top:6px">
                <ul style="margin:0 0 0 18px;padding:0">
                    ${sortedVillageFeatures.map(feature => {
                        const details = getVillageDetails(feature);
                        return `<li>
                            <strong>${escapeHtml(details.name)}</strong>
                            <div class="muted">Lat ${formatCoordinate(details.lat)}, Lng ${formatCoordinate(details.lng)}</div>
                        </li>`;
                    }).join('')}
                </ul>
            </div>
            <div style="margin-top:8px"><strong>Nearby assets</strong></div>
            <div style="max-height:140px;overflow:auto;margin-top:4px">
                <ul style="margin:0 0 0 18px;padding:0">
                    ${sortedAssetFeatures.map(feature => {
                        const props = feature.properties || {};
                        return `<li>
                            <strong>${escapeHtml(getAssetName(feature))}</strong>
                            <div class="muted">${escapeHtml(assetColors[props.asset_category]?.label || props.asset_category || 'Asset')} - ${escapeHtml(String(props.distance_km ?? ''))} km</div>
                        </li>`;
                    }).join('')}
                </ul>
            </div>
        </div>
    `;
}

function buildPanchayatBubblePopup(panchayatName, villages, assets) {
    const categoryCounts = {};
    for (const feature of assets.features) {
        const key = feature.properties?.asset_category || 'other';
        categoryCounts[key] = (categoryCounts[key] || 0) + 1;
    }

    const categoryLines = Object.entries(categoryCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, count]) => `<li>${escapeHtml(assetColors[key]?.label || key)}: ${count}</li>`)
        .join('');

    return `
        <div style="min-width:220px;max-width:300px">
            <strong>${escapeHtml(panchayatName)}</strong>
            <div class="muted">${villages.features.length} villages inside this panchayat</div>
            <div class="muted">${assets.features.length} nearby assets in the selected area</div>
            <div style="margin-top:8px"><strong>Asset groups</strong></div>
            <ul style="margin:4px 0 0 18px;padding:0">
                ${categoryLines || '<li>No nearby assets found</li>'}
            </ul>
        </div>
    `;
}

function zoomToFeature(feature) {
    const latlng = featureLatLng(feature);
    if (!latlng) return;
    const details = getVillageDetails(feature);

    clearHighlight();
    highlightedLayer = L.circleMarker(latlng, {
        radius: 11,
        color: '#b00020',
        weight: 3,
        fillColor: '#ffeb3b',
        fillOpacity: 0.95
    }).bindPopup(buildVillagePopup(details, true)).addTo(map);

    map.setView(latlng, Math.max(map.getZoom(), 14), { animate: false });
    highlightedLayer.openPopup();
}

function zoomToAsset(feature) {
    const latlng = featureLatLng(feature);
    if (!latlng) return;

    clearHighlight();
    map.setView(latlng, Math.max(map.getZoom(), 14), { animate: false });
    L.popup({ offset: [0, -10] })
        .setLatLng(latlng)
        .setContent(buildAssetPopup(feature))
        .openOn(map);
}

function renderPanchayats(panchayats) {
    L.geoJSON(panchayats, {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
            radius: 6,
            color: '#2E86AB',
            fillColor: '#5DB7DE',
            weight: 2,
            fillOpacity: 0.9
        }),
        style: { color: '#2E86AB', weight: 2, fillOpacity: 0.1 },
        onEachFeature: (feature, layer) => {
            const pname = getPanchayatName(feature);
            const villageCount = feature.properties && feature.properties.village_count;
            const label = escapeHtml(pname) + (villageCount ? ` (${villageCount} villages)` : '');

            layer.bindPopup(label);
            layer.on('click', () => showPanchayat(pname, '', layer));
        }
    }).addTo(map);
}

function renderVillages(villages, panchayatName, highlightVillageName = '') {
    if (villagesLayer) {
        map.removeLayer(villagesLayer);
    }
    clearHighlight();
    clearAssetsLayer();
    clearPanchayatBubble();

    villagesLayer = L.geoJSON(villages, {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
            radius: 8,
            color: '#7b1fa2',
            weight: 3,
            fillColor: '#ffca28',
            fillOpacity: 0.95
        }),
        onEachFeature: (feature, layer) => {
            const details = getVillageDetails(feature);
            layer.bindPopup(buildVillagePopup(details));
            layer.bindTooltip(escapeHtml(details.name), {
                permanent: true,
                direction: 'top',
                offset: [0, -8],
                className: 'village-label'
            });
        }
    }).addTo(map);

    const highlightedFeature = highlightVillageName
        ? villages.features.find(feature => getVillageName(feature).toLowerCase() === highlightVillageName.toLowerCase())
        : null;

    if (highlightedFeature) {
        zoomToFeature(highlightedFeature);
        return;
    }

    if (villagesLayer.getBounds().isValid()) {
        map.fitBounds(villagesLayer.getBounds(), { padding: [30, 30], maxZoom: 13, animate: false });
    }
}

function renderAssets(assets) {
    clearAssetsLayer();
    assetsLayer = L.geoJSON(assets, {
        pointToLayer: (feature, latlng) => {
            const colors = assetColors[feature.properties?.asset_category] || assetColors.other;
            return L.circleMarker(latlng, {
                radius: 7,
                color: colors.stroke,
                weight: 2,
                fillColor: colors.fill,
                fillOpacity: 0.95
            });
        },
        onEachFeature: (feature, layer) => {
            layer.bindPopup(buildAssetPopup(feature));
        }
    }).addTo(map);
}

function renderPanchayatBubble(panchayatName, villages, assets) {
    clearPanchayatBubble();

    const points = collectFeaturePoints(villages.features).concat(collectFeaturePoints(assets.features));
    if (!points.length) return;

    const centerLat = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const centerLng = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    const maxDistanceKm = points.reduce((max, point) => Math.max(max, haversineKm(centerLat, centerLng, point[0], point[1])), 0);
    const radiusMeters = Math.max(1200, Math.min(25000, maxDistanceKm * 1000 + 600));

    panchayatBubbleLayer = L.layerGroup([
        L.circle([centerLat, centerLng], {
            radius: radiusMeters,
            color: '#00695c',
            weight: 2,
            dashArray: '8 6',
            fillColor: '#80cbc4',
            fillOpacity: 0.12
        }),
        L.circleMarker([centerLat, centerLng], {
            radius: 12,
            color: '#004d40',
            weight: 3,
            fillColor: '#26a69a',
            fillOpacity: 0.95
        }).bindPopup(buildPanchayatBubblePopup(panchayatName, villages, assets))
    ]).addTo(map);
}

async function loadPanchayatVillages(panchayatName) {
    if (panchayatCache.has(panchayatName)) {
        return panchayatCache.get(panchayatName);
    }

    const villages = await fetchJson(`/api/villages?panchayat=${encodeURIComponent(panchayatName)}`);
    panchayatCache.set(panchayatName, villages);
    return villages;
}

async function loadPanchayatAssets(panchayatName) {
    if (assetCache.has(panchayatName)) {
        return assetCache.get(panchayatName);
    }

    const assets = await fetchJson(`/api/assets?panchayat=${encodeURIComponent(panchayatName)}&limit=60`);
    assetCache.set(panchayatName, assets);
    return assets;
}

function buildSidebarWithAssets(panchayatName, villages, assets) {
    const sortedVillageFeatures = [...villages.features].sort((a, b) => String(getVillageName(a)).localeCompare(String(getVillageName(b))));
    const categories = {};
    for (const feature of assets.features) {
        const props = feature.properties || {};
        const categoryKey = props.asset_category || 'other';
        categories[categoryKey] = categories[categoryKey] || [];
        categories[categoryKey].push(feature);
    }

    const categoryBlocks = Object.entries(categories)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([categoryKey, features]) => {
            const meta = assetColors[categoryKey] || assetColors.other;
            return `
                <div style="margin-top:10px">
                    <strong>${escapeHtml(meta.label)} (${features.length})</strong>
                    <ul>
                        ${features.slice(0, 10).map((feature, index) => {
                            const props = feature.properties || {};
                            return `<li>
                                <button class="asset-button" data-asset-category="${escapeHtml(categoryKey)}" data-asset-index="${index}">${escapeHtml(getAssetName(feature))}</button>
                                <div class="muted">${escapeHtml(String(props.distance_km ?? ''))} km - ${props.village_name ? escapeHtml(props.village_name) : 'Location available'}</div>
                            </li>`;
                        }).join('')}
                    </ul>
                </div>
            `;
        }).join('');

    return `
        <h3>${escapeHtml(panchayatName)} - ${sortedVillageFeatures.length} villages</h3>
        <p class="muted">The teal circle shows the selected panchayat area. Yellow and purple markers show villages. Colored markers show nearby assets.</p>
        <ul>
            ${sortedVillageFeatures.map((feature, index) => {
                const details = getVillageDetails(feature);
                return `<li>
                    <button class="village-button" data-village-index="${index}">${escapeHtml(details.name)}</button>
                    <div class="muted">Lat ${formatCoordinate(details.lat)}, Lng ${formatCoordinate(details.lng)}</div>
                </li>`;
            }).join('')}
        </ul>
        <div style="margin-top:10px"><strong>Nearby assets (${assets.features.length})</strong></div>
        ${categoryBlocks || '<div class="muted">No nearby assets found.</div>'}
    `;
}

function bindSidebarVillageLinks(villages) {
    const sortedVillageFeatures = [...villages.features].sort((a, b) => String(getVillageName(a)).localeCompare(String(getVillageName(b))));
    listEl.querySelectorAll('[data-village-index]').forEach(button => {
        button.addEventListener('click', () => {
            zoomToFeature(sortedVillageFeatures[Number(button.dataset.villageIndex)]);
        });
    });
}

function bindSidebarAssetLinks(assets) {
    const categories = {};
    for (const feature of assets.features) {
        const key = feature.properties?.asset_category || 'other';
        categories[key] = categories[key] || [];
        categories[key].push(feature);
    }

    listEl.querySelectorAll('[data-asset-category][data-asset-index]').forEach(button => {
        button.addEventListener('click', () => {
            const category = button.dataset.assetCategory;
            const index = Number(button.dataset.assetIndex);
            const feature = (categories[category] || [])[index];
            if (feature) zoomToAsset(feature);
        });
    });
}

async function showPanchayat(panchayatName, highlightVillageName = '', sourceLayer = null) {
    const requestId = ++activeRequestId;
    setSidebar(`<h3>${escapeHtml(panchayatName)}</h3><p>Loading villages and nearby assets...</p>`);

    if (sourceLayer) {
        sourceLayer
            .setPopupContent(`<strong>${escapeHtml(panchayatName)}</strong><p>Loading assets...</p>`)
            .openPopup();
    }

    try {
        const villages = await loadPanchayatVillages(panchayatName);
        const assets = await loadPanchayatAssets(panchayatName);
        if (requestId !== activeRequestId) return;

        renderVillages(villages, panchayatName, highlightVillageName);
        renderAssets(assets);
        renderPanchayatBubble(panchayatName, villages, assets);
        setSidebar(buildSidebarWithAssets(panchayatName, villages, assets));
        bindSidebarVillageLinks(villages);
        bindSidebarAssetLinks(assets);

        if (sourceLayer) {
            sourceLayer
                .setPopupContent(buildVillageAssetsPopup(villages, panchayatName, assets))
                .openPopup();
        }
    } catch (error) {
        if (requestId !== activeRequestId) return;
        setSidebar(`<h3>${escapeHtml(panchayatName)}</h3><p>Could not load villages/assets: ${escapeHtml(error.message)}</p>`);

        if (sourceLayer) {
            sourceLayer
                .setPopupContent(`<strong>${escapeHtml(panchayatName)}</strong><p>Could not load assets: ${escapeHtml(error.message)}</p>`)
                .openPopup();
        }
    }
}

async function searchVillages(query) {
    setSidebar(`<h3>Search</h3><p>Searching for "${escapeHtml(query)}"...</p>`);

    try {
        const results = await fetchJson(`/api/search-villages?q=${encodeURIComponent(query)}`);
        if (!results.length) {
            setSidebar(`<h3>Search</h3><p>No villages found for "${escapeHtml(query)}".</p>`);
            return;
        }

        setSidebar(
            `<h3>Search results (${results.length})</h3><ul>` +
            results.map((result, index) => (
                `<li><button class="result-button" data-result-index="${index}">${escapeHtml(result.village)}</button>` +
                `<div class="muted">${escapeHtml(result.panchayat)}${result.district ? `, ${escapeHtml(result.district)}` : ''}</div></li>`
            )).join('') +
            `</ul>`
        );

        listEl.querySelectorAll('[data-result-index]').forEach(button => {
            button.addEventListener('click', () => {
                const result = results[Number(button.dataset.resultIndex)];
                showPanchayat(result.panchayat, result.village);
            });
        });
    } catch (error) {
        setSidebar(`<h3>Search</h3><p>Could not search villages: ${escapeHtml(error.message)}</p>`);
    }
}

async function init() {
    try {
        const panchayats = await fetchJson('/api/panchayats');
        renderPanchayats(panchayats);
        setSidebar(`<h3>Panchayats loaded</h3><p>Click a panchayat marker to load villages, nearby assets, and the panchayat area bubble.</p>`);
    } catch (error) {
        setSidebar(`<strong>Error loading panchayats:</strong> ${escapeHtml(error.message)}.`);
    }
}

searchForm.addEventListener('submit', event => {
    event.preventDefault();
    const query = searchInput.value.trim();
    if (query.length >= 2) {
        searchVillages(query);
    }
});

init();
