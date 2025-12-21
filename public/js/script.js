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
        console.warn('No saved data, using defaults');
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