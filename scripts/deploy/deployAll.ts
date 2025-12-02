/**
 * Complete WarpToad Deployment Script
 * 
 * Deploys and initializes all contracts for local testing:
 * 1. EVM contracts on L1 (using Hardhat Ignition)
 * 2. Aztec contracts on L2
 * 3. Initialize all connections between contracts
 * 
 * Prerequisites:
 * - Aztec Sandbox running on localhost:8080
 * - Contracts compiled (run: pnpm run aztec:build)
 * 
 * Usage:
 *   tsx scripts/deploy/deployAll.ts
 *   tsx scripts/deploy/deployAll.ts --verbose
 */

import { deployEvmContracts } from "./deployEvm.ts";
import { deployAztecContracts } from "./aztec/deployAztec.ts";
import { initializeAllContracts } from "./initializeContracts.ts";
import { 
    log, 
    logSection, 
    setVerbose, 
    parseVerboseFlag,
    logError,
    logBox,
    logDeployment
} from "./utils/logger.ts";

/**
 * Complete deployment result
 */
export interface CompleteDeploymentResult {
    evmContracts: any;
    aztecContracts: any;
}

/**
 * Deploy all contracts and initialize connections
 * 
 * @param verbose - Enable verbose logging
 * @returns All deployed contracts
 */
export async function deployAll(verbose: boolean = false): Promise<CompleteDeploymentResult> {
    setVerbose(verbose);
    
    const startTime = Date.now();
    
    try {
        logBox(
            "🌟 WarpToad Full Deployment\n" +
            "Deploying L1 (EVM) + L2 (Aztec) contracts\n" +
            "and initializing all connections", 
            'info'
        );
        
        // Step 1: Deploy EVM contracts
        log("\n📍 Step 1/4: Deploying EVM contracts on L1...\n");
        const evmContracts = await deployEvmContracts(verbose);
        
        // Step 2: Deploy Aztec contracts
        log("\n📍 Step 2/4: Deploying Aztec contracts on L2...\n");
        const aztecContracts = await deployAztecContracts(
            await evmContracts.l1AztecBridgeAdapter.getAddress(),
            await evmContracts.nativeToken.getAddress(),
            verbose
        );
        
        // Step 3: Initialize connections
        log("\n📍 Step 3/4: Initializing contract connections...\n");
        await initializeAllContracts(evmContracts, aztecContracts, verbose);
        
        // Step 4: Print deployment summary
        log("\n📍 Step 4/4: Generating deployment summary...\n");
        await printDeploymentSummary(evmContracts, aztecContracts);
        
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        
        logBox(
            `✅ Deployment Complete!\n` +
            `   Total time: ${duration}s\n` +
            `   All contracts deployed and initialized`, 
            'success'
        );
        
        return { evmContracts, aztecContracts };
        
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logError(error, `Deployment failed after ${duration}s`);
        throw error;
    }
}

/**
 * Print comprehensive deployment summary
 */
async function printDeploymentSummary(evm: any, aztec: any): Promise<void> {
    logSection("📋 Deployment Summary");
    
    console.log("🔷 EVM Contracts (L1):");
    console.log("─".repeat(60));
    logDeployment("Native Token (USDcoin)", await evm.nativeToken.getAddress());
    logDeployment("Withdraw Verifier", await evm.withdrawVerifier.getAddress());
    logDeployment("L1 WarpToad", await evm.l1WarpToad.getAddress());
    logDeployment("GigaBridge", await evm.gigaBridge.getAddress());
    logDeployment("L1 Aztec Adapter", await evm.l1AztecBridgeAdapter.getAddress());
    logDeployment("PoseidonT3 Library", await evm.poseidonT3.getAddress());
    logDeployment("LazyIMT Library", await evm.lazyIMT.getAddress());
    
    console.log("\n🔶 Aztec Contracts (L2):");
    console.log("─".repeat(60));
    logDeployment("Aztec WarpToad", aztec.aztecWarpToad.address.toString());
    logDeployment("L2 Aztec Adapter", aztec.l2AztecBridgeAdapter.address.toString());
    logDeployment("Deployer Wallet", aztec.deployerWallet.address.toString());
    
    console.log("\n📁 Deployment Artifacts:");
    console.log("─".repeat(60));
    console.log(`  EVM:   ignition/deployments/chain-${evm.chainId}/`);
    console.log(`  Aztec: scripts/deploy/aztec/aztecDeployments/${aztec.chainId}/`);
    console.log(`  Keys:  scripts/deploy/aztec/deployer-keys.json`);
    console.log("");
}

/**
 * CLI interface
 */
async function main() {
    const verbose = parseVerboseFlag();
    
    console.log("\n");
    log("Starting WarpToad deployment...", 'info');
    log("Make sure Aztec Sandbox is running: aztec sandbox", 'info');
    console.log("\n");
    
    await deployAll(verbose);
}

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error("\n❌ Fatal error:", error);
        process.exit(1);
    });
}
