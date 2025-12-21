# Atomic Fizz Caps 🥤☢️

**A Fallout-inspired real-world geo-location adventure game powered by Solana blockchain.**

Explore the Mojave Wasteland in real life: Use your phone's GPS to hunt for iconic Fallout locations (Hoover Dam, New Vegas Strip, hidden vaults, irradiated sites), claim loot when close enough, earn **CAPS** (in-game currency), accumulate radiation, level up, and mint rewards via your Phantom wallet.

Built with Leaflet maps, Solana web3.js, and a retro Pip-Boy 3000 interface – green glow, VT323 font, status bars for HP/RADS/CAPS.

Play now:(https://atomicfizzcaps.xyz/)

## 🌵 Gameplay Features

- **Real-World GPS Hunting**: Markers at real Fallout-inspired locations (Hoover Dam, Helios One, Vault sites, Chernobyl, Trinity Site, etc.). Get within ~50m to claim.
- **Pip-Boy UI**: Retro green glow, HP/Radiation bar, Level, CAPS counter, claimed count.
- **Quests System**: Deep main and side quests with multiple endings, objectives, and consequences (data loaded from `/quests` endpoint).
- **Loot & Rewards**: Claim CAPS, gear, radiation buildup. Wallet-signed claims for on-chain security.
- **Scavenger's Exchange**: Shop for NFTs/CAPS using in-game currency or direct SOL payments (QR code support).
- **Solana Integration**: Phantom wallet connect, signed messages for claims/purchases.
- **Progression**: Level up, manage radiation, collect gear.

## 🛠️ Tech Stack

- Frontend: Pure HTML/CSS/JS with Leaflet for maps, QRCode.js
- Backend: Node.js + Express (server.js)
- Blockchain: @solana/web3.js, bs58, Phantom wallet
- Database: Redis (ioredis) for player data
- Security: CORS, Helmet, Rate-limiting, Morgan logging
- License: MIT

## 📢 Roadmap

- More real-world locations & dynamic events
- On-chain NFT minting for rare loot
- Leaderboards & multiplayer challenges
- Mobile PWA support

**Survive the Wasteland. Claim your CAPS. War... war never changes.** ☢️

Developed by **Unwrenchable** | Powered by Solana
