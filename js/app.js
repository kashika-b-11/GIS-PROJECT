const map = L.map('map').setView([31.1048, 77.1734], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

let villagesIndex = {}; // normalized panchayat key -> [village features]
let panchayatNames = {}; // normalized panchayat key -> display name
let villagesLayer;

function getProp(feature, names) {
    for (const n of names) {
        if (feature.properties && feature.properties[n] !== undefined && feature.properties[n] !== null && feature.properties[n] !== '') {
            return feature.properties[n];
        }
    }
    return undefined;
}

function normalizeKey(value) {
    return String(value || '').trim().toLowerCase();
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
    return getProp(feature, ['Gram_Panch', 'Gram_Panchayat', 'GRAM_PANCH', 'PANCHAYAT', 'Panchayat', 'panchayat']);
}

function getVillageName(feature) {
    return getProp(feature, ['Village_Ve', 'Village_Name', 'Village', 'VILLAGE', 'NAME', 'NAME_', 'Village_Na']) || 'Village';
}

// Load villages first because this dataset contains the Gram_Panch field.
fetch('data/villages.geojson')
    .then(r => r.ok ? r.json() : Promise.reject('villages not found'))
    .then(villages => {
        villages.features.forEach(f => {
            const displayName = getPanchayatName(f) || 'Unknown panchayat';
            const key = normalizeKey(displayName);

            if (!villagesIndex[key]) villagesIndex[key] = [];
            if (!panchayatNames[key]) panchayatNames[key] = displayName;

            villagesIndex[key].push(f);
        });

        villagesLayer = L.geoJSON(villages, {
            pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
                radius: 3,
                color: '#ff7800',
                weight: 1,
                fillColor: '#ffb347',
                fillOpacity: 0.65
            }),
            style: { color: '#ff7800', weight: 1, opacity: 0.6 },
            onEachFeature: (feature, layer) => {
                const vname = getVillageName(feature);
                const panch = getPanchayatName(feature) || '';

                layer.bindPopup(`<strong>${escapeHtml(vname)}</strong><br/>Panchayat: ${escapeHtml(panch)}`);
                layer.on('click', () => {
                    showPanchayat(panch);
                });
            }
        }).addTo(map);

        function handlePanchayatFeatures(panchayats) {
            L.geoJSON(panchayats, {
                pointToLayer: (f, latlng) => L.circleMarker(latlng, {
                    radius: 6,
                    color: '#2E86AB',
                    fillOpacity: 0.9
                }),
                style: { color: '#2E86AB', weight: 2, fillOpacity: 0.1 },
                onEachFeature: (feature, layer) => {
                    const pname = getProp(feature, ['panchayat', 'PANCHAYAT', 'Panchayat', 'NAME', 'Name']) || 'Panchayat';
                    const villageCount = feature.properties && feature.properties.village_count;

                    layer.bindPopup(escapeHtml(pname) + (villageCount ? ` (${villageCount} villages)` : ''));
                    layer.on('click', () => {
                        if (layer.getBounds) {
                            try {
                                map.fitBounds(layer.getBounds(), { padding: [30, 30] });
                            } catch (e) {
                                // Point layers do not have polygon bounds.
                            }
                        }
                        showPanchayat(pname);
                    });
                }
            }).addTo(map);
        }

        fetch('data/panchayats.geojson')
            .then(r => r.ok ? r.json() : Promise.reject('panchayats not found'))
            .then(handlePanchayatFeatures)
            .catch(() => {
                fetch('data/panchayats_from_villages.geojson')
                    .then(r => r.ok ? r.json() : Promise.reject('panchayats_from_villages not found'))
                    .then(handlePanchayatFeatures)
                    .catch(showPanchayatList);
            });
    })
    .catch(err => {
        document.getElementById('list').innerHTML = `<strong>Error loading villages data:</strong> ${escapeHtml(err)}. Start a local server and check that data/villages.geojson exists.`;
    });

function showPanchayatList() {
    const el = document.getElementById('list');
    const keys = Object.keys(villagesIndex).sort((a, b) => panchayatNames[a].localeCompare(panchayatNames[b]));

    el.innerHTML = `<h3>Panchayats (${keys.length})</h3><div style="max-height:60vh;overflow:auto"><ul>` +
        keys.map(k => `<li><a href="#" data-p="${escapeHtml(k)}">${escapeHtml(panchayatNames[k])}</a></li>`).join('') +
        `</ul></div><p>Click a panchayat to zoom and list its villages.</p>`;

    el.querySelectorAll('a[data-p]').forEach(a => {
        a.addEventListener('click', e => {
            e.preventDefault();
            showPanchayat(a.dataset.p);
        });
    });
}

function showPanchayat(pname) {
    const key = normalizeKey(pname);
    const list = villagesIndex[key] || [];
    const displayName = panchayatNames[key] || pname || 'Panchayat';
    const el = document.getElementById('list');

    if (list.length) {
        const names = list.map(getVillageName).sort((a, b) => String(a).localeCompare(String(b)));

        el.innerHTML = `<h3>${escapeHtml(displayName)} - ${list.length} villages</h3><ul>` +
            names.map(n => `<li>${escapeHtml(n)}</li>`).join('') +
            `</ul>`;

        const latlngs = [];
        list.forEach(f => {
            const g = f.geometry;
            if (g && (g.type === 'Point' || g.type === 'MultiPoint')) {
                const c = g.coordinates;
                if (Array.isArray(c[0])) {
                    c.forEach(cc => latlngs.push([cc[1], cc[0]]));
                } else {
                    latlngs.push([c[1], c[0]]);
                }
            }
        });

        if (latlngs.length) {
            map.fitBounds(latlngs, { padding: [30, 30], maxZoom: 13 });
        }
    } else {
        el.innerHTML = `<h3>${escapeHtml(displayName)}</h3><p>No villages found for this panchayat.</p>`;
    }
}
