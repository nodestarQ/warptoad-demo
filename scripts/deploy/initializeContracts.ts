/**
 * Contract Initialization Script
 * 
 * After deploying all contracts, they need to be initialized and connected:
 * - L1AztecBridgeAdapter: Connect to Aztec bridge registry, L2 adapter, and GigaBridge
 * - L1WarpToad: Connect to GigaBridge and itself (special case - it's its own L1 adapter)
 * - AztecWarpToad: Connect to L2 adapter and L1 adapter
 * 
 * This establishes the communication channels between all components.
 */


import { 
    log, 
    logSection, 
    setVerbose,
    logSuccess,
    logError,
    logStep,
    logVerbose
} from "./utils/logger.ts";
import { EvmDeploymentResult } from "./deployEvm.ts";
import { AztecDeploymentResult } from "./aztec/deployAztec.ts";

/**
 * Initialize all contract connections
 * 
 * @param evmContracts - Deployed EVM contracts
 * @param aztecContracts - Deployed Aztec contracts
 * @param verbose - Enable verbose logging
 */
export async function initializeAllContracts(
    evmContracts: EvmDeploymentResult,
    aztecContracts: AztecDeploymentResult,
    verbose: boolean = false
): Promise<void> {
    setVerbose(verbose);
    
    try {
        logSection("🔗 Initializing Contract Connections");
        
        const { l1WarpToad, gigaBridge, l1AztecBridgeAdapter } = evmContracts;
        const { aztecWarpToad, l2AztecBridgeAdapter, deployerWallet, node } = aztecContracts;
        
        // Step 1: Initialize L1AztecBridgeAdapter
        logStep(1, 3, "Initializing L1AztecBridgeAdapter...");
        const nodeInfo = await node.getNodeInfo();
        const aztecNativeBridgeRegistry = nodeInfo.l1ContractAddresses.registryAddress.toString();
        
        logVerbose(`Aztec Registry: ${aztecNativeBridgeRegistry}`);
        logVerbose(`L2 Adapter: ${l2AztecBridgeAdapter.address.toString()}`);
        logVerbose(`GigaBridge: ${await gigaBridge.getAddress()}`);
        
        //@ts-ignore
        const initL1AdapterTx = await l1AztecBridgeAdapter.initialize(
            aztecNativeBridgeRegistry,
            l2AztecBridgeAdapter.address.toString(),
            await gigaBridge.getAddress()
        );
        await initL1AdapterTx.wait();
        log("✓ L1AztecBridgeAdapter initialized", 'success');
        
        // Step 2: Initialize L1WarpToad
        logStep(2, 3, "Initializing L1WarpToad...");
        logVerbose("L1WarpToad is special - it's its own L1 bridge adapter");
        
        //@ts-ignore
        const initL1WarpToadTx = await l1WarpToad.initialize(
            await gigaBridge.getAddress(),
            await l1WarpToad.getAddress() // L1WarpToad is its own adapter on L1
        );
        await initL1WarpToadTx.wait();
        log("✓ L1WarpToad initialized", 'success');
        
        // Step 3: Initialize AztecWarpToad
        logStep(3, 3, "Initializing AztecWarpToad...");
        logVerbose(`L2 Adapter: ${l2AztecBridgeAdapter.address.toString()}`);
        logVerbose(`L1 Adapter: ${await l1AztecBridgeAdapter.getAddress()}`);
        
        const initAztecWarpToadTx = await aztecWarpToad.methods
            .initialize(
                l2AztecBridgeAdapter.address,
                await l1AztecBridgeAdapter.getAddress()
            )
            .send({ from: deployerWallet.address })
            .wait();
        log("✓ AztecWarpToad initialized", 'success');
        
        logSuccess("All contracts initialized and connected!");
        
    } catch (error) {
        logError(error, "Initialization failed");
        throw error;
    }
}
