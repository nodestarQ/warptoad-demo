/**
 * Aztec Deployment Utilities
 * 
 * Consolidates all Aztec-specific deployment functions:
 * - PXE and Node client initialization
 * - Wallet creation and management
 * - Account key storage/loading
 * - Test account helpers
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Fq, Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import { AztecNode, createAztecNodeClient } from "@aztec/aztec.js/node";
import { createPXE, getPXEConfig, PXE } from "@aztec/pxe/server";
import { Wallet, AccountManager } from '@aztec/aztec.js/wallet';
import { createStore } from "@aztec/kv-store/lmdb";
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { getContractInstanceFromInstantiationParams, ContractInstanceWithAddress } from '@aztec/aztec.js/contracts';
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
//@ts-ignore
import { SPONSORED_FPC_SALT } from '@aztec/constants';
//@ts-ignore
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';

const DEFAULT_PXE_URL = "http://localhost:8080";

/**
 * Account keys structure for Aztec wallet
 */
export type AccountKeys = {
    secretKey: Fr;
    salt: Fr;
    signingPrivateKey: Fq;
};

/**
 * Initialize Aztec Node Client
 * @param nodeUrl - URL of the Aztec node (defaults to localhost:8080)
 * @returns Connected AztecNode instance
 */
export async function initNodeClient(nodeUrl?: string): Promise<AztecNode> {
    try {
        const url = nodeUrl || process.env.AZTEC_NODE_URL || DEFAULT_PXE_URL;
        console.log("Creating Aztec Node Client...");
        const node = createAztecNodeClient(url);
        const nodeInfo = await node.getNodeInfo();
        console.log("Connected to sandbox version:", nodeInfo.nodeVersion);
        console.log("Chain ID:", nodeInfo.l1ChainId);
        return node;
    } catch (error) {
        console.error("Failed to create Aztec Node Client:", error);
        throw new Error(
            "❌ Cannot connect to Aztec Sandbox.\n" +
            "   Make sure it's running: aztec sandbox\n" +
            `   Expected URL: ${nodeUrl || DEFAULT_PXE_URL}`
        );
    }
}

/**
 * Initialize PXE (Private eXecution Environment)
 * @param node - Connected Aztec node instance
 * @returns PXE instance
 */
export async function initPXE(node: AztecNode): Promise<PXE> {
    try {
        const l1Contracts = await node.getL1ContractAddresses();
        console.log("Creating PXE client");
        const config = getPXEConfig();
        const fullConfig = { ...config, l1Contracts };
        fullConfig.proverEnabled = false; // Set to true for testnet

        const store = await createStore("pxe", {
            dataDirectory: "store",
            dataStoreMapSizeKb: 1e6,
        });
        const pxe = await createPXE(node, fullConfig, { store });
        return pxe;
    } catch (error) {
        console.error("Failed to create Aztec PXE:", error);
        throw error;
    }
}

/**
 * Connect to Aztec Sandbox (convenience function)
 * Combines node client and PXE initialization
 * @param url - Optional sandbox URL
 * @returns Object containing node and pxe instances
 */
export async function connectToAztecSandbox(url?: string): Promise<{ node: AztecNode; pxe: PXE }> {
    const node = await initNodeClient(url);
    const pxe = await initPXE(node);
    return { node, pxe };
}

/**
 * Create new random account keys for Aztec wallet
 * @returns New AccountKeys object
 */
export function createNewAccountKeys(): AccountKeys {
    const accountKeys: AccountKeys = {
        secretKey: Fr.random(),
        salt: new Fr(0),
        signingPrivateKey: GrumpkinScalar.random()
    };
    return accountKeys;
}

/**
 * Store deployer account keys to file (JSON format)
 * @param keys - AccountKeys to store
 * @param fileName - Filename (relative to current directory)
 */
export function storeDeployerAccountKeys(keys: AccountKeys, fileName: string): void {
    const serializable = {
        secretKey: keys.secretKey.toString(),
        salt: keys.salt.toString(),
        signingPrivateKey: keys.signingPrivateKey.toString()
    };

    const filePath = join(process.cwd(), fileName);
    writeFileSync(filePath, JSON.stringify(serializable, null, 2), "utf-8");
    console.log("Deployer keys stored at", filePath);
}

/**
 * Load deployer account keys from file
 * @param fileName - Filename (relative to current directory)
 * @returns Loaded AccountKeys
 */
export function loadDeployerAccountKeys(fileName: string): AccountKeys {
    const filePath = join(process.cwd(), fileName);
    const data = JSON.parse(readFileSync(filePath, "utf-8"));

    return {
        secretKey: Fr.fromString(data.secretKey),
        salt: Fr.fromString(data.salt),
        signingPrivateKey: Fq.fromString(data.signingPrivateKey),
    };
}

/**
 * Validate if account keys file exists and is valid
 * @param fileName - Filename to validate
 * @returns true if valid, false otherwise
 */
export function isValidAccountKeys(fileName: string): boolean {
    const filePath = join(process.cwd(), fileName);
    if (!existsSync(filePath)) return false;
    
    try {
        const data = JSON.parse(readFileSync(filePath, "utf-8"));

        // Check if it has all required fields
        if (
            typeof data.secretKey !== "string" ||
            typeof data.salt !== "string" ||
            typeof data.signingPrivateKey !== "string"
        ) {
            return false;
        }

        // Check if convertible into Fr/Fq
        try {
            const sk = Fr.fromString(data.secretKey);
            const salt = Fr.fromString(data.salt);
            const sig = Fq.fromString(data.signingPrivateKey);
            if (!(sk instanceof Fr)) return false;
            if (!(salt instanceof Fr)) return false;
            if (!(sig instanceof Fq)) return false;

            return true;
        } catch {
            return false;
        }
    } catch {
        return false;
    }
}

/**
 * Get or create deployer wallet
 * If keys file exists and is valid, loads existing wallet
 * Otherwise creates new wallet and stores keys
 * 
 * @param keysPath - Path to keys file (e.g., "./deployer-keys.json")
 * @returns Promise<AccountManager> - Deployed account manager (use .getWallet() to get Wallet)
 */
export async function getOrCreateDeployerWallet(keysPath: string): Promise<AccountManager> {
    const node = await initNodeClient();
    
    let accountKeys: AccountKeys;
    
    if (isValidAccountKeys(keysPath)) {
        console.log("Loading existing deployer keys from", keysPath);
        accountKeys = loadDeployerAccountKeys(keysPath);
    } else {
        console.log("Creating new deployer account keys...");
        accountKeys = createNewAccountKeys();
        storeDeployerAccountKeys(accountKeys, keysPath);
    }
    
    // Import TestWallet for deployment
    const { TestWallet } = await import('@aztec/test-wallet/server');
    const testWallet = await TestWallet.create(node);
    
    const wallet = await testWallet.createSchnorrAccount(
        accountKeys.secretKey,
        accountKeys.salt
    );

    const sponsoredFPCInstance = await getSponsoredFPCInstance();
    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(
        sponsoredFPCInstance.address
    );

    console.log("Deploying wallet account...");
    const deployMethod = await wallet.getDeployMethod();
    
    try {
        await deployMethod
            .send({
                from: AztecAddress.ZERO,
                fee: { paymentMethod: sponsoredPaymentMethod },
            })
            .wait();
        console.log("✅ Wallet deployed successfully!");
    } catch (error: any) {
        // Check if already deployed
        if (error.message && error.message.includes("Existing nullifier")) {
            console.log("ℹ️  Wallet already deployed, skipping...");
        } else {
            throw error;
        }
    }

    return wallet;
}

/**
 * Get Sponsored FPC (Fee Payment Contract) instance
 * Used for testnet deployments where FPC sponsors transaction fees
 * @returns ContractInstanceWithAddress
 */
export async function getSponsoredFPCInstance(): Promise<ContractInstanceWithAddress> {
    return await getContractInstanceFromInstantiationParams(
        SponsoredFPCContract.artifact,
        {
            salt: new Fr(SPONSORED_FPC_SALT),
        }
    );
}

/**
 * Get test accounts for Aztec sandbox
 * Returns pre-funded accounts available in sandbox
 * @param count - Number of accounts to return (default: all available)
 * @returns Array of Wallet instances
 */
export async function getAztecTestAccounts(count?: bigint): Promise<Wallet[]> {
    const pxeUrl = process.env.PXE_URL || DEFAULT_PXE_URL;
    //@ts-ignore
    const { createPXEClient, waitForPXE } = await import("@aztec/aztec.js");
    
    const pxe = createPXEClient(pxeUrl);
    await waitForPXE(pxe);
    
    const wallets = await getInitialTestAccountsWallets(pxe);
    
    if (count !== undefined) {
        return wallets.slice(0, Number(count));
    }
    
    return wallets;
}

/**
 * Check if running on Aztec Sandbox (local)
 * @param chainId - L1 chain ID
 * @returns true if sandbox, false if testnet/mainnet
 */
export function isSandbox(chainId: bigint): boolean {
    return chainId === 31337n;
}

/**
 * Get contract instance from deployment address
 * Used for loading already-deployed contracts
 * @param address - Aztec contract address
 * @returns ContractInstanceWithAddress
 */
export async function getContractInstanceFromAddress(
    address: AztecAddress
): Promise<ContractInstanceWithAddress> {
    const node = await initNodeClient();
    const contractInstance = await node.getContract(address);
    if (!contractInstance) {
        throw new Error(`Contract not found at address: ${address.toString()}`);
    }
    return contractInstance;
}
