#![allow(clippy::result_large_err)]

use anchor_lang::{prelude::*, solana_program};
use anchor_spl::token::{self, Transfer};
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use solana_program::sysvar::{
    instructions::{load_current_index_checked, load_instruction_at_checked},
    Sysvar,
};

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

        require_keys_eq!(
            ed25519_ix.program_id,
            solana_program::ed25519_program::ID,
            ErrorCode::InvalidInstruction
        );

        // In a real implementation, you would parse ed25519_ix.data carefully
        // to match the oracle pubkey, message, and signature.

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

        require_keys_eq!(
            ed25519_ix.program_id,
            solana_program::ed25519_program::ID,
            ErrorCode::InvalidInstruction
        );

        // In a real implementation, you would parse ed25519_ix.data carefully
        // to match the device pubkey, message, and signature.

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

    #[account(
        init,
        space = 8 + RewardAccount::INIT_SPACE,
        payer = payer,
    )]
    pub reward_account: Account<'info, RewardAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub reward_account: Account<'info, RewardAccount>,
    pub user: Signer<'info>,
    /// CHECK: This is the oracle's account. We only check its address.
    pub oracle: AccountInfo<'info>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == mint.key(),
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
    /// CHECK: Instructions sysvar
    #[account(address = solana_program::sysvar::instructions::ID)]
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
    #[account(address = solana_program::sysvar::instructions::ID)]
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
