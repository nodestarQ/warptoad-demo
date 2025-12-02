/**
 * EVM Contract Deployment Script
 * 
 * Deploys all EVM contracts on L1 using Hardhat Ignition:
 * - Libraries (PoseidonT3, LazyIMT)
 * - L1 WarpToad contracts (Token, Verifier, L1WarpToad)
 * - Infrastructure (GigaBridge, L1AztecBridgeAdapter)
 * 
 * Uses Hardhat Ignition for deterministic deployments and easy management.
 * 
 * Usage:
 *   npx hardhat run scripts/deploy/deployEvm.ts
 *   npx hardhat run scripts/deploy/deployEvm.ts --network aztecSandbox
 */

//@ts-ignore
import hre from "hardhat";
import L1LibrariesModule from "../../ignition/modules/L1Libraries";
import L1WarpToadModule from "../../ignition/modules/L1WarpToadModule";
import L1InfraModule from "../../ignition/modules/L1InfraModule";
import { 
    log, 
    logSection, 
    logDeployment, 
    setVerbose, 
    parseVerboseFlag,
    logSuccess,
    logError,
    logStep
} from "./utils/logger.ts";

/**
 * EVM deployment result
 */
export interface EvmDeploymentResult {
    nativeToken: any;
    withdrawVerifier: any;
    l1WarpToad: any;
    gigaBridge: any;
    l1AztecBridgeAdapter: any;
    poseidonT3: any;
    lazyIMT: any;
    chainId: bigint;
}

/**
 * Deploy all EVM contracts using Hardhat Ignition
 * 
 * @param verbose - Enable verbose logging
 * @returns Deployed contracts
 */
export async function deployEvmContracts(verbose: boolean = false): Promise<EvmDeploymentResult> {
    setVerbose(verbose);
    
    try {
        logSection("🚀 Deploying EVM Contracts (L1)");
        
        //@ts-ignore
        const network = await hre.ethers.provider.getNetwork();
        const chainId = network.chainId;
        log(`Deploying on chain ID: ${chainId}`, 'info');
        
        // Step 1: Deploy Libraries
        logStep(1, 3, "Deploying cryptographic libraries...");
        //@ts-ignore
        const { poseidonT3, lazyIMT } = await hre.ignition.deploy(L1LibrariesModule);
        logDeployment("PoseidonT3", await poseidonT3.getAddress());
        logDeployment("LazyIMT", await lazyIMT.getAddress());
        
        // Step 2: Deploy L1 WarpToad contracts
        logStep(2, 3, "Deploying L1 WarpToad contracts...");
        //@ts-ignore
        const { nativeToken, withdrawVerifier, l1WarpToad } = await hre.ignition.deploy(L1WarpToadModule);
        logDeployment("Native Token (USDcoin)", await nativeToken.getAddress());
        logDeployment("WithdrawVerifier", await withdrawVerifier.getAddress());
        logDeployment("L1WarpToad", await l1WarpToad.getAddress());
        
        // Step 3: Deploy Infrastructure
        logStep(3, 3, "Deploying infrastructure contracts...");
        //@ts-ignore
        const { gigaBridge, l1AztecBridgeAdapter } = await hre.ignition.deploy(L1InfraModule);
        logDeployment("GigaBridge", await gigaBridge.getAddress());
        logDeployment("L1AztecBridgeAdapter", await l1AztecBridgeAdapter.getAddress());
        
        logSuccess("EVM contracts deployed successfully!");
        
        log("📁 Deployment artifacts saved to: ignition/deployments/chain-" + chainId);
        
        return {
            nativeToken,
            withdrawVerifier,
            l1WarpToad,
            gigaBridge,
            l1AztecBridgeAdapter,
            poseidonT3,
            lazyIMT,
            chainId
        };
        
    } catch (error) {
        logError(error, "EVM deployment failed");
        throw error;
    }
}

/**
 * CLI interface - run this file directly with Hardhat
 */
async function main() {
    const verbose = parseVerboseFlag();
    await deployEvmContracts(verbose);
}

// Run main if executed directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
