/**
 * EVM Deployment Utilities
 * 
 * Handles EVM contract deployment helpers:
 * - Deployment address storage and loading
 * - Path management for deployment artifacts
 * - Validation utilities
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";

/**
 * Get deployment directory path
 * @param chainId - Chain ID (e.g., 31337 for local, 11155111 for Sepolia)
 * @param type - Deployment type ('evm' or 'aztec')
 * @returns Absolute path to deployment directory
 */
export function getDeploymentPath(chainId: number, type: 'evm' | 'aztec'): string {
    const baseDir = process.cwd();
    
    if (type === 'aztec') {
        return join(baseDir, 'scripts', 'deploy', 'aztec', 'aztecDeployments', chainId.toString());
    } else {
        // EVM deployments use Hardhat Ignition structure
        return join(baseDir, 'ignition', 'deployments', `chain-${chainId}`);
    }
}

/**
 * Get deployment addresses file path
 * @param chainId - Chain ID
 * @param type - Deployment type ('evm' or 'aztec')
 * @returns Absolute path to deployed_addresses.json file
 */
export function getDeploymentAddressesFilePath(chainId: number, type: 'evm' | 'aztec'): string {
    const deploymentDir = getDeploymentPath(chainId, type);
    return join(deploymentDir, 'deployed_addresses.json');
}

/**
 * Load deployment addresses from file
 * @param chainId - Chain ID
 * @param type - Deployment type ('evm' or 'aztec')
 * @returns Object mapping contract names to addresses, or null if file doesn't exist
 */
export function loadDeploymentAddresses(
    chainId: number,
    type: 'evm' | 'aztec' = 'evm'
): Record<string, string> | null {
    const filePath = getDeploymentAddressesFilePath(chainId, type);
    
    if (!existsSync(filePath)) {
        return null;
    }
    
    try {
        const data = readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error loading deployment addresses from ${filePath}:`, error);
        return null;
    }
}

/**
 * Save deployment addresses to file
 * Creates directory structure if it doesn't exist
 * 
 * @param chainId - Chain ID
 * @param addresses - Object mapping contract names to addresses
 * @param type - Deployment type ('evm' or 'aztec')
 */
export function saveDeploymentAddresses(
    chainId: number,
    addresses: Record<string, string>,
    type: 'evm' | 'aztec' = 'evm'
): void {
    const filePath = getDeploymentAddressesFilePath(chainId, type);
    const dir = dirname(filePath);
    
    // Create directory if it doesn't exist
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    
    // Merge with existing addresses if file exists
    let existingAddresses: Record<string, string> = {};
    if (existsSync(filePath)) {
        try {
            const data = readFileSync(filePath, 'utf-8');
            existingAddresses = JSON.parse(data);
        } catch (error) {
            console.warn(`Could not parse existing deployment file, will overwrite:`, error);
        }
    }
    
    const mergedAddresses = { ...existingAddresses, ...addresses };
    
    writeFileSync(filePath, JSON.stringify(mergedAddresses, null, 2), 'utf-8');
    console.log(`✅ Deployment addresses saved to: ${filePath}`);
}

/**
 * Validate deployment addresses
 * Checks if all expected contracts have valid addresses
 * 
 * @param addresses - Object mapping contract names to addresses
 * @param expectedContracts - Array of contract names that should exist
 * @returns true if valid, false otherwise
 */
export function validateDeployment(
    addresses: Record<string, string>,
    expectedContracts: string[]
): boolean {
    for (const contractName of expectedContracts) {
        if (!addresses[contractName]) {
            console.error(`Missing deployment address for contract: ${contractName}`);
            return false;
        }
        
        // Basic address validation (should start with 0x and be 42 characters for EVM)
        const address = addresses[contractName];
        if (typeof address !== 'string') {
            console.error(`Invalid address type for ${contractName}: ${typeof address}`);
            return false;
        }
        
        // Skip length validation for Aztec addresses (they're different format)
        if (!address.startsWith('0x')) {
            console.warn(`Address for ${contractName} doesn't start with 0x: ${address}`);
        }
    }
    
    return true;
}

/**
 * Check if deployment exists for a given chain
 * @param chainId - Chain ID
 * @param type - Deployment type ('evm' or 'aztec')
 * @returns true if deployment file exists, false otherwise
 */
export function deploymentExists(chainId: number, type: 'evm' | 'aztec' = 'evm'): boolean {
    const filePath = getDeploymentAddressesFilePath(chainId, type);
    return existsSync(filePath);
}

/**
 * Clear deployment addresses file
 * Useful for starting fresh deployment
 * 
 * @param chainId - Chain ID
 * @param type - Deployment type ('evm' or 'aztec')
 */
export function clearDeploymentAddresses(chainId: number, type: 'evm' | 'aztec' = 'evm'): void {
    const filePath = getDeploymentAddressesFilePath(chainId, type);
    
    if (existsSync(filePath)) {
        writeFileSync(filePath, JSON.stringify({}, null, 2), 'utf-8');
        console.log(`🗑️  Cleared deployment addresses at: ${filePath}`);
    }
}

/**
 * Get contract address by name
 * Convenience function to retrieve a single contract address
 * 
 * @param chainId - Chain ID
 * @param contractName - Name of the contract
 * @param type - Deployment type ('evm' or 'aztec')
 * @returns Contract address or null if not found
 */
export function getContractAddress(
    chainId: number,
    contractName: string,
    type: 'evm' | 'aztec' = 'evm'
): string | null {
    const addresses = loadDeploymentAddresses(chainId, type);
    
    if (!addresses) {
        return null;
    }
    
    return addresses[contractName] || null;
}

/**
 * Print deployment summary to console
 * @param addresses - Object mapping contract names to addresses
 * @param title - Optional title for the summary
 */
export function printDeploymentSummary(
    addresses: Record<string, string>,
    title: string = "Deployment Summary"
): void {
    console.log("\n" + "=".repeat(60));
    console.log(`  ${title}`);
    console.log("=".repeat(60));
    
    const sortedNames = Object.keys(addresses).sort();
    
    for (const name of sortedNames) {
        const paddedName = name.padEnd(30, ' ');
        console.log(`  ${paddedName} ${addresses[name]}`);
    }
    
    console.log("=".repeat(60) + "\n");
}
