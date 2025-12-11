// api/mint-item.js
import fs from 'fs';
import path from 'path';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { Metaplex, keypairIdentity } from '@metaplex-foundation/js';

// Load mintables.json
const mintablesPath = path.join(process.cwd(), 'data', 'mintables.json');
const mintables = JSON.parse(fs.readFileSync(mintablesPath, 'utf8'));

// Solana setup
const connection = new Connection('https://api.mainnet-beta.solana.com');
const MINT_AUTHORITY = Keypair.fromSecretKey(/* load from env */);
const metaplex = Metaplex.make(connection).use(keypairIdentity(MINT_AUTHORITY));

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const { wallet, itemId } = req.body;
    try {
        // Lookup item
        const item = mintables.find(m => m.id === itemId);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        // Check CAPS balance (pseudo-code)
        const playerBalance = await getCapsBalance(wallet);
        if (playerBalance < item.priceCAPS) {
            return res.status(400).json({ error: 'Insufficient CAPS' });
        }

        // Deduct CAPS (pseudo-code)
        await burnCaps(wallet, item.priceCAPS);

        // Prepare metadata JSON (hosted on Arweave/IPFS ideally)
        const metadataUri = await uploadMetadata({
            name: item.name,
            symbol: "AFC", // Atomic Fizz Caps
            description: `Game item: ${item.name}, rarity: ${item.rarity}, spawnPOI: ${item.spawnPOI}`,
            attributes: [
                { trait_type: "rarity", value: item.rarity },
                { trait_type: "spawnPOI", value: item.spawnPOI },
                { trait_type: "levelRequirement", value: item.levelRequirement },
                { trait_type: "type", value: item.type }
            ]
        });

        // Mint NFT with Metaplex
        const { nft } = await metaplex.nfts().create({
            uri: metadataUri,
            name: item.name,
            sellerFeeBasisPoints: 500, // 5% royalties
            symbol: "AFC",
            tokenOwner: new PublicKey(wallet)
        });

        res.json({
            success: true,
            item: {
                id: item.id,
                name: item.name,
                rarity: item.rarity,
                minted: true
            },
            chainTx: { explorer: `https://solscan.io/token/${nft.address.toBase58()}` }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// --- Helper stubs ---
async function getCapsBalance(wallet) {
    return 100000000000000000; // placeholder
}
async function burnCaps(wallet, amount) {
    return true;
}
async function uploadMetadata(json) {
    // Upload to Arweave/IPFS via Bundlr or Metaplex storage
    // For now, return a placeholder URI
    return "https://arweave.net/PLACEHOLDER_METADATA_JSON";
}
