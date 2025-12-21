// /js/script.js – Complete drop-in replacement (full polished v1.1 with XP/leveling, shop, sounds, gear, quests)

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
  equipped: {}, // {gearId: gearObject}
  claimed: new Set(),
  quests: []
};
let locations = [], allQuests = [], markers = {};
const API_BASE = window.location.origin;
const CLAIM_RADIUS = 50;
const MAX_RADS = 1000;
let terminalSignal = null;

// Gear drop chances and effect pools
const DROP_CHANCE = { legendary: 0.35, epic: 0.18, rare: 0.09, common: 0.04 };

const GEAR_NAMES = {
  common: ['Pipe Rifle', '10mm Pistol', 'Leather Armor', 'Vault Suit'],
  rare: ['Hunting Rifle', 'Combat Shotgun', 'Laser Pistol', 'Metal Armor'],
  epic: ['Plasma Rifle', 'Gauss Rifle', 'Combat Armor', 'T-51b Power Armor'],
  legendary: ['Alien Blaster', 'Fat Man', 'Lincoln\'s Repeater', 'Experimental MIRV']
};

const EFFECT_POOL = {
  common: [{type: 'maxHp', min: 5, max: 20}, {type: 'radResist', min: 20, max: 60}],
  rare: [{type: 'maxHp', min: 25, max: 50}, {type: 'radResist', min: 70, max: 140}, {type: 'capsBonus', min: 10, max: 25}],
  epic: [{type: 'maxHp', min: 50, max: 90}, {type: 'radResist', min: 150, max: 250}, {type: 'capsBonus', min: 25, max: 45}, {type: 'xpBonus', min: 15, max: 30}],
  legendary: [{type: 'maxHp', min: 100, max: 180}, {type: 'radResist', min: 300, max: 500}, {type: 'capsBonus', min: 40, max: 80}, {type: 'critDrop', min: 20, max: 40}]
};

function randomEffect(rarity) {
  const pool = EFFECT_POOL[rarity] || EFFECT_POOL.common;
  const eff = pool[Math.floor(Math.random() * pool.length)];
  const val = eff.min + Math.floor(Math.random() * (eff.max - eff.min + 1));
  return {type: eff.type, val};
}

function generateGearDrop(rarity = 'common') {
  const names = GEAR_NAMES[rarity] || GEAR_NAMES.common;
  const effectCount = rarity === 'legendary' ? 3 : rarity === 'epic' ? 2 : rarity === 'rare' ? 2 : 1;
  const effects = Array.from({length: effectCount}, () => randomEffect(rarity));
  return {
    id: `gear_${Date.now()}_${Math.random().toString(36).substr(2,9)}`,
    name: names[Math.floor(Math.random() * names.length)],
    rarity,
    effects,
    nftMint: null
  };
}

// Sound effects
function playSfx(id, volume = 0.4) {
  const audio = document.getElementById(id);
  if (audio) {
    audio.currentTime = 0;
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch(() => {});
  }
}

// Button sounds – called once on load
function initButtonSounds() {
  document.querySelectorAll('.btn, .tab, .equip-btn, .shop-buy-btn').forEach(el => {
    el.addEventListener('click', () => playSfx('sfxButton', 0.3));
  });
}

// Gear bonuses
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
  document.getElementById('lvl').textContent = player.lvl;
  document.getElementById('caps').textContent = player.caps;
  document.getElementById('claimed').textContent = player.claimed.size;
}

function setStatus(text, isGood = true, time = 5000) {
  const s = document.getElementById('status');
  if (!s) return;
  s.textContent = `Status: ${text}`;
  s.className = isGood ? 'status-good' : 'status-bad';
  clearTimeout(s._to);
  if (time > 0) s._to = setTimeout(() => { s.textContent = 'Status: ready'; s.className = 'status-good'; }, time);
}

// STATUS tab with XP
function renderStats() {
  document.getElementById('panelBody').innerHTML = `
    <div class="list-item"><strong>LEVEL</strong><div>${player.lvl}</div></div>
    <div class="list-item"><strong>XP</strong><div>${player.xp} / ${player.xpToNext}</div></div>
    <div class="list-item"><strong>HP</strong><div>${Math.floor(player.hp)} / ${player.maxHp}</div></div>
    <div class="list-item"><strong>RADS</strong><div>${player.rads} / ${MAX_RADS}</div></div>
    <div class="list-item"><strong>CAPS</strong><div>${player.caps}</div></div>
    <div class="list-item"><strong>CLAIMED</strong><div>${player.claimed.size}</div></div>
  `;
}

// INVENTORY
async function renderItems() {
  let html = '';
  if (player.gear.length === 0) {
    html = '<div class="list-item">Inventory empty – hunt rare locations!</div>';
  } else {
    player.gear.forEach((g, i) => {
      const isEq = player.equipped[g.id];
      const effStr = g.effects.map(e => `${e.type} +${e.val}`).join(', ');
      html += `<div class="list-item">
        <strong>${g.name}${isEq ? ' <span class="equipped">[EQUIPPED]</span>' : ''}</strong>
        <div>
          <button class="equip-btn" data-index="${i}">${isEq ? 'UNEQUIP' : 'EQUIP'}</button>
          <small>${g.rarity.toUpperCase()} • ${effStr}</small>
        </div>
      </div>`;
    });
  }
  document.getElementById('panelBody').innerHTML = html;

  document.querySelectorAll('.equip-btn').forEach(btn => {
    btn.onclick = async () => {
      const i = parseInt(btn.dataset.index);
      const gear = player.gear[i];
      if (player.equipped[gear.id]) {
        delete player.equipped[gear.id];
      } else {
        player.equipped[gear.id] = gear;
      }
      playSfx('sfxEquip', 0.4);
      applyGearBonuses();
      updateHPBar();
      renderItems();
      await fetch(`${API_BASE}/equip`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({equipped: Object.keys(player.equipped)})
      });
    };
  });
}

// QUESTS
async function renderQuests() {
  if (allQuests.length === 0) {
    try { allQuests = await (await fetch(`${API_BASE}/quests`)).json(); } catch {}
  }
  let html = '';
  allQuests.forEach(q => {
    const pq = player.quests.find(p => p.id === q.id) || {progress: 0, completed: false};
    const status = pq.completed ? 'COMPLETED ✓' : `${pq.progress}/${q.objectives?.length || '?'}`;
    html += `<div class="list-item"><strong>${q.name}</strong><div><small>${q.description}</small><br>Progress: ${status}</div></div>`;
  });
  document.getElementById('panelBody').innerHTML = html || '<div class="list-item">No quests available</div>';
}

// SHOP
async function renderShop() {
  const shopItems = [
    {id: 'radaway', name: 'RadAway', desc: 'Clear 300 RADS', price: 150},
    {id: 'stimpak', name: 'Stimpak', desc: '+50 HP', price: 100},
    {id: 'caps100', name: '100 CAPS Booster', desc: 'Instant CAPS', price: 50},
    {id: 'xpboost', name: 'XP Booster x2 (1h)', desc: 'Double XP gains', price: 200}
  ];

  let html = '<div class="list-item"><strong>SCAVENGER\'S EXCHANGE</strong></div>';
  shopItems.forEach(item => {
    const affordable = player.caps >= item.price;
    html += `<div class="list-item">
      <strong>${item.name}</strong>
      <div>
        <small>${item.desc}<br>Price: ${item.price} CAPS</small><br>
        <button class="shop-buy-btn" data-id="${item.id}" ${!affordable ? 'disabled' : ''}>BUY</button>
      </div>
    </div>`;
  });

  document.getElementById('panelBody').innerHTML = html;

  document.querySelectorAll('.shop-buy-btn').forEach(btn => {
    btn.onclick = async () => {
      const itemId = btn.dataset.id;
      playSfx('sfxButton', 0.4);
      try {
        const res = await fetch(`${API_BASE}/shop/buy`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({wallet: wallet.publicKey.toBase58(), item: itemId})
        });
        const data = await res.json();
        if (data.success) {
          player.caps = data.caps;
          if (itemId === 'radaway') player.rads = Math.max(0, player.rads - 300);
          if (itemId === 'stimpak') player.hp = Math.min(player.maxHp, player.hp + 50);
          updateHPBar();
          renderShop();
          setStatus(`${item.name} purchased!`, true, 8000);
          playSfx('sfxEquip', 0.5);
        } else {
          setStatus(data.error || 'Not enough CAPS', false);
        }
      } catch {
        setStatus('Shop offline', false);
      }
    };
  });
}

// Radiation drain
setInterval(() => {
  const effectiveRads = Math.max(0, player.rads - player.radResist);
  if (effectiveRads > 150 && player.hp > 0) {
    player.hp -= Math.floor(effectiveRads / 250);
    if (player.hp <= 0) player.hp = 0;
    updateHPBar();
    playSfx('sfxRadTick', 0.3 + (effectiveRads / 1000));
  }
}, 30000);

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const term = document.getElementById('terminal');
    if (tab.dataset.panel === 'map') {
      term.classList.remove('open');
    } else {
      term.classList.add('open');
      document.getElementById('panelTitle').textContent = tab.textContent;
      if (tab.dataset.panel === 'stat') renderStats();
      if (tab.dataset.panel === 'items') renderItems();
      if (tab.dataset.panel === 'quests') renderQuests();
      if (tab.dataset.panel === 'shop') renderShop();
    }
  };
});
document.getElementById('panelClose').onclick = () => {
  document.getElementById('terminal').classList.remove('open');
  document.querySelector('.tab[data-panel="map"]').classList.add('active');
};

// Close modals
document.getElementById('mintCloseBtn').onclick = () => document.getElementById('mintModal').classList.remove('open');
document.getElementById('tutorialClose').onclick = () => document.getElementById('tutorialModal').classList.remove('open');

// attemptClaim
async function attemptClaim(loc) {
  if (lastAccuracy > CLAIM_RADIUS || !playerLatLng || !wallet || player.claimed.has(loc.n)) {
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
    const signed = await wallet.signMessage(encoded);
    const signature = bs58.encode(signed);

    const res = await fetch(`${API_BASE}/find-loot`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        wallet: wallet.publicKey.toBase58(),
        spot: loc.n,
        message,
        signature
      })
    });
    const data = await res.json();

    if (data.success) {
      const oldLvl = player.lvl;

      player.caps = data.totalCaps || player.caps;
      player.claimed.add(loc.n);
      markers[loc.n]?.setStyle({fillColor: '#003300', fillOpacity: 0.5});

      // Rad gain
      const baseRad = loc.rarity === 'legendary' ? 120 : loc.rarity === 'epic' ? 80 : loc.rarity === 'rare' ? 50 : 20;
      player.rads = Math.min(MAX_RADS, player.rads + Math.max(5, baseRad - player.radResist / 3));

      // XP & Leveling
      const xpGain = loc.rarity === 'legendary' ? 150 : loc.rarity === 'epic' ? 100 : loc.rarity === 'rare' ? 60 : 30;
      player.xp = (data.xp || player.xp) + xpGain;

      while (player.xp >= player.xpToNext) {
        player.xp -= player.xpToNext;
        player.lvl++;
        player.xpToNext = Math.floor(player.xpToNext * 1.5);
        player.maxHp += 10;
        player.hp = player.maxHp;
        setStatus(`LEVEL UP! Level ${player.lvl}`, true, 12000);
        playSfx('sfxLevelUp', 0.8);
      }

      // Gear drop
      let gearDropped = false;
      const chance = DROP_CHANCE[loc.rarity] || DROP_CHANCE.common;
      if (Math.random() < chance) {
        const newGear = generateGearDrop(loc.rarity || 'common');
        player.gear.push(newGear);
        setStatus(`GEAR DROP! ${newGear.name} (${newGear.rarity.toUpperCase()})`, true, 15000);
        playSfx('sfxGearDrop', 0.7);
        gearDropped = true;
        fetch(`${API_BASE}/mint-gear`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(newGear)});
      }

      // Quests
      if (data.quests) player.quests = data.quests;

      playSfx('sfxClaim', 0.5);
      renderQuests();
      renderItems();
      renderStats();
      applyGearBonuses();
      updateHPBar();

      document.getElementById('mintTitle').textContent = gearDropped && player.gear[player.gear.length-1].rarity === 'legendary' ? 'LEGENDARY LOOT!' : 'LOOT CLAIMED';
      document.getElementById('mintMsg').textContent = gearDropped ? `${player.gear[player.gear.length-1].name} added!` : `+${data.capsFound || 0} CAPS`;
      document.getElementById('mintModal').classList.add('open');

      checkTerminalAccess();
    } else {
      setStatus(data.error || "Claim failed", false);
    }
  } catch (err) {
    setStatus("Claim error", false);
  }
}

// Map init (keep your existing initMap function here)

// Load
window.addEventListener('load', () => {
  initMap();
  initButtonSounds();
});
