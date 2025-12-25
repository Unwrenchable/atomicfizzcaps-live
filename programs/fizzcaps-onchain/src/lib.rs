use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount, MintTo, burn},
};
use mpl_token_metadata::{
    instructions::CreateV1CpiBuilder,
    types::{TokenStandard, Collection},
    ID as METADATA_PROGRAM_ID,
};
use solana_program::sysvar::instructions::{Instructions as SysvarInstructions, load_instruction_at_checked};

declare_id!("GDGexnGtZPoD1aHv6qg8hjeSspujwWnxJCtdrrj2gKpP");

const CAPS_MINT_SEEDS: &[u8] = b"caps-mint";
const TREASURY_SEEDS: &[u8] = b"treasury";
const LOOT_MINT_AUTHORITY_SEEDS: &[u8] = b"loot-mint-auth";

#[program]
pub mod fizzcaps_onchain {
    use super::*;

    // Your existing initialize_caps (unchanged from working version)

    // Your existing revoke_mint_authority (using set_authority CPI if needed, but from previous)

    pub fn claim_loot(ctx: Context<ClaimLoot>, voucher: LootVoucher) -> Result<()> {
        let fee_amount = 100 * 10u64.pow(9); // 100 $CAPS burn fee

        // Burn $CAPS for deflation
        burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.caps_mint.to_account_info(),
                    from: ctx.accounts.player_caps_ata.to_account_info(),
                    authority: ctx.accounts.player.to_account_info(),
                },
            ),
            fee_amount,
        )?;

        // Verify server-signed voucher using Ed25519 pre-instruction
        verify_ed25519_signature(&ctx.accounts.instructions_sysvar, &ctx.accounts.server_key.key().to_bytes(), &voucher.serialize(), &voucher.server_signature)?;

        // Mint unique loot NFT
        anchor_spl::token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.loot_mint.to_account_info(),
                    to: ctx.accounts.player_loot_ata.to_account_info(),
                    authority: ctx.accounts.loot_mint_authority.to_account_info(),
                },
                &[&[LOOT_MINT_AUTHORITY_SEEDS, &[ctx.bumps.loot_mint_authority]]],
            ),
            1,
        )?;

        // Create metadata — GPS in name (on-chain visible), full data in off-chain uri
        let name = format!(
            "Fizz Cache #{} @ ({:.4},{:.4}) {}",
            voucher.loot_id, voucher.latitude, voucher.longitude, voucher.location_hint
        );

        CreateV1CpiBuilder::new(&ctx.accounts.metadata_program)
            .metadata(&ctx.accounts.loot_metadata)
            .mint(&ctx.accounts.loot_mint.to_account_info(), true)
            .authority(&ctx.accounts.loot_mint_authority)
            .payer(&ctx.accounts.player)
            .update_authority(&ctx.accounts.loot_mint_authority, true)
            .system_program(&ctx.accounts.system_program)
            .sysvar_instructions(&ctx.accounts.instructions_sysvar)
            .token_standard(TokenStandard::NonFungible)
            .name(name)
            .symbol("FIZZLOOT".to_string())
            .uri("https://atomicfizzcaps.xyz/loot/".to_owned() + &voucher.loot_id.to_string() + ".json") // off-chain full JSON with image + all attrs
            .seller_fee_basis_points(0)
            .creators(vec![])
            .collection(Collection { verified: false, key: Pubkey::default() })
            .is_mutable(false)
            .primary_sale_happened(true)
            .invoke_signed(&[&[LOOT_MINT_AUTHORITY_SEEDS, &[ctx.bumps.loot_mint_authority]]])?;

        msg!("Loot claimed by {} at ({}, {})!", ctx.accounts.player.key(), voucher.latitude, voucher.longitude);

        Ok(())
    }
}

fn verify_ed25519_signature(
    instructions_sysvar: &UncheckedAccount,
    expected_pubkey: &[u8],
    message: &[u8],
    signature: &[u8; 64],
) -> Result<()> {
    let ixns = instructions_sysvar.to_account_info();
    let current_ix_index = load_current_index_checked(&ixns)? as usize;

    // The Ed25519 verify ix must be the previous one
    if current_ix_index == 0 {
        return err!(ErrorCode::NoEd25519Ix);
    }

    let ed25519_ix = load_instruction_at_checked(current_ix_index - 1, &ixns)?;

    // Check it's the Ed25519 program
    if ed25519_ix.program_id != solana_program::ed25519_program::id() {
        return err!(ErrorCode::InvalidEd25519Program);
    }

    // Parse data: num_sigs (1), padding, pubkey offset, sig offset, msg offset, msg len...
    let data = ed25519_ix.data;
    if data.len() < 16 || data[0] != 1 { // single signature
        return err!(ErrorCode::InvalidEd25519Data);
    }

    let pubkey_offset = u16::from_le_bytes([data[2], data[3]]) as usize;
    let sig_offset = u16::from_le_bytes([data[4], data[5]]) as usize;
    let msg_offset = u16::from_le_bytes([data[6], data[7]]) as usize;
    let msg_len = u16::from_le_bytes([data[8], data[9]]) as usize;

    if pubkey_offset + 32 > data.len() || sig_offset + 64 > data.len() || msg_offset + msg_len > data.len() {
        return err!(ErrorCode::InvalidEd25519Offsets);
    }

    if &data[pubkey_offset..pubkey_offset + 32] != expected_pubkey {
        return err!(ErrorCode::WrongPubkey);
    }

    if &data[sig_offset..sig_offset + 64] != signature {
        return err!(ErrorCode::WrongSignature);
    }

    if &data[msg_offset..msg_offset + msg_len] != message {
        return err!(ErrorCode::WrongMessage);
    }

    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LootVoucher {
    pub loot_id: u64,
    pub latitude: f64,
    pub longitude: f64,
    pub timestamp: i64,
    pub location_hint: String,
    pub server_signature: [u8; 64],
}

impl LootVoucher {
    pub fn serialize(&self) -> Vec<u8> {
        let mut data = Vec::new();
        self.serialize(&mut Serializer::new(&mut data)).unwrap();
        data
    }
}

#[derive(Accounts)]
pub struct ClaimLoot<'info> {
    #[account(mut)]
    pub player: Signer<'info>,

    #[account(mut, associated_token::mint = caps_mint, associated_token::authority = player)]
    pub player_caps_ata: Account<'info, TokenAccount>,

    #[account(init, payer = player, mint::decimals = 0, mint::authority = loot_mint_authority)]
    pub loot_mint: Account<'info, Mint>,

    #[account(init_if_needed, payer = player, associated_token::mint = loot_mint, associated_token::authority = player)]
    pub player_loot_ata: Account<'info, TokenAccount>,

    /// CHECK: PDA authority for all loot mints
    #[account(seeds = [LOOT_MINT_AUTHORITY_SEEDS], bump)]
    pub loot_mint_authority: UncheckedAccount<'info>,

    #[account(seeds = [CAPS_MINT_SEEDS], bump)]
    pub caps_mint: Account<'info, Mint>,

    /// CHECK: Server pubkey (hardcode or store in config PDA)
    pub server_key: AccountInfo<'info>,

    /// CHECK: Loot metadata PDA
    #[account(mut)]
    pub loot_metadata: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(address = solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    #[account(address = METADATA_PROGRAM_ID)]
    pub metadata_program: UncheckedAccount<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("No Ed25519 instruction found")]
    NoEd25519Ix,
    #[msg("Invalid Ed25519 program ID")]
    InvalidEd25519Program,
    #[msg("Invalid Ed25519 data format")]
    InvalidEd25519Data,
    #[msg("Invalid Ed25519 offsets")]
    InvalidEd25519Offsets,
    #[msg("Wrong pubkey in Ed25519 ix")]
    WrongPubkey,
    #[msg("Wrong signature in Ed25519 ix")]
    WrongSignature,
    #[msg("Wrong message in Ed25519 ix")]
    WrongMessage,
}