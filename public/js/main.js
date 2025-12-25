import { Connection, clusterApiUrl } from '@solana/web3.js';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  BackpackWalletAdapter,
} from '@solana/wallet-adapter-wallets';

const network = WalletAdapterNetwork.Devnet;
const endpoint = clusterApiUrl(network);

const wallets = [
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter(),
  new BackpackWalletAdapter(),
];

let selectedWallet = null;
let publicKey = null;

// ============================================================================
// CONSTANTS & GLOBALS
// ============================================================================

const API_BASE = window.location.origin;
const CLAIM_RADIUS = 50;
const MAX_RADS = 1000;
const DROP_CHANCE = { legendary: 0.35, epic: 0.18, rare: 0.09, common: 0.04 };

const GEAR_NAMES = {
  common: ['Pipe Rifle', '10mm Pistol', 'Leather Armor', 'Vault Suit'],
  rare: ['Hunting Rifle', 'Combat Shotgun', 'Laser Pistol', 'Metal Armor'],
  epic: ['Plasma Rifle', 'Gauss Rifle', 'Combat Armor', 'T-51b Power Armor'],
  legendary: ['Alien Blaster', 'Fat Man', "Lincoln's Repeater", 'Experimental MIRV']
};

const EFFECT_POOL = {
  common: [{type: 'maxHp', min: 5, max: 20}, {type: 'radResist', min: 20, max: 60}],
  rare: [{type: 'maxHp', min: 25, max: 50}, {type: 'radResist', min: 70, max: 140}, {type: 'capsBonus', min: 10, max: 25}],
  epic: [{type: 'maxHp', min: 50, max: 90}, {type: 'radResist', min: 150, max: 250}, {type: 'capsBonus', min: 25, max: 45}, {type: 'xpBonus', min: 15, max: 30}],
  legendary: [{type: 'maxHp', min: 100, max: 180}, {type: 'radResist', min: 300, max: 500}, {type: 'capsBonus', min: 40, max: 80}, {type: 'critDrop', min: 20, max: 40}]
};

let player = {
  wallet: localStorage.getItem('connectedWallet') || null,
  lvl: 1,
  hp: 100,
  maxHp: 100,
  caps: 0,
  rads: 0,
  xp: 0,
  xpToNext: 100,
  gear: [],
  equipped: {},
  claimed: new Set(),
  quests: []
};

let map, playerMarker = null, playerLatLng = null, lastAccuracy = 999, watchId = null, firstLock = true;
let locations = [], allQuests = [], markers = {};
let terminalSignal = null;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function randomEffect(rarity) {
  const pool = EFFECT_POOL[rarity] || EFFECT_POOL.common;
  const eff = pool[Math.floor(Math.random() * pool.length)];
  const val = eff.min + Math.floor(Math.random() * (eff.max - eff.min + 1));
  return { type: eff.type, val };
}

function generateGearDrop(rarity = 'common') {
  const names = GEAR_NAMES[rarity] || GEAR_NAMES.common;
  const effectCount = rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : rarity === 'rare' ? 2 : 1;
  const effects = Array.from({ length: effectCount }, () => randomEffect(rarity));
  return {
    id: `gear_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
    name: names[Math.floor(Math.random() * names.length)],
    rarity,
    effects,
    nftMint: null
  };
}

function applyGearBonuses() {
  let hpBonus = 0, radRes = 0, capsBonus = 0;
  Object.values(player.equipped).forEach(g => {
    g.effects.forEach(e => {
      if (e.type === 'maxHp') hpBonus += e.val;
      if (e.type === 'radResist') radRes += e.val;
      if (e.type === 'capsBonus') capsBonus += e.val;
    });
  });
  player.maxHp = 100 + (player.lvl - 1) * 10 + hpBonus;
  player.radResist = radRes;
  player.capsBonus = capsBonus;
  if (player.hp > player.maxHp) player.hp = player.maxHp;
}

function updateHPBar() {
  const hpPct = Math.min(100, player.hp / player.maxHp * 100);
  const radPct = Math.min(100, player.rads / MAX_RADS * 100);
  document.getElementById('hpFill').style.width = `${hpPct}%`;
  document.getElementById('radFill').style.width = `${radPct}%`;
  document.getElementById('hpText').textContent = `HP ${Math.floor(player.hp)} / ${player.maxHp}`;
  document.getElementById('playerLevel').textContent = player.lvl;
  document.getElementById('playerCaps').textContent = player.caps.toLocaleString();
}

function setStatus(text, isGood = true, time = 5000) {
  const s = document.getElementById('status');
  if (!s) return;
  s.textContent = `Status: ${text}`;
  s.className = isGood ? 'status-good' : 'status-bad';
  clearTimeout(s._to);
  if (time > 0) s._to = setTimeout(() => {
    s.textContent = 'Status: ready';
    s.className = 'status-good';
  }, time);
}

function playSfx(id, volume = 0.4) {
  const audio = document.getElementById(id);
  if (audio) {
    audio.currentTime = 0;
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch(() => {});
  }
}

// ============================================================================
// WALLET ADAPTER – CONNECT / DISCONNECT
// ============================================================================

async function connectWallet() {
  try {
    const walletName = prompt('Enter wallet name (phantom, solflare, backpack):')?.toLowerCase();
    selectedWallet = wallets.find(w => w.name.toLowerCase().includes(walletName));

    if (!selectedWallet) throw new Error('Wallet not supported');

    await selectedWallet.connect();
    publicKey = selectedWallet.publicKey.toString();
    player.wallet = publicKey;
    localStorage.setItem('connectedWallet', publicKey); // persist
    document.getElementById('status').textContent = `STATUS: CONNECTED (${publicKey.slice(0,6)}...)`;
    setStatus('Wallet connected!', true, 5000);
    await fetchPlayer();
  } catch (err) {
    console.error('Wallet connection failed:', err);
    setStatus('Connection failed: ' + err.message, false, 8000);
  }
}

function disconnectWallet() {
  if (selectedWallet) {
    selectedWallet.disconnect();
    selectedWallet = null;
    publicKey = null;
    player.wallet = null;
    localStorage.removeItem('connectedWallet');
    setStatus('Disconnected', true);
  }
}

// ============================================================================
// PLAYER DATA FETCH & SYNC
// ============================================================================

const NarrativeAPI = {
  async getMain() { const r = await fetch(`${API_BASE}/api/narrative/main`); return r.ok ? r.json() : { acts: [] }; },
  async getDialogList() { const r = await fetch(`${API_BASE}/api/narrative/dialog`); return r.ok ? r.json() : []; },
  async getDialog(key) { const r = await fetch(`${API_BASE}/api/narrative/dialog/${key}`); return r.ok ? r.json() : null; },
  async getTerminals() { const r = await fetch(`${API_BASE}/api/narrative/terminals`); return r.ok ? r.json() : { terminals: [] }; },
  async getCollectibles() { const r = await fetch(`${API_BASE}/api/narrative/collectibles`); return r.ok ? r.json() : { collectibles: [] }; }
};

async function fetchPlayer() {
  if (!player.wallet) return;
  try {
    const res = await fetch(`${API_BASE}/player/${player.wallet}`);
    if (!res.ok) throw new Error('Player fetch failed');
    const data = await res.json();
    Object.assign(player, data);
    player.claimed = new Set(data.claimed || []);
    player.quests = data.quests || [];
    player.gear = data.gear || [];
    player.equipped = data.equipped || {};
    applyGearBonuses();
    updateHPBar();
  } catch (e) {
    console.error('Player fetch failed:', e);
    setStatus('STATUS: OFFLINE', false);
  }
}

// ============================================================================
// GPS + MAP + CLAIMING
// ============================================================================

function placeMarker(lat, lng, accuracy) {
  playerLatLng = L.latLng(lat, lng);
  lastAccuracy = accuracy;

  if (!playerMarker) {
    playerMarker = L.circleMarker(playerLatLng, { radius: 10, color: '#00ff41', weight: 3, fillOpacity: 0.9 })
      .addTo(map)
      .bindPopup('You are here');
  } else {
    playerMarker.setLatLng(playerLatLng);
  }

  document.getElementById('gpsStatus').textContent = `GPS: ${Math.round(accuracy)}m`;
  document.getElementById('gpsDot').className = 'acc-dot ' + (accuracy <= 20 ? 'acc-green' : 'acc-amber');

  if (firstLock) {
    map.flyTo(playerLatLng, 16);
    firstLock = false;
  }
  document.getElementById('requestGpsBtn').style.display = 'none';
  setStatus("GPS LOCK ACQUIRED", true, 5000);
}

function startLocation() {
  if (!navigator.geolocation) return setStatus("GPS not supported", false);
  if (watchId) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(
    pos => placeMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    () => setStatus("GPS error", false),
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
  );
  setStatus("Requesting GPS lock...");
}

async function attemptClaim(loc) {
  if (lastAccuracy > CLAIM_RADIUS || !playerLatLng || !player.wallet || player.claimed.has(loc.n)) {
    setStatus("Cannot claim", false);
    return;
  }
  const dist = map.distance(playerLatLng, L.latLng(loc.lat, loc.lng));
  if (dist > CLAIM_RADIUS) {
    setStatus(`Too far (${Math.round(dist)}m)`, false);
    return;
  }

  const message = `Claim:${loc.n}:${Date.now()}`;
  try {
    const encoded = new TextEncoder().encode(message);
    const signed = await selectedWallet.signMessage(encoded);
    const signature = bs58.encode(signed);

    const res = await fetch(`${API_BASE}/find-loot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: player.wallet,
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

      const baseRad = loc.rarity === 'legendary' ? 120 : loc.rarity === 'epic' ? 80 : loc.rarity === 'rare' ? 50 : 20;
      player.rads = Math.min(MAX_RADS, player.rads + Math.max(5, baseRad - (player.radResist || 0) / 3));

      const xpGain = loc.rarity === 'legendary' ? 150 : loc.rarity === 'epic' ? 100 : loc.rarity === 'rare' ? 60 : 30;
      player.xp += xpGain;

      while (player.xp >= player.xpToNext) {
        player.xp -= player.xpToNext;
        player.lvl++;
        player.xpToNext = Math.floor(player.xpToNext * 1.5);
        player.maxHp += 10;
        player.hp = player.maxHp;
        setStatus(`LEVEL UP! Level ${player.lvl}`, true, 12000);
        playSfx('sfxLevelUp', 0.8);
      }

      if (Math.random() < (DROP_CHANCE[loc.rarity] || DROP_CHANCE.common)) {
        const newGear = generateGearDrop(loc.rarity || 'common');
        player.gear.push(newGear);
        setStatus(`GEAR DROP! ${newGear.name} (${newGear.rarity.toUpperCase()})`, true, 15000);
        playSfx('sfxGearDrop', 0.7);
      }

      playSfx('sfxClaim', 0.5);
      updateHPBar();
      // checkTerminalAccess(); // Add this if you have it
    } else {
      setStatus(data.error || "Claim failed", false);
    }
  } catch (err) {
    setStatus("Claim error", false);
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('connectWalletBtn')?.addEventListener('click', connectWallet);
  document.getElementById('refreshPlayerBtn')?.addEventListener('click', fetchPlayer);
  document.getElementById('requestGpsBtn')?.addEventListener('click', startLocation);

  document.querySelectorAll('.btn, .tab, .dropdown-btn').forEach(el => {
    el.addEventListener('click', () => playSfx('sfxButton', 0.3));
  });

  setInterval(() => {
    const effectiveRads = Math.max(0, player.rads - (player.radResist || 0));
    if (effectiveRads > 150 && player.hp > 0) {
      player.hp -= Math.floor(effectiveRads / 250);
      if (player.hp <= 0) player.hp = 0;
      updateHPBar();
    }
  }, 30000);

  updateHPBar();
  initMap();
});

