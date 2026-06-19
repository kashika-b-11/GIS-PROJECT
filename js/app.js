const map = L.map('map').setView([31.1048, 77.1734], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
}).addTo(map);

let villagesIndex = {}; // map panchayat key -> [village features]
let villagesLayer;

function getProp(feature, names) {
    for (const n of names) { if (feature.properties && feature.properties[n] !== undefined) return feature.properties[n]; }
    return undefined;
}

// Load villages first (this dataset contains Gram_Panch name)
fetch('data/villages.geojson').then(r => r.ok ? r.json() : Promise.reject('villages not found')).then(villages => {
    // build villages index by panchayat name/id (try common fields including LGD fields)
    villages.features.forEach(f => {
        const key = getProp(f, ['Gram_Panch', 'Gram_Pan_1', 'Gram_Panchayat', 'GRAM_PANCH', 'PANCHAYAT', 'Panchayat', 'panchayat']) || getProp(f, ['P_NAME', 'NAME', 'Village', 'VILLAGE', 'Village_Na', 'Village_Na']) || 'unknown';
        if (!villagesIndex[key]) villagesIndex[key] = [];
        villagesIndex[key].push(f);
    });

    villagesLayer = L.geoJSON(villages, {
        style: { color: '#ff7800', weight: 1, opacity: 0.6 },
        onEachFeature: (feature, layer) => {
            const vname = getProp(feature, ['Village_Na', 'Village_Na', 'Village', 'NAME', 'NAME_', 'Village_Name']) || 'Village';
            const panch = getProp(feature, ['Gram_Panch', 'Gram_Pan_1', 'Gram_Panchayat', 'PANCHAYAT']) || '';
            layer.bindPopup(`<strong>${vname}</strong><br/>Panchayat: ${panch}`);
            layer.on('click', () => {
                // on village click, show panchayat list for that village
                showPanchayat(panch);
            });
        }
    }).addTo(map);

    // try to load panchayat polygons; if missing, try panchayats_from_villages (points), otherwise build a panchayat list from villages
    function handlePanchayatFeatures(panchayats) {
        const panchayatLayer = L.geoJSON(panchayats, {
            pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 6, color: '#2E86AB', fillOpacity: 0.9 }),
            style: { color: '#2E86AB', weight: 2, fillOpacity: 0.1 },
            onEachFeature: (feature, layer) => {
                const pname = getProp(feature, ['panchayat', 'PANCHAYAT', 'Panchayat', 'NAME', 'Name']) || (feature.properties && (feature.properties.panchayat || feature.properties.PANCHAYAT)) || 'Panchayat';
                layer.bindPopup(pname + (feature.properties && feature.properties.village_count ? ` (${feature.properties.village_count} villages)` : ''));
                layer.on('click', () => {
                    if (layer.getBounds) try { map.fitBounds(layer.getBounds()); } catch (e) { }
                    showPanchayat(pname);
                });
            }
        }).addTo(map);
    }

    fetch('data/panchayats.geojson').then(r => r.ok ? r.json() : Promise.reject('panchayats not found')).then(panchayats => {
        handlePanchayatFeatures(panchayats);
    }).catch(_ => {
        // try generated panchayat points
        fetch('data/panchayats_from_villages.geojson').then(r => r.ok ? r.json() : Promise.reject('panchayats_from_villages not found')).then(pf => {
            handlePanchayatFeatures(pf);
        }).catch(_ => {
            // no panchayat polygons/points: render clickable panchayat list from villages
            const el = document.getElementById('list');
            const keys = Object.keys(villagesIndex).sort();
            el.innerHTML = `<h3>Panchayats (${keys.length})</h3><div style="max-height:60vh;overflow:auto"><ul>` + keys.map(k => `<li><a href="#" data-p="${k}">${k}</a></li>`).join('') + `</ul></div><p>Click a panchayat to zoom and list its villages.</p>`;
            el.querySelectorAll('a[data-p]').forEach(a => {
                a.addEventListener('click', e => {
                    e.preventDefault();
                    showPanchayat(a.dataset.p);
                });
            });
        });
    });

}).catch(err => {
    document.getElementById('list').innerHTML = `<strong>Error loading villages data:</strong> ${err}. See README for conversion steps.`;
});

function showPanchayat(pname) {
    const list = villagesIndex[pname] || [];
    const el = document.getElementById('list');
    if (list.length) {
        const names = list.map(v => getProp(v, ['Village_Na', 'Village', 'NAME', 'Village_Name']) || 'Village');
        el.innerHTML = `<h3>${pname} — ${list.length} villages</h3><ul>` + names.map(n => `<li>${n}</li>`).join('') + `</ul>`;
        // zoom to bounds of villages
        const latlngs = [];
        list.forEach(f => {
            const g = f.geometry;
            if (g && (g.type === 'Point' || g.type === 'MultiPoint')) {
                const c = g.coordinates;
                if (Array.isArray(c[0])) { // multipoint
                    c.forEach(cc => latlngs.push([cc[1], cc[0]]));
                } else {
                    latlngs.push([c[1], c[0]]);
                }
            }
        });
        if (latlngs.length) {
            map.fitBounds(latlngs);
        }
    } else {
        el.innerHTML = `<h3>${pname}</h3><p>No villages found for this panchayat.</p>`;
    }
}
