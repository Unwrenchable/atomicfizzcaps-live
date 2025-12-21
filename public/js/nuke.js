let wallet = null;
let playerData = { gear: [], caps: 0 };

async function loadGear() {
    const provider = window.solana || window.phantom?.solana;
    if (!provider?.isPhantom) {
        document.getElementById('gearList').innerHTML = '<div class="message">No wallet detected</div>';
        return;
    }

    try {
        await provider.connect();
        wallet = provider;
        const addr = wallet.publicKey.toBase58();

        const res = await fetch(`/player/${addr}`);
        if (res.ok) playerData = await res.json();

        renderGear();
    } catch {
        document.getElementById('gearList').innerHTML = '<div class="message">Wallet connection failed</div>';
    }
}

function renderGear() {
    const gear = playerData.gear || [];
    if (!gear.length) {
        document.getElementById('gearList').innerHTML = '<div class="message">No gear to fuse</div>';
        return;
    }

    const html = gear.map((item, i) => `
        <div class="shop-listing">
            <div>
                <strong>${item.name}</strong><br>
                <span class="muted-small">${item.rarity || 'common'} • PWR ${item.power || 0}</span>
            </div>
            <button class="buy-btn sol-btn" onclick="burnGear(${i})">
                BURN FOR CAPS
            </button>
        </div>
    `).join('');

    document.getElementById('gearList').innerHTML = html;
}

async function burnGear(index) {
    if (!confirm('PERMANENTLY DESTROY this gear for CAPS?')) return;

    const item = playerData.gear[index];
    const message = `Burn:${item.name}:${Date.now()}`;
    const encoded = new TextEncoder().encode(message);

    try {
        const signed = await wallet.signMessage(encoded);
        const signature = bs58.encode(signed);

        const res = await fetch('/nuke-gear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                wallet: wallet.publicKey.toBase58(),
                index,
                message,
                signature
            })
        });

        const data = await res.json();
        if (data.success) {
            playerData.caps = data.newCaps;
            playerData.gear.splice(index, 1);
            renderGear();
            alert(`Gear destroyed! +${data.capsGained} CAPS`);
        } else {
            alert(data.error || 'Burn failed');
        }
    } catch {
        alert('Signature canceled');
    }
}

document.getElementById('backBtn').onclick = () => window.location.href = '/';

loadGear();