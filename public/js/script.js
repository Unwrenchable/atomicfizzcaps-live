let map, playerMarker = null, playerLatLng = null, lastAccuracy = 999, watchId = null, firstLock = true;
let wallet = null;
let player = { lvl: 1, hp: 100, maxHp: 100, caps: 0, rads: 0, gear: [], claimed: new Set() };
let locations = [], markers = {};

const API_BASE = window.location.origin;
const CLAIM_RADIUS = 50;

function updateHPBar() {
    if (!document.getElementById('hpFill')) return; // Safety
    const hpPct = player.hp / player.maxHp * 100;
    const radPct = (player.rads || 0) / 1000 * 100;
    document.getElementById('hpFill').style.width = `${hpPct}%`;
    document.getElementById('radFill').style.width = `${radPct}%`;
    document.getElementById('hpText').textContent = `HP ${player.hp} / ${player.maxHp}`;
    document.getElementById('lvl').textContent = player.lvl;
    document.getElementById('caps').textContent = player.caps;
    document.getElementById('claimed').textContent = player.claimed.size;
}

// ... all other functions (setStatus, updateGpsDisplay, placeMarker, startLocation, wallet connect, tabs, renderStats, renderItems, renderQuests, renderShop, attemptClaim, showLootModal, triggerRandomBattle, startRandomBattle) remain the same ...

async function initMap() {
    map = L.map('map', { zoomControl: false }).setView([36.1146, -115.1728], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    try {
        const res = await fetch(`${API_BASE}/locations`);
        locations = await res.json();
        locations.forEach(loc => {
            const color = loc.rarity === 'legendary' ? '#ffff00' : loc.rarity === 'epic' ? '#ff6200' : loc.rarity === 'rare' ? '#00ffff' : '#00ff41';
            const m = L.circleMarker([loc.lat, loc.lng], {radius:16,weight:4,color:'#001100',fillColor:color,fillOpacity:0.9})
                .addTo(map)
                .bindPopup(`<b>${loc.n}</b><br>Level ${loc.lvl || 1}`)
                .on('click', () => attemptClaim(loc));
            markers[loc.n] = m;
        });
        setStatus(`Loaded ${locations.length} locations`);
    } catch {
        setStatus("Locations offline");
    }

    startLocation();
}

// Run only after DOM loaded
window.addEventListener('load', () => {
    initMap();
    updateHPBar();
});
