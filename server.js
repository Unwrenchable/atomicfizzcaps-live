// server.js - Atomic Fizz Caps Backend (FULLY UPDATED & CLEANED)
// December 2025 - Loot-finding + CAPS SHOP + NFT BURN FEE (1% to Dev Wallet) + Quests

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
    Transaction,
    sendAndConfirmRawTransaction
} = require('@solana/web3.js');
const {
    getOrCreateAssociatedTokenAccount,
    createTransferInstruction,
    getMint
} = require('@solana/spl-token');
const { Metaplex, keypairIdentity } = require('@metaplex-foundation/js');

// --- Config and env validation ---
const {
    SOLANA_RPC,
    TOKEN_MINT,
    GAME_VAULT_SECRET,
    DEV_WALLET_SECRET,
    PORT,
    COOLDOWN_SECONDS,
    REDIS_URL
} = process.env;

if (!SOLANA_RPC || !TOKEN_MINT || !GAME_VAULT_SECRET || !DEV_WALLET_SECRET || !REDIS_URL) {
    console.error('Missing required env vars: SOLANA_RPC, TOKEN_MINT, GAME_VAULT_SECRET, DEV_WALLET_SECRET, REDIS_URL');
    process.exit(1);
}

const connection = new Connection(SOLANA_RPC, 'confirmed');
const MINT_PUBKEY = new PublicKey(TOKEN_MINT);

let GAME_VAULT;
try {
    GAME_VAULT = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(GAME_VAULT_SECRET)));
} catch (e) {
    console.error('Invalid GAME_VAULT_SECRET');
    process.exit(1);
}

let DEV_WALLET;
try {
    DEV_WALLET = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(DEV_WALLET_SECRET)));
} catch (e) {
    console.error('Invalid DEV_WALLET_SECRET');
    process.exit(1);
}

const metaplex = Metaplex.make(connection);

const COOLDOWN = Number(COOLDOWN_SECONDS || 60);
const redis = new Redis(REDIS_URL);
redis.on('error', (err) => console.error('Redis error:', err));

// --- Helpers ---
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
    catch (e) { console.error('JSON error:', filePath); return []; }
}

async function isOnCooldown(wallet) { return await redis.ttl(`cooldown:${wallet}`) > 0; }
async function setCooldown(wallet, seconds = COOLDOWN) { await redis.set(`cooldown:${wallet}`, '1', 'EX', seconds); }

function verifySolanaSignature(message, signatureBase58, pubkeyBase58) {
    try {
        const sig = bs58.decode(signatureBase58);
        const pubkey = bs58.decode(pubkeyBase58);
        const msg = Buffer.from(message, 'utf8');
        return nacl.sign.detached.verify(msg, sig, pubkey);
    } catch (e) { return false; }
}

// --- Load data ---
const DATA_DIR = path.join(process.cwd(), 'data');
const LOCATIONS = safeJsonRead(path.join(DATA_DIR, 'locations.json'));
const QUESTS = safeJsonRead(path.join(DATA_DIR, 'quests.json'));  // New: quests.json
const MINTABLES = safeJsonRead(path.join(DATA_DIR, 'mintables.json'));

// --- Express setup ---
const app = express();
app.use(morgan('combined'));
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://unpkg.com'],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", SOLANA_RPC]
        }
    }
}));
app.use(cors());
app.use(express.json({ limit: '100kb' }));

const globalLimiter = rateLimit({ windowMs: 60_000, max: 200 });
app.use(globalLimiter);
const ipLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const actionLimiter = rateLimit({ windowMs: 60_000, max: 20 });

// --- Endpoints ---
app.get('/', (req, res) => res.json({ status: 'Atomic Fizz live ☢️', timestamp: new Date().toISOString() }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/locations', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.json(LOCATIONS);
});

app.get('/quests', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.json(QUESTS.length ? QUESTS : [
        { title: "Find Vault 77 Key", desc: "Legend says it's hidden in the Mojave...", status: "ACTIVE" },
        { title: "Scavenge 10 Locations", desc: "Claim 10 POIs to prove your survival skills", status: "AVAILABLE" }
    ]);
});

app.get('/mintables', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.json(MINTABLES);
});

app.get('/player/:addr', async (req, res) => {
    const { addr } = req.params;
    try { new PublicKey(addr); }
    catch (e) { return res.status(400).json({ error: 'Invalid address' }); }
    const data = await redis.get(`player:${addr}`);
    res.json(data ? JSON.parse(data) : { lvl: 1, hp: 100, caps: 0, gear: [], found: [], listed: [] });
});

// Find loot - transfers CAPS from vault
app.post('/find-loot', ipLimiter, actionLimiter, [
    body('wallet').exists().isString(),
    body('spot').exists().isString(),
    body('lat').exists().isNumeric(),
    body('lng').exists().isNumeric(),
    body('signature').exists().isString(),
    body('message').exists().isString(),
    body('streak').optional().isInt({ min: 0 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { wallet, spot, lat, lng, signature, message, streak = 0 } = req.body;

    const loc = LOCATIONS.find(l => l.n === spot);
    if (!loc) return res.status(400).json({ error: 'Invalid spot' });

    let userPubkey;
    try { userPubkey = new PublicKey(wallet); } catch (e) { return res.status(400).json({ error: 'Invalid wallet' }); }

    if (!verifySolanaSignature(message, signature, wallet)) return res.status(400).json({ error: 'Signature failed' });

    const distance = haversine(lat, lng, loc.lat, loc.lng);
    if (distance > 50) return res.status(400).json({ error: 'Too far' });

    if (await isOnCooldown(wallet)) return res.status(429).json({ error: 'Cooldown' });

    try {
        const baseCaps = (loc.lvl || 1) * 15 + Math.floor(Math.random() * 50);
        const totalCaps = Math.max(5, baseCaps + streak * 8);

        const mintInfo = await getMint(connection, MINT_PUBKEY);
        const decimals = Number(mintInfo.decimals || 6);
        const amountRaw = BigInt(totalCaps) * BigInt(10 ** decimals);

        const vaultATA = await getOrCreateAssociatedTokenAccount(connection, GAME_VAULT, MINT_PUBKEY, GAME_VAULT.publicKey, true);
        const userATA = await getOrCreateAssociatedTokenAccount(connection, GAME_VAULT, MINT_PUBKEY, userPubkey);

        const transferIx = createTransferInstruction(vaultATA.address, userATA.address, GAME_VAULT.publicKey, amountRaw);

        const tx = new Transaction().add(transferIx);
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.feePayer = GAME_VAULT.publicKey;
        tx.sign(GAME_VAULT);

        const rawTx = tx.serialize();
        const sig = await sendAndConfirmRawTransaction(connection, rawTx, { commitment: 'confirmed' });

        await setCooldown(wallet);

        const playerKey = `player:${wallet}`;
        const rawPlayer = await redis.get(playerKey);
        const playerData = rawPlayer ? JSON.parse(rawPlayer) : { lvl: 1, hp: 100, caps: 0, gear: [], found: [] };
        playerData.caps += totalCaps;
        if (!playerData.found.includes(spot)) playerData.found.push(spot);
        playerData.lvl = Math.floor(playerData.caps / 400) + 1;
        await redis.set(playerKey, JSON.stringify(playerData));

        res.json({
            success: true,
            sig,
            capsFound: totalCaps,
            totalCaps: playerData.caps,
            level: playerData.lvl,
            message: `Found ${totalCaps} CAPS at ${spot}! 💰`
        });
    } catch (err) {
        console.error('Loot error:', err);
        res.status(500).json({ error: 'Loot failed' });
    }
});

// === CAPS SHOP ===
app.post('/shop/list', ipLimiter, actionLimiter, [
    body('wallet').exists().isString(),
    body('nftAddress').exists().isString(),
    body('price').exists().isInt({ min: 1 }),
    body('signature').exists().isString(),
    body('message').exists().isString()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { wallet, nftAddress, price, signature, message } = req.body;
    if (!verifySolanaSignature(message, signature, wallet)) return res.status(400).json({ error: 'Bad signature' });

    let nftPk;
    try { nftPk = new PublicKey(nftAddress); } catch (e) { return res.status(400).json({ error: 'Invalid NFT' }); }

    const nft = await metaplex.nfts().findByMint({ mintAddress: nftPk });
    if (nft.ownerAddress.toBase58() !== wallet) return res.status(403).json({ error: 'Not owner' });

    const listing = {
        nft: nftAddress,
        seller: wallet,
        price,
        name: nft.name,
        uri: nft.uri,
        listedAt: Date.now()
    };

    await redis.hset('caps_shop_listings', nftAddress, JSON.stringify(listing));
    res.json({ success: true, message: `Listed "${nft.name}" for ${price} CAPS` });
});

app.get('/shop/listings', async (req, res) => {
    const raw = await redis.hgetall('caps_shop_listings');
    const listings = Object.values(raw).map(JSON.parse).sort((a, b) => a.price - b.price);
    res.json(listings);
});

app.post('/shop/buy', ipLimiter, actionLimiter, [
    body('wallet').exists().isString(),
    body('nftAddress').exists().isString(),
    body('signature').exists().isString(),
    body('message').exists().isString()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { wallet, nftAddress, signature, message } = req.body;
    if (!verifySolanaSignature(message, signature, wallet)) return res.status(400).json({ error: 'Bad signature' });

    const listingJson = await redis.hget('caps_shop_listings', nftAddress);
    if (!listingJson) return res.status(404).json({ error: 'Not listed or sold' });

    const listing = JSON.parse(listingJson);
    const buyerPk = new PublicKey(wallet);
    const sellerPk = new PublicKey(listing.seller);
    const nftPk = new PublicKey(nftAddress);

    const playerData = JSON.parse(await redis.get(`player:${wallet}`) || '{"caps":0}');
    if (playerData.caps < listing.price) return res.status(400).json({ error: 'Not enough CAPS' });

    try {
        const decimals = 6;
        const fullAmount = BigInt(listing.price) * BigInt(10 ** decimals);
        const burnAmount = fullAmount / BigInt(100); // 1%
        const sellerAmount = fullAmount - burnAmount;

        const buyerATA = await getOrCreateAssociatedTokenAccount(connection, buyerPk, MINT_PUBKEY, buyerPk);
        const sellerATA = await getOrCreateAssociatedTokenAccount(connection, buyerPk, MINT_PUBKEY, sellerPk);
        const devATA = await getOrCreateAssociatedTokenAccount(connection, buyerPk, MINT_PUBKEY, DEV_WALLET.publicKey);

        const ixs = [];
        ixs.push(createTransferInstruction(buyerATA.address, sellerATA.address, buyerPk, sellerAmount));
        ixs.push(createTransferInstruction(buyerATA.address, devATA.address, buyerPk, burnAmount));

        const nftTransferIx = (await metaplex.nfts().builders().transfer({
            nftOrSft: { address: nftPk },
            fromOwner: sellerPk,
            toOwner: buyerPk,
            authority: sellerPk
        }).getInstructions())[0];

        ixs.push(nftTransferIx);

        const tx = new Transaction().add(...ixs);
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        tx.feePayer = buyerPk;

        const serialized = tx.serializeMessage().toString('base64');

        await redis.hdel('caps_shop_listings', nftAddress);

        playerData.caps -= listing.price;
        await redis.set(`player:${wallet}`, JSON.stringify(playerData));

        res.json({
            success: true,
            partialTx: serialized,
            burnAmount: Number(burnAmount) / 10 ** decimals,
            sellerGets: Number(sellerAmount) / 10 ** decimals,
            message: `Bought "${listing.name}"! 1% sent to dev fund. Seller must approve NFT transfer.`
        });

    } catch (err) {
        console.error('Buy error:', err);
        res.status(500).json({ error: 'Transaction failed' });
    }
});

app.post('/shop/delist', ipLimiter, actionLimiter, [
    body('wallet').exists().isString(),
    body('nftAddress').exists().isString(),
    body('signature').exists().isString(),
    body('message').exists().isString()
], async (req, res) => {
    const { wallet, nftAddress, signature, message } = req.body;
    if (!verifySolanaSignature(message, signature, wallet)) return res.status(400).json({ error: 'Bad signature' });

    const listing = await redis.hget('caps_shop_listings', nftAddress);
    if (!listing) return res.status(404).json({ error: 'Not listed' });
    if (JSON.parse(listing).seller !== wallet) return res.status(403).json({ error: 'Not yours' });

    await redis.hdel('caps_shop_listings', nftAddress);
    res.json({ success: true, message: 'Delisted' });
});

// Error handlers
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Server error' }); });

const port = Number(PORT || 3000);
app.listen(port, () => {
    console.log(`Atomic Fizz server running on port ${port}`);
    console.log(`RPC: ${SOLANA_RPC}`);
    console.log(`Token: ${TOKEN_MINT}`);
    console.log(`Vault: ${GAME_VAULT.publicKey.toBase58()}`);
    console.log(`Dev fund: ${DEV_WALLET.publicKey.toBase58()}`);
});