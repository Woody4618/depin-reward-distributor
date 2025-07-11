#![allow(clippy::result_large_err)]

use anchor_lang::solana_program::sysvar::{
    instructions::{load_current_index_checked, load_instruction_at_checked},
    Sysvar,
};
use anchor_lang::{
    prelude::*,
    solana_program::{ed25519_program::ID as ED25519_ID, instruction::Instruction},
};
use anchor_spl::token::{self, Transfer};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use std::str;
use std::str::FromStr;

declare_id!("DGorXzr4L3QetxW6AbD715pt7e5ihU3RXo8Re5D7zNmu");

#[program]
pub mod reward_distributor {
    use super::*;

    pub fn initialize_reward_account(
        ctx: Context<InitializeRewardAccount>,
        device_pubkey: Pubkey,
    ) -> Result<()> {
        ctx.accounts.reward_account.device_pubkey = device_pubkey;
        ctx.accounts.reward_account.withdraw_authority = ctx.accounts.payer.key();
        ctx.accounts.reward_account.total_claimed = 0;
        Ok(())
    }

    pub fn claim_rewards(
        ctx: Context<ClaimRewards>,
        lifetime_rewards: u64,
        _timestamp: u64,
    ) -> Result<()> {
        let ixs = &ctx.accounts.instructions;
        let current_ix_index = load_current_index_checked(ixs)? as usize;
        require_gt!(current_ix_index, 0, ErrorCode::InvalidInstruction);
        let ed25519_ix_index = current_ix_index - 1;
        let ed25519_ix = load_instruction_at_checked(ed25519_ix_index, ixs)?;

        // Use the robust helper for Ed25519 verification
        let expected_oracle_pubkey =
            Pubkey::from_str("oraXrapkbpe6pCVJ2sm3MRZAdyemtWXyGg4W6mGarjL").unwrap();
        let message = verify_ed25519_ix(&ed25519_ix, expected_oracle_pubkey.as_ref())?;
        msg!("Ed25519 message extracted: {:?}", &message);

        let reward_account = &mut ctx.accounts.reward_account;
        let rewards_to_claim = lifetime_rewards
            .checked_sub(reward_account.total_claimed)
            .ok_or(ErrorCode::InvalidRewardAmount)?;

        if rewards_to_claim == 0 {
            return Err(error!(ErrorCode::NoRewardsToClaim));
        }

        let seeds = &[&b"treasury"[..], &[ctx.bumps.treasury_authority]];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.treasury_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.treasury_authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_context, rewards_to_claim)?;

        reward_account.total_claimed = reward_account
            .total_claimed
            .checked_add(rewards_to_claim)
            .ok_or(ErrorCode::RewardOverflow)?;

        Ok(())
    }

    pub fn change_authority(ctx: Context<ChangeAuthority>, new_authority: Pubkey) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.current_authority.key(),
            ctx.accounts.reward_account.withdraw_authority,
            ErrorCode::Unauthorized
        );
        ctx.accounts.reward_account.withdraw_authority = new_authority;
        Ok(())
    }

    pub fn change_authority_with_device_sig(
        ctx: Context<ChangeAuthorityWithDeviceSig>,
    ) -> Result<()> {
        let ixs = &ctx.accounts.instructions;
        let current_ix_index = load_current_index_checked(ixs)? as usize;
        require_gt!(current_ix_index, 0, ErrorCode::InvalidInstruction);
        let ed25519_ix_index = current_ix_index - 1;
        let ed25519_ix = load_instruction_at_checked(ed25519_ix_index, ixs)?;

        // Use the device_pubkey from the reward_account as the expected signer
        let expected_device_pubkey = ctx.accounts.reward_account.device_pubkey;
        let message = verify_ed25519_ix(&ed25519_ix, expected_device_pubkey.as_ref())?;
        msg!("Device Ed25519 message extracted: {:?}", &message);

        // Check that the message matches the expected format
        // For example, if your message is: "I want to claim: <new_authority_pubkey>"
        let expected_msg = format!("I want to claim: {}", ctx.accounts.new_authority.key());
        require!(
            message == expected_msg.as_bytes(),
            ErrorCode::InvalidSignature
        );

        let reward_account = &mut ctx.accounts.reward_account;
        let new_authority = &ctx.accounts.new_authority;
        reward_account.withdraw_authority = new_authority.key();
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct RewardAccount {
    pub device_pubkey: Pubkey,
    pub withdraw_authority: Pubkey,
    pub total_claimed: u64,
}

#[derive(Accounts)]
pub struct InitializeRewardAccount<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The device pubkey must be passed as an instruction argument and as a struct field for Anchor PDA constraints
    #[account(
        init,
        seeds = [b"reward", device_pubkey.key().as_ref()],
        bump,
        space = 8 + RewardAccount::INIT_SPACE,
        payer = payer,
    )]
    pub reward_account: Account<'info, RewardAccount>,
    /// CHECK: device_pubkey is only used for PDA derivation and is not accessed as an account
    pub device_pubkey: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub reward_account: Account<'info, RewardAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    /// CHECK: This is the oracle's account. We only check its address.
    pub oracle: AccountInfo<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
        associated_token::token_program = token_program,
    )]
    pub user_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = treasury_token_account.mint == mint.key(),
    )]
    pub treasury_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: This is the PDA that owns the treasury
    #[account(
        seeds = [b"treasury"],
        bump,
    )]
    pub treasury_authority: AccountInfo<'info>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,
    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ChangeAuthority<'info> {
    #[account(mut)]
    pub reward_account: Account<'info, RewardAccount>,
    pub current_authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ChangeAuthorityWithDeviceSig<'info> {
    #[account(mut)]
    pub reward_account: Account<'info, RewardAccount>,
    pub new_authority: Signer<'info>,
    /// CHECK: Instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions: UncheckedAccount<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid signature")]
    InvalidSignature,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid reward amount")]
    InvalidRewardAmount,
    #[msg("No rewards to claim")]
    NoRewardsToClaim,
    #[msg("Reward overflow")]
    RewardOverflow,
    #[msg("Invalid instruction")]
    InvalidInstruction,
}

/// Verify Ed25519Program instruction and get the data from it
fn verify_ed25519_ix(ix: &Instruction, pubkey: &[u8]) -> Result<Vec<u8>> {
    msg!("verify_ed25519_ix: program_id = {}", ix.program_id);
    if ix.program_id != ED25519_ID {
        msg!("program_id mismatch");
        return Err(error!(ErrorCode::InvalidInstruction));
    }
    check_ed25519_data(&ix.data, pubkey)
}

/// Verify serialized Ed25519Program instruction data
fn check_ed25519_data(data: &[u8], pubkey: &[u8]) -> Result<Vec<u8>> {
    // According to this layout used by the Ed25519Program
    // https://github.com/solana-labs/solana-web3.js/blob/master/src/ed25519-program.ts#L33

    let num_signatures = &[data[0]]; // Byte  0
    let padding = &[data[1]]; // Byte  1
    let signature_offset = &data[2..=3]; // Bytes 2,3
    let signature_instruction_index = &data[4..=5]; // Bytes 4,5
    let public_key_offset = &data[6..=7]; // Bytes 6,7
    let public_key_instruction_index = &data[8..=9]; // Bytes 8,9
    let message_data_offset = u16::from_le_bytes(data[10..=11].try_into().unwrap()) as usize;
    let message_data_size = u16::from_le_bytes(data[12..=13].try_into().unwrap()) as usize;
    let message_instruction_index = &data[14..=15]; // Bytes 14,15

    let data_pubkey = &data[16..16 + 32]; // Bytes 16..16+32
    let data_msg = &data[message_data_offset..(message_data_offset + message_data_size)];

    let exp_public_key_offset: u16 = 16; // 2*u8 + 7*u16
    let exp_signature_offset: u16 = exp_public_key_offset + pubkey.len() as u16;
    let exp_num_signatures: u8 = 1;

    msg!("num_signatures: {:?}", num_signatures);
    msg!("padding: {:?}", padding);
    msg!("signature_offset: {:?}", signature_offset);
    msg!(
        "signature_instruction_index: {:?}",
        signature_instruction_index
    );
    msg!("public_key_offset: {:?}", public_key_offset);
    msg!(
        "public_key_instruction_index: {:?}",
        public_key_instruction_index
    );
    msg!("message_data_offset: {}", message_data_offset);
    msg!("message_data_size: {}", message_data_size);
    msg!("message_instruction_index: {:?}", message_instruction_index);
    msg!("data_pubkey: {:?}", data_pubkey);
    msg!("expected_pubkey: {:?}", pubkey);
    msg!("data.len(): {}", data.len());

    // Header
    if num_signatures != &[exp_num_signatures]
        || padding != &[0u8]
        || signature_offset != exp_signature_offset.to_le_bytes()
        || signature_instruction_index != u16::MAX.to_le_bytes()
        || public_key_offset != exp_public_key_offset.to_le_bytes()
        || public_key_instruction_index != u16::MAX.to_le_bytes()
        || message_instruction_index != u16::MAX.to_le_bytes()
    {
        msg!("Header check failed");
        return Err(error!(ErrorCode::InvalidInstruction));
    }

    // Arguments
    if data_pubkey != pubkey {
        msg!("Pubkey check failed");
        return Err(error!(ErrorCode::InvalidInstruction));
    }

    Ok(data_msg.to_vec())
}
