/**
 * Test Fixtures for WarpToad
 * 
 * Provides reusable deployment fixtures for Hardhat tests.
 * Uses Hardhat's loadFixture for efficient test isolation via snapshots.
 * 
 * Benefits:
 * - Deploy once, revert to snapshot for each test
 * - Massive speed improvement (5+ min → <2 min)
 * - No code duplication
 * - Type-safe contract instances
 */

//@ts-ignore
import hre from "hardhat";
//@ts-ignore
import { Wallet as AztecWallet, PXE } from "@aztec/aztec.js";
//@ts-ignore
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { deployAll } from "../../scripts/deploy/deployAll";

/**
 * Base deployment fixture
 * 
 * Deploys all contracts (EVM + Aztec) and initializes connections.
 * This is the foundation for all other fixtures.
 * 
 * @returns All deployed contracts and wallets
 */
export async function deploymentFixture() {
    console.log("\n🏗️  Setting up deployment fixture...\n");
    
    // Deploy all contracts using our deployment scripts
    const { evmContracts, aztecContracts } = await deployAll(false);
    
    // Get EVM wallets from Hardhat
    //@ts-ignore
    const evmWallets = await hre.ethers.getSigners();
    
    // Get Aztec wallets from PXE
    const aztecWallets = await getInitialTestAccountsWallets(aztecContracts.pxe);
    
    console.log("✅ Deployment fixture ready!\n");
    
    return {
        // EVM Contracts
        nativeToken: evmContracts.nativeToken,
        withdrawVerifier: evmContracts.withdrawVerifier,
        L1WarpToad: evmContracts.l1WarpToad,
        gigaBridge: evmContracts.gigaBridge,
        L1AztecBridgeAdapter: evmContracts.l1AztecBridgeAdapter,
        LazyIMTLib: evmContracts.lazyIMT,
        PoseidonT3Lib: evmContracts.poseidonT3,
        
        // Aztec Contracts
        AztecWarpToad: aztecContracts.aztecWarpToad,
        L2AztecBridgeAdapter: aztecContracts.l2AztecBridgeAdapter,
        
        // Infrastructure
        PXE: aztecContracts.pxe,
        
        // Wallets
        evmWallets,
        aztecWallets
    };
}

/**
 * Specialized fixture for Aztec → L1 tests
 * 
 * Extends base deployment with:
 * - Pre-minted tokens on Aztec side for testing
 * 
 * @returns Base deployment + initial balance
 */
export async function aztecToL1Fixture() {
    const base = await deploymentFixture();
    
    // Setup: Mint tokens for Aztec sender
    const aztecSender = base.aztecWallets[1];
    const initialBalance = 10n * 10n ** 18n;
    
    const AztecWarpToadWithSender = base.AztecWarpToad.withWallet(aztecSender);
    
    await AztecWarpToadWithSender.methods
        .mint_for_testing(initialBalance, aztecSender.getAddress())
        .send()
        .wait();
    
    console.log("💰 Minted initial balance on Aztec for sender");
    
    return {
        ...base,
        initialBalance,
        AztecWarpToadWithSender
    };
}

/**
 * Specialized fixture for L1 → Aztec tests
 * 
 * Extends base deployment with:
 * - Native tokens obtained and wrapped on L1
 * - Tokens ready to burn and bridge to Aztec
 * 
 * @returns Base deployment + initial balance and wrapped tokens
 */
export async function l1ToAztecFixture() {
    const base = await deploymentFixture();
    
    // Setup: Get native tokens and wrap them on L1
    const evmSender = base.evmWallets[2];
    const initialBalance = 10n * 10n ** 18n;
    
    const nativeTokenWithSender = base.nativeToken.connect(evmSender);
    const L1WarpToadWithSender = base.L1WarpToad.connect(evmSender);
    
    // Get free tokens from faucet
    await (await nativeTokenWithSender.getFreeShit(initialBalance)).wait(1);
    
    // Approve L1WarpToad to spend tokens
    await (await nativeTokenWithSender.approve(
        await base.L1WarpToad.getAddress(), 
        initialBalance
    )).wait(1);
    
    // Wrap native tokens
    await (await L1WarpToadWithSender.wrap(initialBalance)).wait(1);
    
    console.log("💰 Wrapped initial balance on L1 for sender");
    
    return {
        ...base,
        initialBalance,
        nativeTokenWithSender,
        L1WarpToadWithSender
    };
}

/**
 * Specialized fixture for L1 → L1 tests
 * 
 * Same as l1ToAztecFixture but used for L1-only scenarios.
 * Tests burning and minting on the same chain.
 * 
 * @returns Base deployment + wrapped tokens
 */
export async function l1ToL1Fixture() {
    // L1 → L1 tests use the same setup as L1 → Aztec
    return await l1ToAztecFixture();
}
