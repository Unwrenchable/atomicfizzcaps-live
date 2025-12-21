let map, playerMarker, playerLat, playerLng;
let wallet = null;
let playerData = { lvl: 1, hp: 100, caps: 0, gear: [], found: [], xp: 0, xpToNext: 100 };

const statusEl = document.getElementById('status');
const terminal = document.getElementById('terminal');
const panelBody = document.getElementById('panelBody');
const panelTitle = document.getElementById('panelTitle');

async function loadPlayerData(addr) {
    try {
        const res = await fetch(`/player/${addr}`);
        playerData = await res.json();
    } catch (e) {
        console.warn('No saved data, using defaults');let map, playerMarker = null, playerLatLng = null, lastAccuracy = 999, watchId = null, firstLock = true;
let wallet = null;
let player = { lvl: 1, hp: 100, maxHp: 100, caps: 0, rads: 0, gear: [], claimed: new Set(), pendingDrops: [] };
let locations = [], markers = {};

const API_BASE = window.location.origin;
const CLAIM_RADIUS = 50;

function updateHPBar() {
    const hpPct = player.hp / player.maxHp * 100;
    const radPct = (player.rads || 0) / 1000 * 100;
    document.getElementById('hpFill').style.width = `${hpPct}%`;
    document.getElementById('radFill').style.width = `${radPct}%`;
    document.getElementById('hpText').textContent = `HP ${player.hp} / ${player.maxHp}`;
    document.getElementById('lvl').textContent = player.lvl;
    document.getElementById('caps').textContent = player.caps;
    document.getElementById('claimed').textContent = player.claimed.size;
}

function setStatus(text, time = 5000) {
    const s = document.getElementById('status');
    s.textContent = `Status: ${text}`;
    clearTimeout(s.to);
    if (time > 0) s.to = setTimeout(() => s.textContent = 'Status: ready', time);
}

function updateGpsDisplay() {
    const textEl = document.getElementById('accText');
    const dotEl = document.getElementById('accDot');
    if (lastAccuracy <= 20) {
        textEl.textContent = `GPS: ${Math.round(lastAccuracy)}m`;
        dotEl.className = 'acc-dot acc-green';
    } else {
        textEl.textContent = `GPS: ${Math.round(lastAccuracy)}m`;
        dotEl.className = 'acc-dot acc-amber';
    }
}

function placeMarker(lat, lng, accuracy) {
    playerLatLng = L.latLng(lat, lng);
    lastAccuracy = accuracy;
    if (!playerMarker) {
        playerMarker = L.circleMarker(playerLatLng, {radius:10,color:'#00ff41',weight:3,fillOpacity:0.9}).addTo(map).bindPopup('You are here');
    } else playerMarker.setLatLng(playerLatLng);
    updateGpsDisplay();
    if (firstLock) { map.flyTo(playerLatLng, 16); firstLock = false; }
    setStatus("GPS LOCK ACQUIRED", 5000);
}

function startLocation() {
    if (!navigator.geolocation) { setStatus("GPS not supported"); return; }
    watchId = navigator.geolocation.watchPosition(
        pos => placeMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        err => setStatus("GPS error – tap REQUEST GPS"),
        { enableHighAccuracy: true }
    );
}

document.getElementById('requestGpsBtn').onclick = () => startLocation();

// Wallet
document.getElementById('connectWallet').onclick = async () => {
    const provider = window.solana;
    if (!provider) return setStatus("No wallet found");
    try {
        await provider.connect();
        wallet = provider;
        const addr = wallet.publicKey.toBase58();
        document.getElementById('connectWallet').textContent = `${addr.slice(0,4)}...${addr.slice(-4)}`;
        setStatus("Wallet connected");
        const p = await fetch(`/player/${addr}`).then(r => r.json());
        player = p;
        updateHPBar();
    } catch { setStatus("Connection failed"); }
};

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        if (tab.dataset.panel === 'map') {
            document.getElementById('terminal').classList.remove('open');
        } else {
            document.getElementById('terminal').classList.add('open');
            document.getElementById('panelTitle').textContent = tab.textContent;
            if (tab.dataset.panel === 'stat') renderStats();
            if (tab.dataset.panel === 'items') renderItems();
            if (tab.dataset.panel === 'quests') renderQuests();
            if (tab.dataset.panel === 'shop') renderShop();
        }
    });
});

document.getElementById('panelClose').onclick = () => {
    document.getElementById('terminal').classList.remove('open');
    document.querySelector('.tab[data-panel="map"]').classList.add('active');
};

function renderStats() {
    document.getElementById('panelBody').innerHTML = `
        <div class="list-item"><strong>LEVEL</strong><div>${player.lvl || 1}</div></div>
        <div class="list-item"><strong>HP</strong><div>${player.hp || 100}/${player.maxHp || 100}</div></div>
        <div class="list-item"><strong>RADS</strong><div>${player.rads || 0}</div></div>
        <div class="list-item"><strong>CAPS</strong><div>${player.caps || 0}</div></div>
        <div class="list-item"><strong>CLAIMED</strong><div>${player.claimed.size}</div></div>
    `;
}

function renderItems() {
    const gear = player.gear || [];
    document.getElementById('panelBody').innerHTML = gear.length ? gear.map(g => `
        <div class="list-item"><strong>${g.name}</strong><div>${g.rarity || 'common'} • PWR ${g.power || 0}</div></div>
    `).join('') : '<div class="list-item">No gear equipped</div>';
}

async function renderQuests() {
    try {
        const res = await fetch(`${API_BASE}/quests`);
        const quests = await res.json();
        document.getElementById('panelBody').innerHTML = quests.map(q => `
            <div class="list-item"><strong>${q.name}</strong><div class="muted-small">${q.description}</div></div>
        `).join('');
    } catch {
        document.getElementById('panelBody').innerHTML = '<div class="list-item">Quests offline</div>';
    }
}

async function renderShop() {
    document.getElementById('panelBody').innerHTML = '<div class="list-item">Shop loading...</div>';
}

// Loot claim + random battle
async function attemptClaim(loc) {
    if (!wallet) return setStatus("Connect wallet first");
    if (player.claimed.has(loc.n)) return setStatus("Already claimed");

    const message = `Claim:${loc.n}:${Date.now()}`;
    const encoded = new TextEncoder().encode(message);
    const signed = await wallet.signMessage(encoded);
    const signature = bs58.encode(signed);

    const res = await fetch('/find-loot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: wallet.publicKey.toBase58(), spot: loc.n, message, signature })
    });
    const data = await res.json();

    if (data.success) {
        player.caps = data.totalCaps;
        player.claimed.add(loc.n);
        markers[loc.n]?.setStyle({ fillColor: '#003300', fillOpacity: 0.5 });
        player.rads = (player.rads || 0) + 50;
        updateHPBar();
        setStatus(`+${data.capsFound} CAPS from ${loc.n}!`);

        // 30% random encounter
        if (Math.random() < 0.3) {
            setTimeout(() => triggerRandomBattle(loc.n), 1500);
        } else {
            showLootModal(data.capsFound, loc.n);
        }
    } else {
        setStatus(data.error || 'Claim failed');
    }
}

function showLootModal(caps, location) {
    document.getElementById('mintTitle').textContent = 'LOOT CLAIMED';
    document.getElementById('mintMsg').textContent = `+${caps} CAPS from ${location}`;
    document.getElementById('mintProgress').querySelector('.progress-bar').style.width = '100%';
    document.getElementById('mintModal').classList.add('open');
    document.getElementById('mintCloseBtn').onclick = () => document.getElementById('mintModal').classList.remove('open');
}

async function triggerRandomBattle(location) {
    const playerData = await fetch(`/player/${wallet.publicKey.toBase58()}`).then(r => r.json());
    const gearPower = playerData.gear.reduce((sum, g) => sum + (g.power || 0), 0);

    document.getElementById('mintTitle').textContent = 'RANDOM ENCOUNTER!';
    document.getElementById('mintMsg').innerHTML = `Raiders at ${location}<br>Gear PWR: ${gearPower}`;
    document.getElementById('mintProgress').style.display = 'none';
    document.getElementById('mintCloseBtn').textContent = 'FIGHT';
    document.getElementById('mintCloseBtn').onclick = () => startRandomBattle(gearPower);
    document.getElementById('mintModal').classList.add('open');
}

async function startRandomBattle(gearPower) {
    const message = `Battle:${gearPower}:${Date.now()}`;
    const encoded = new TextEncoder().encode(message);

    try {
        const signed = await wallet.signMessage(encoded);
        const signature = bs58.encode(signed);

        const res = await fetch('/battle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: wallet.publicKey.toBase58(),
                gearPower,
                message,
                signature
            })
        });

        const data = await res.json();
        document.getElementById('mintModal').classList.remove('open');

        if (data.win) {
            setStatus(`Victory! +${data.capsReward} CAPS`);
        } else {
            setStatus("Defeated! HP lost");
        }
        player = data.player;
        updateHPBar();
    } catch {
        setStatus("Battle canceled");
        document.getElementById('mintModal').classList.remove('open');
    }
}

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
    updateHPBar();
}

initMap();
    }
    updateUI();
}

function updateUI() {
    document.getElementById('lvl').textContent = playerData.lvl || 1;
    document.getElementById('caps').textContent = playerData.caps || 0;
    document.getElementById('hpText').textContent = `HP ${playerData.hp || 100} / 100`;
    document.getElementById('hpFill').style.width = `${(playerData.hp || 100)}%`;

    const xpPercent = ((playerData.xp || 0) / (playerData.xpToNext || 100)) * 100;
    document.getElementById('xpFill').style.width = `${xpPercent}%`;
}

// Map init
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([39.8283, -98.5795], 5); // Center USA
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
}

// GPS Lock
document.getElementById('requestGpsBtn').onclick = () => {
    statusEl.textContent = 'Acquiring GPS lock...';
    statusEl.className = 'status-bad';

    navigator.geolocation.getCurrentPosition(
        pos => {
            playerLat = pos.coords.latitude;
            playerLng = pos.coords.longitude;
            map.setView([playerLat, playerLng], 15);
            if (playerMarker) playerMarker.setLatLng([playerLat, playerLng]);
            else playerMarker = L.marker([playerLat, playerLng]).addTo(map).bindPopup('You are here').openPopup();
            statusEl.textContent = 'GPS LOCK ACQUIRED';
            statusEl.className = 'status-good';
        },
        err => {
            statusEl.textContent = 'GPS DENIED - RADSTORM INTERFERENCE';
            statusEl.className = 'status-bad';
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
};

// Wallet connect placeholder (replace with your actual Phantom/Solflare logic)
document.getElementById('connectWallet').onclick = async () => {
    // Example placeholder – integrate your real wallet code here
    wallet = prompt("Enter wallet address for testing (or implement real connect)");
    if (wallet) {
        statusEl.textContent = `Wallet connected: ${wallet.slice(0,8)}...`;
        statusEl.className = 'status-good';
        await loadPlayerData(wallet);
    }
};

// Tabs & Terminal
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', async () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        if (tab.dataset.panel === 'map') {
            terminal.classList.remove('open');
        } else {
            terminal.classList.add('open');
            panelTitle.textContent = tab.textContent;

            if (tab.dataset.panel === 'stat') renderStats();
            else if (tab.dataset.panel === 'items') renderItems();
            else if (tab.dataset.panel === 'quests') renderQuests();
            else if (tab.dataset.panel === 'shop') renderShop();
        }
    });
});

document.getElementById('panelClose').onclick = () => {
    terminal.classList.remove('open');
    document.querySelector('.tab[data-panel="map"]').classList.add('active');
};

async function renderStats() {
    panelBody.innerHTML = `
        <div class="list-item"><span>Level</span><span>${playerData.lvl || 1}</span></div>
        <div class="list-item"><span>Experience</span><span>${playerData.xp || 0} / ${playerData.xpToNext || 100}</span></div>
        <div class="list-item"><span>CAPS</span><span>${playerData.caps || 0}</span></div>
        <div class="list-item"><span>HP</span><span>${playerData.hp || 100}/100</span></div>
    `;
}

async function renderItems() {
    const gear = playerData.gear || [];
    panelBody.innerHTML = gear.length ? gear.map(g => `
        <div class="list-item"><span>${g.name}</span><span>${g.power || 0} PWR</span></div>
    `).join('') : '<div style="text-align:center;padding:20px">No gear equipped</div>';
}

async function renderQuests() {
    const res = await fetch('/quests');
    const quests = await res.json();
    panelBody.innerHTML = quests.length ? quests.map(q => `
        <div class="list-item"><span>${q.title}</span><span class="muted-small">${q.reward} CAPS</span></div>
    `).join('') : '<div style="text-align:center;padding:20px">No active quests</div>';
}

async function renderShop() {
    const res = await fetch('/shop/listings');
    const listings = await res.json();
    panelBody.innerHTML = listings.length ? listings.map(l => `
        <div class="list-item"><span>${l.item}</span><span>${l.price} CAPS</span></div>
    `).join('') : '<div style="text-align:center;padding:20px">Shop empty - check back later</div>';
}

// Init
initMap();
updateUI();
