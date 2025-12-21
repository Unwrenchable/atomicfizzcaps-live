let map, playerMarker = null, playerLatLng = null, lastAccuracy = 999, watchId = null, firstLock = true;
let wallet = null;
let player = { 
  lvl: 1, 
  hp: 100, 
  maxHp: 100, 
  caps: 0, 
  rads: 0,
  xp: 0,
  xpToNext: 100,
  gear: [], 
  claimed: new Set(),
  quests: []
};
let locations = [], markers = {};

const API_BASE = window.location.origin;
const CLAIM_RADIUS = 50;
const MAX_RADS = 1000;

// Hidden terminal signal
let terminalSignal = null;

function updateHPBar() {
  if (!document.getElementById('hpFill')) return;
  const hpPct = Math.min(100, player.hp / player.maxHp * 100);
  const radPct = Math.min(100, player.rads / MAX_RADS * 100);
  document.getElementById('hpFill').style.width = `${hpPct}%`;
  document.getElementById('radFill').style.width = `${radPct}%`;
  document.getElementById('hpText').textContent = `HP ${Math.floor(player.hp)} / ${player.maxHp}`;
  document.getElementById('lvl').textContent = player.lvl;
  document.getElementById('caps').textContent = player.caps;
  document.getElementById('claimed').textContent = player.claimed.size;

  if (player.hp <= 0) {
    setStatus("YOU DIED FROM RADIATION", false);
  }
}

function setStatus(text, isGood = true, time = 5000) {
  const s = document.getElementById('status');
  if (!s) return;
  s.textContent = `Status: ${text}`;
  s.className = isGood ? 'status-good' : 'status-bad';
  clearTimeout(s.to);
  if (time > 0) {
    s.to = setTimeout(() => {
      s.textContent = 'Status: ready';
      s.className = 'status-good';
    }, time);
  }
}

function updateGpsDisplay() {
  const textEl = document.getElementById('accText');
  const dotEl = document.getElementById('accDot');
  if (!textEl || !dotEl) return;
  textEl.textContent = `GPS: ${Math.round(lastAccuracy)}m`;
  dotEl.className = 'acc-dot ' + (lastAccuracy <= 20 ? 'acc-green' : 'acc-amber');
}

function placeMarker(lat, lng, accuracy) {
  playerLatLng = L.latLng(lat, lng);
  lastAccuracy = accuracy;

  if (!playerMarker) {
    playerMarker = L.circleMarker(playerLatLng, {
      radius: 10,
      color: '#00ff41',
      weight: 3,
      fillOpacity: 0.9
    }).addTo(map).bindPopup('You are here');
  } else {
    playerMarker.setLatLng(playerLatLng);
  }

  updateGpsDisplay();
  if (firstLock) {
    map.flyTo(playerLatLng, 16);
    firstLock = false;
  }
  document.getElementById('requestGpsBtn').style.display = 'none';
  setStatus("GPS LOCK ACQUIRED", true, 5000);
}

function handleLocationError(err) {
  setStatus("GPS error – tap REQUEST GPS", false, 10000);
  document.getElementById('requestGpsBtn').style.display = 'block';
}

function startLocation() {
  if (!navigator.geolocation) {
    setStatus("GPS not supported", false);
    return;
  }
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(
    pos => placeMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    handleLocationError,
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
  );
  setStatus("Requesting GPS...");
}

document.getElementById('requestGpsBtn').onclick = startLocation;

// Wallet connect
document.getElementById('connectWallet').onclick = async () => {
  if (wallet) {
    setStatus("Wallet already connected");
    return;
  }
  const provider = window.solana;
  if (!provider || !provider.isPhantom) {
    setStatus("Phantom wallet not detected", false);
    return;
  }
  try {
    await provider.connect();
    wallet = provider;
    const addr = wallet.publicKey.toBase58();
    document.getElementById('connectWallet').textContent = `${addr.slice(0,4)}...${addr.slice(-4)}`;
    setStatus("Wallet connected", true);

    // Load player data
    try {
      const res = await fetch(`${API_BASE}/player/${addr}`);
      if (res.ok) {
        const data = await res.json();
        player = { ...player, ...data };
        player.claimed = new Set(data.claimed || []);
        player.quests = data.quests || [];
        updateHPBar();
        checkTerminalAccess();
        if (player.claimed.size === 0) {
          document.getElementById('tutorialModal')?.style = 'display:block';
        }
      }
    } catch (e) {
      console.error("Player load error:", e);
    }
  } catch (err) {
    setStatus("Wallet connection failed", false);
  }
};

// Tabs – FIXED to use #terminal instead of broken #sidePanel
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const terminal = document.getElementById('terminal');
    if (tab.dataset.panel === 'map') {
      terminal.classList.remove('open');
    } else {
      terminal.classList.add('open');
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

// Close modals
document.getElementById('mintCloseBtn')?.addEventListener('click', () => {
  document.getElementById('mintModal').classList.remove('open');
});
document.getElementById('tutorialClose')?.addEventListener('click', () => {
  document.getElementById('tutorialModal').style.display = 'none';
});

function renderStats() {
  document.getElementById('panelBody').innerHTML = `
    <div class="list-item"><strong>LEVEL</strong><div>${player.lvl} (XP ${player.xp}/${player.xpToNext})</div></div>
    <div class="list-item"><strong>HP</strong><div>${Math.floor(player.hp)}/${player.maxHp}</div></div>
    <div class="list-item"><strong>RADS</strong><div>${player.rads}/${MAX_RADS}</div></div>
    <div class="list-item"><strong>CAPS</strong><div>${player.caps}</div></div>
    <div class="list-item"><strong>CLAIMED</strong><div>${player.claimed.size}</div></div>
  `;
}

function renderItems() {
  const gear = player.gear || [];
  document.getElementById('panelBody').innerHTML = gear.length 
    ? gear.map(g => `<div class="list-item"><strong>${g.name}</strong><div class="muted-small">${g.rarity || 'common'} • PWR ${g.power || 0}</div></div>`).join('')
    : '<div class="list-item">No gear in inventory</div>';
}

async function renderQuests() {
  try {
    const res = await fetch(`${API_BASE}/quests`);
    const allQuests = await res.json();
    const html = allQuests.map(q => {
      const pq = player.quests.find(p => p.id === q.id);
      const progress = pq ? `${pq.progress || 0}/${q.objectives?.length || '?'} ${pq.completed ? '✓' : ''}` : 'Not started';
      return `<div class="list-item"><strong>${q.name}</strong><div class="muted-small">${q.description}<br>Progress: ${progress}</div></div>`;
    }).join('');
    document.getElementById('panelBody').innerHTML = html || '<div class="list-item">No quests available</div>';
  } catch {
    document.getElementById('panelBody').innerHTML = '<div class="list-item">Quests offline</div>';
  }
}

function renderShop() {
  document.getElementById('panelBody').innerHTML = '<div class="list-item">Scavenger\'s Exchange loading...<br>RadAway and gear coming soon!</div>';
}

// Radiation drain over time
setInterval(() => {
  if (player.rads > 200 && player.hp > 0) {
    player.hp -= Math.floor(player.rads / 200);
    if (player.hp < 0) player.hp = 0;
    updateHPBar();
  }
}, 30000);

// Claim logic – rarity-based rads
async function attemptClaim(loc) {
  if (lastAccuracy > CLAIM_RADIUS) {
    setStatus(`GPS too weak (${Math.round(lastAccuracy)}m > ${CLAIM_RADIUS}m)`, false);
    return;
  }
  if (!playerLatLng) {
    setStatus("No GPS lock", false);
    return;
  }
  const dist = map.distance(playerLatLng, L.latLng(loc.lat, loc.lng));
  if (dist > CLAIM_RADIUS) {
    setStatus(`Too far (${Math.round(dist)}m)`, false);
    return;
  }
  if (!wallet) {
    setStatus("Connect wallet first", false);
    return;
  }
  if (player.claimed.has(loc.n)) {
    setStatus("Already claimed", false);
    return;
  }

  const message = `Claim:${loc.n}:${Date.now()}`;
  try {
    const encoded = new TextEncoder().encode(message);
    const signed = await wallet.signMessage(encoded);
    const signature = bs58.encode(signed);

    const res = await fetch(`${API_BASE}/find-loot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: wallet.publicKey.toBase58(),
        spot: loc.n,
        message,
        signature
      })
    });

    const data = await res.json();
    if (data.success) {
      player.caps = data.totalCaps || player.caps;
      player.claimed.add(loc.n);
      markers[loc.n]?.setStyle({ fillColor: '#003300', fillOpacity: 0.5 });

      // Rarity-based radiation
      const radGain = loc.rarity === 'legendary' ? 120 
                    : loc.rarity === 'epic' ? 80 
                    : loc.rarity === 'rare' ? 50 
                    : 20;
      player.rads = Math.min(MAX_RADS, player.rads + radGain);

      updateHPBar();
      setStatus(`+${data.capsFound || 0} CAPS from ${loc.n}! (+${radGain} RADS)`, true, 8000);
      showLootModal(data.capsFound || 0, loc.n);
      checkTerminalAccess();
    } else {
      setStatus(data.error || "Claim failed", false);
    }
  } catch (err) {
    console.error(err);
    setStatus("Claim error", false);
  }
}

function showLootModal(caps, location) {
  document.getElementById('mintTitle').textContent = 'LOOT CLAIMED';
  document.getElementById('mintMsg').textContent = `+${caps} CAPS from ${location}`;
  document.getElementById('mintModal').classList.add('open');
}

// Terminal unlock
function checkTerminalAccess() {
  const REQUIRED_CLAIMS = 10;
  if (player.claimed.size >= REQUIRED_CLAIMS && !terminalSignal) {
    terminalSignal = document.createElement('a');
    terminalSignal.href = 'terminal.html';
    terminalSignal.className = 'hidden-signal';
    terminalSignal.textContent = '[RESTRICTED SIGNAL ACQUIRED]';
    terminalSignal.title = 'Access hidden terminal';
    document.querySelector('.pipboy').appendChild(terminalSignal);
    setTimeout(() => terminalSignal.classList.add('visible'), 100);
    setStatus('Faint restricted signal detected...', true, 10000);
  }
}

// Map init
async function initMap() {
  map = L.map('map', { zoomControl: false }).setView([36.1146, -115.1728], 11);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: ''
  }).addTo(map);

  try {
    const res = await fetch(`${API_BASE}/locations`);
    if (!res.ok) throw new Error('Locations fetch failed');
    locations = await res.json();

    locations.forEach(loc => {
      const color = loc.rarity === 'legendary' ? '#ffff00' 
        : loc.rarity === 'epic' ? '#ff6200' 
        : loc.rarity === 'rare' ? '#00ffff' 
        : '#00ff41';

      const m = L.circleMarker([loc.lat, loc.lng], {
        radius: 16,
        weight: 4,
        color: '#001100',
        fillColor: color,
        fillOpacity: 0.9
      })
      .addTo(map)
      .bindPopup(`<b>${loc.n}</b><br>Level ${loc.lvl || 1}<br>Rarity: ${loc.rarity || 'common'}`)
      .on('click', () => attemptClaim(loc));

      markers[loc.n] = m;

      if (player.claimed.has(loc.n)) {
        m.setStyle({ fillColor: '#003300', fillOpacity: 0.5 });
      }
    });

    setStatus(`Loaded ${locations.length} wasteland locations`, true);
  } catch (err) {
    console.error(err);
    setStatus("Locations offline", false);
  }

  startLocation();
  updateHPBar();
}

window.addEventListener('load', initMap);
