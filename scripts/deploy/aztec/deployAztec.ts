/**
 * Aztec Contract Deployment Script
 * 
 * Deploys all Aztec L2 contracts:
 * - WarpToadCore (main bridge contract on Aztec)
 * - L2AztecBridgeAdapter (communicates with L1AztecBridgeAdapter)
 * 
 * Usage:
 *   pnpm tsx scripts/deploy/aztec/deployAztec.ts
 *   pnpm tsx scripts/deploy/aztec/deployAztec.ts --verbose
 */

//@ts-ignore
import { Contract } from "@aztec/aztec.js";
import { AccountManager } from "@aztec/aztec.js/wallet";
import { AztecNode } from "@aztec/aztec.js/node";
import { PXE } from "@aztec/pxe/server";

// Aztec contract artifacts
import { 
    WarpToadCoreContract,
    WarpToadCoreContractArtifact 
} from "../../../contracts/aztec/WarpToadCore/src/artifacts/WarpToadCore";
import { 
    L2AztecBridgeAdapterContract,
    L2AztecBridgeAdapterContractArtifact 
} from "../../../contracts/aztec/L2AztecBridgeAdapter/src/artifacts/L2AztecBridgeAdapter";

// Utilities
import { 
    getOrCreateDeployerWallet, 
    connectToAztecSandbox
} from "../utils/aztecUtils";
import { saveDeploymentAddresses } from "../utils/evmUtils";
import { 
    log, 
    logSection, 
    logDeployment, 
    setVerbose, 
    parseVerboseFlag,
    logSuccess,
    logError,
    logStep
} from "../utils/logger.ts";

/**
 * Aztec deployment result
 */
export interface AztecDeploymentResult {
    aztecWarpToad: WarpToadCoreContract;
    l2AztecBridgeAdapter: L2AztecBridgeAdapterContract;
    deployerWallet: AccountManager;
    pxe: PXE;
    node: AztecNode;
    chainId: number;
}

/**
 * Deploy all Aztec contracts
 * 
 * @param l1AztecBridgeAdapterAddress - Address of L1AztecBridgeAdapter (must be deployed first)
 * @param nativeTokenAddress - Address of native token on L1
 * @param verbose - Enable verbose logging
 * @returns Deployed contracts and infrastructure
 */
export async function deployAztecContracts(
    l1AztecBridgeAdapterAddress: string,
    nativeTokenAddress: string,
    verbose: boolean = false
): Promise<AztecDeploymentResult> {
    setVerbose(verbose);
    
    try {
        logSection("🚀 Deploying Aztec Contracts");
        
        // Step 1: Connect to Aztec Sandbox
        logStep(1, 4, "Connecting to Aztec Sandbox...");
        const { node, pxe } = await connectToAztecSandbox();
        const nodeInfo = await node.getNodeInfo();
        const chainId = nodeInfo.l1ChainId;
        log(`Connected! L1 Chain ID: ${chainId}`, 'success');
        
        // Step 2: Get or create deployer wallet
        logStep(2, 4, "Setting up deployer wallet...");
        const deployerWallet = await getOrCreateDeployerWallet("./scripts/deploy/aztec/deployer-keys.json");
        logDeployment("Deployer Wallet", deployerWallet.address.toString());
        
        // Step 3: Deploy WarpToadCore
        logStep(3, 4, "Deploying WarpToadCore...");
        const wrappedTokenName = "wrpToad-USD Coin";
        const wrappedTokenSymbol = "wrpToad-USDC";
        const decimals = 6n; // USDC-style 6 decimals
        
        const aztecWarpToad = await Contract.deploy(
            deployerWallet,
            WarpToadCoreContractArtifact,
            [nativeTokenAddress, wrappedTokenName, wrappedTokenSymbol, decimals]
        ).send().deployed() as WarpToadCoreContract;
        
        logDeployment("AztecWarpToad", aztecWarpToad.address.toString());
        
        // Step 4: Deploy L2AztecBridgeAdapter
        logStep(4, 4, "Deploying L2AztecBridgeAdapter...");
        const l2AztecBridgeAdapter = await Contract.deploy(
            deployerWallet,
            L2AztecBridgeAdapterContractArtifact,
            [l1AztecBridgeAdapterAddress]
        ).send().deployed() as L2AztecBridgeAdapterContract;
        
        logDeployment("L2AztecBridgeAdapter", l2AztecBridgeAdapter.address.toString());
        
        // Step 5: Save deployment addresses
        log("Saving deployment addresses...");
        saveDeploymentAddresses(chainId, {
            "AztecWarpToad": aztecWarpToad.address.toString(),
            "L2AztecBridgeAdapter": l2AztecBridgeAdapter.address.toString(),
            "DeployerWallet": deployerWallet.address.toString()
        }, 'aztec');
        
        logSuccess("Aztec contracts deployed successfully!");
        
        return {
            aztecWarpToad,
            l2AztecBridgeAdapter,
            deployerWallet,
            pxe,
            node,
            chainId
        };
        
    } catch (error) {
        logError(error, "Aztec deployment failed");
        throw error;
    }
}

/**
 * CLI interface - run this file directly
 */
async function main() {
    const verbose = parseVerboseFlag();
    
    // For standalone execution, you need to provide addresses
    // In practice, this will be called from deployAll.ts with proper addresses
    const l1AztecBridgeAdapterAddress = process.env.L1_AZTEC_ADAPTER_ADDRESS || "0x0000000000000000000000000000000000000000";
    const nativeTokenAddress = process.env.NATIVE_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000";
    
    if (l1AztecBridgeAdapterAddress === "0x0000000000000000000000000000000000000000") {
        console.warn("⚠️  Warning: L1_AZTEC_ADAPTER_ADDRESS not set, using zero address");
        console.warn("   Set environment variables or use deployAll.ts for full deployment");
    }
    
    await deployAztecContracts(l1AztecBridgeAdapterAddress, nativeTokenAddress, verbose);
}

// Run main if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error("Deployment failed:", error);
        process.exit(1);
    });
}
