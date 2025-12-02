import { network } from "hardhat";
import poseidonSolidity from 'poseidon-solidity';
import { poseidon2 } from "poseidon-lite";
import { type Hex, getContract, type PublicClient } from 'viem';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function deployPoseidon() {
    // https://github.com/chancehudson/poseidon-solidity/tree/main?tab=readme-ov-file#deploy
    // Initialize viem clients using Hardhat 3 network manager
    const { viem, networkName } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [walletClient] = await viem.getWalletClients();
    
    console.log(`\nDeploying Poseidon to ${networkName}...`);
    
    // Get presigned deployment data from poseidon-solidity package
    const proxy = poseidonSolidity.proxy;
    const PoseidonT3 = poseidonSolidity.PoseidonT3;
    
    // Number of confirmations to wait for
    const confirmations = 1;

    // First check if the proxy exists
    const proxyCode = await publicClient.getCode({ address: proxy.address as Hex });
    if (!proxyCode || proxyCode === '0x') {
        console.log('Proxy not found, deploying...');
        
        // Fund the keyless account
        const fundTxHash = await walletClient.sendTransaction({
            to: proxy.from as Hex,
            value: BigInt(proxy.gas),
        });
        console.log(`  Funding keyless account, tx: ${fundTxHash}`);
        
        // Wait for funding transaction to confirm
        await publicClient.waitForTransactionReceipt({ 
            hash: fundTxHash,
            confirmations 
        });
        console.log(`  ✓ Funding confirmed`);
        
        // Deploy the proxy using pre-signed transaction
        const proxyTxHash = await publicClient.sendRawTransaction({ 
            serializedTransaction: proxy.tx as Hex 
        });
        console.log(`  Deploying proxy, tx: ${proxyTxHash}`);
        
        // Wait for proxy deployment
        await publicClient.waitForTransactionReceipt({ 
            hash: proxyTxHash,
            confirmations 
        });
        console.log(`  ✓ Proxy deployed at: ${proxy.address}`);
    } else {
        console.log(`Proxy for poseidon was already deployed at: ${proxy.address}`);
    }

    // Then deploy the hasher, if needed
    const poseidonCode = await publicClient.getCode({ address: PoseidonT3.address as Hex });
    if (!poseidonCode || poseidonCode === '0x') {
        console.log('PoseidonT3 not found, deploying...');
        
        const deployTxHash = await walletClient.sendTransaction({
            to: proxy.address as Hex,
            data: PoseidonT3.data as Hex
        });
        console.log(`  Deploying PoseidonT3, tx: ${deployTxHash}`);
        
        // Wait for deployment
        await publicClient.waitForTransactionReceipt({ 
            hash: deployTxHash,
            confirmations 
        });
        console.log(`  ✓ PoseidonT3 deployed at: ${PoseidonT3.address}`);
    } else {
        console.log(`PoseidonT3 was already deployed at: ${PoseidonT3.address}`);
    }
    
    // Verification test: Compare JS and Solidity implementations
    console.log('\nVerifying deployment...');
    const preImg: [bigint, bigint] = [1234n, 5678n];
    const jsHash = poseidon2(preImg);

    // Load the PoseidonT3 artifact to get the ABI
    const artifactPath = join(process.cwd(), 'artifacts/poseidon-solidity/PoseidonT3.sol/PoseidonT3.json');
    const artifactJson = await readFile(artifactPath, 'utf8');
    const artifact = JSON.parse(artifactJson);

    // Get contract instance using viem
    const poseidonContract = getContract({
        address: PoseidonT3.address as Hex,
        abi: artifact.abi,
        client: publicClient as PublicClient
    });

    // Call the hash function
    const solHash = await poseidonContract.read.hash([preImg]) as bigint;

    // Verify hashes match
    if (BigInt(jsHash) !== solHash) {
        throw new Error(
            `Hash mismatch! JS: ${jsHash}, Solidity: ${solHash}. Something is wrong with the deployment!`
        );
    }

    console.log(`PoseidonT3 verification passed!`);
    console.log(`JS hash:       ${jsHash}`);
    console.log(`Solidity hash: ${solHash}`);
    console.log(`Deployed to:   ${PoseidonT3.address}\n`);

    return PoseidonT3.address;
}