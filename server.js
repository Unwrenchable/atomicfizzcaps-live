require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const Redis = require('ioredis');
const nacl = require('tweetnacl');
const bs58 = require('bs58');
const {
    Connection,
    Keypair,
    PublicKey,
} = require('@solana/web3.js');
const {
    getOrCreateAssociatedTokenAccount,
    createTransferInstruction
} = require('@solana/spl-token');

process.on('unhandledRejection', (r) => console.warn('Unhandled Rejection:', r));
process.on('uncaughtException', (e) => console.error('Uncaught Exception:', e));

const {
    SOLANA_RPC,
    TOKEN_MINT,
    GAME_VAULT_SECRET,
    DEV_WALLET_SECRET,
    PORT = 3000,
    COOLDOWN_SECONDS = 60,
    REDIS_URL
} = process.env;

if (!SOLANA_RPC || !TOKEN_MINT || !GAME_VAULT_SECRET || !DEV_WALLET_SECRET || !REDIS_URL) {
    console.error('Missing required env vars');
    process.exit(1);
}

const connection = new Connection(SOLANA_RPC, 'confirmed');
const MINT_PUBKEY = new PublicKey(TOKEN_MINT);
const GAME_VAULT = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(GAME_VAULT_SECRET)));
const COOLDOWN = Number(COOLDOWN_SECONDS);
const redis = new Redis(REDIS_URL);
redis.on('error', (err) => console.error('Redis error:', err));

function haversine(lat1, lon1, lat2, lon2) {
    const toRad = x => x * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function safeJsonRead(filePath) {
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (e) { console.error('JSON load error:', filePath); return []; }
}

async function isOnCooldown(wallet) { return (await redis.ttl(`cooldown:${wallet}`)) > 0; }
async function setCooldown(wallet) { await redis.set(`cooldown:${wallet}`, '1', 'EX', COOLDOWN); }

function verifySolanaSignature(message, signatureBase58, pubkeyBase58) {
    try {
        const sig = bs58.decode(signatureBase58);
        const pubkey = bs58.decode(pubkeyBase58);
        const msg = Buffer.from(message, 'utf8');
        return nacl.sign.detached.verify(msg, sig, pubkey);
    } catch { return false; }
}

const DATA_DIR = path.join(__dirname, 'data');
const LOCATIONS = safeJsonRead(path.join(DATA_DIR, 'locations.json'));
const QUESTS = safeJsonRead(path.join(DATA_DIR, 'quests.json'));
const MINTABLES = safeJsonRead(path.join(DATA_DIR, 'mintables.json'));

const app = express();

app.use(morgan('combined'));

// FIXED: Secure Helmet configuration
app.use(
    helmet({
        // Keep most defaults, but relax CSP a bit for typical web3/SPA needs
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // needed for many web3 wallets & dynamic scripts
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", SOLANA_RPC, "wss:"], // allow Solana RPC & websockets
                fontSrc: ["'self'", "data:"],
                objectSrc: ["'none'"],
                upgradeInsecureRequests: [],
            },
        },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })
);

app.use(cors());
app.use(express.json({ limit: '100kb' }));

const globalLimiter = rateLimit({ windowMs: 60_000, max: 200 });
const actionLimiter = rateLimit({ windowMs: 60_000, max: 20 });

app.use(globalLimiter);
app.use('/find-loot', actionLimiter);
app.use('/shop/', actionLimiter);
app.use('/select-gear-drop', actionLimiter);

// FIXED: Only serve public assets safely
// Create a folder called "public" in your project root and put index.html, css, js, images there
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// Optional: if you still have some old assets in root, you can selectively serve them
// app.use('/some-specific-file.js', express.static(path.join(__dirname, 'some-specific-file.js')));

// API routes (must come before catch-all)
app.get('/locations', (req, res) => res.json(LOCATIONS));
app.get('/quests', (req, res) => res.json(QUESTS.length ? QUESTS : []));
app.get('/mintables', (req, res) => res.json(MINTABLES.length ? MINTABLES : []));

app.get('/player/:addr', async (req, res) => {
    const { addr } = req.params;
    try { new PublicKey(addr); } catch { return res.status(400).json({ error: 'Invalid address' }); }
    const data = await redis.get(`player:${addr}`);
    res.json(data ? JSON.parse(data) : { lvl: 1, hp: 100, caps: 0, gear: [], found: [], xp: 0, xpToNext: 100 });
});

app.post('/player/:addr', async (req, res) => {
    const { addr } = req.params;
    const data = req.body;
    await redis.set(`player:${addr}`, JSON.stringify(data));
    res.json({ success: true });
});

app.post('/find-loot', [
    body('wallet').notEmpty(),
    body('spot').notEmpty(),
    body('lat').isFloat(),
    body('lng').isFloat(),
    body('signature').notEmpty(),
    body('message').notEmpty()
], async (req, res) => {
    // ... (your existing /find-loot implementation) ...
});

app.post('/select-gear-drop', [
    body('wallet').notEmpty(),
    body('rarity').isIn(['common', 'rare', 'epic', 'legendary']),
    body('lvl').isInt({ min: 1 }),
    body('signature').notEmpty(),
    body('message').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { wallet, rarity, lvl, signature, message } = req.body;
    if (!verifySolanaSignature(message, signature, wallet)) {
        return res.status(400).json({ error: 'Bad signature' });
    }

    const candidates = MINTABLES.filter(i => i.rarity === rarity && i.levelRequirement <= lvl);
    if (!candidates.length) return res.status(400).json({ error: 'No item available' });

    const item = candidates[Math.floor(Math.random() * candidates.length)];
    const powerBoost = Math.floor(lvl * 3);
    const power = item.priceCAPS + powerBoost;

    res.json({ 
        success: true, 
        item: { 
            ...item, 
            power,
            image: rarityImages?.[rarity] || "https://arweave.net/default.png"
        }
    });
});

// Shop endpoints (unchanged)
app.get('/shop/listings', async (req, res) => {
    const raw = await redis.hgetall('caps_shop_listings');
    const listings = Object.values(raw).map(JSON.parse).sort((a, b) => a.price - b.price);
    res.json(listings);
});

// ... (other shop routes)

// SPA catch-all: serve index.html for client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atomic Fizz Caps LIVE on port ${PORT}`);
    console.log(`Vault: ${GAME_VAULT.publicKey.toBase58()}`);
});

module.exports = app;