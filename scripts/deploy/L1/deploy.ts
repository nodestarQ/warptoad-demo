import hre, { network } from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { type Hex, getContract, type PublicClient, isAddress, getAddress } from 'viem';
import { deployPoseidon } from "../utils/poseidon.ts";

import L1WarpToadModule from "../../../ignition/modules/L1WarpToad.ts"
import L1InfraModule from "../../../ignition/modules/L1Infra.ts"
import fs, { readFile, access } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { join } from 'path';

import { L1_SCROLL_MESSENGER_MAINNET, L1_SCROLL_MESSENGER_SEPOLIA } from "../../lib/constants.ts";
import { checkFileExists, getContractAddressesEvm, getEvmDeployedAddressesFilePath, getEvmDeployedAddressesFolderPath, promptBool } from "../../dev_op/utils.ts";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function checkTokenDeployment(chainId: number) {
    const deploymentPath = join(process.cwd(), `ignition/deployments/chain-${chainId}/deployed_addresses.json`);
    try {
        let deploymentJson: string;
        try {
            deploymentJson = await readFile(deploymentPath, "utf8");
        } catch {
            throw new Error(`deploymentJson was not found at: ${deploymentPath}`);
        }

        let deploymentObject: Record<string, string>;
        try {
            deploymentObject = JSON.parse(deploymentJson);
        } catch {
            throw new Error(`deploymentJson is not valid JSON: ${deploymentPath}`);
        }

        const key = "TestToken#USDcoin"; //@TODO Hardcoded key value rn for checks

        if (!(key in deploymentObject)) {
            throw new Error(`${key} was not deployed on chain ${chainId}`);
        }

        const address = deploymentObject[key];
        return getAddress(address);
    } catch (error) {
        throw error;
    }

}

async function main() {
    //--------arguments-------------------
    // simply get native token from deployments+chainId
    const { viem, networkConfig, ignition, networkHelpers } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const [walletClient] = await viem.getWalletClients();
    const chainIdNum = networkConfig.chainId;
    if (!chainIdNum) {
        throw new Error(`chainId is: ${chainIdNum}`);
    }
    const chainId = BigInt(chainIdNum);
    const nativeTokenAddress = await checkTokenDeployment(chainIdNum)

    //get erc20 Abi
    const erc20ArtifactPath = join(process.cwd(), 'artifacts/@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json');
    const erc20ArtifactJson = await readFile(erc20ArtifactPath, 'utf8');
    const erc20Artifact = JSON.parse(erc20ArtifactJson);
    const erc20Abi = erc20Artifact.abi;

    const deployedAddressesPath = getEvmDeployedAddressesFilePath(chainId)
    if (await checkFileExists(deployedAddressesPath)) {
        const contracts = await getContractAddressesEvm(chainId) //evmDeployments[Number(chainId)]
        const WarpToadDeployId = "L1WarpToadModule#L1WarpToad"
        console.log({ contracts })
        if (WarpToadDeployId in contracts) {
            if (await promptBool(`A deployment of ${WarpToadDeployId} already exist at ${deployedAddressesPath} \n Are you sure want to override?`)) {
                await fs.rm(getEvmDeployedAddressesFolderPath(chainId), { force: true, recursive: true })
                console.log("overriding old deployment")
            } else {
                console.log("continuing without redeploying (just verifying)")
            }

        }
    }
    //-----------warptoad------------------------
    const PoseidonT3Address = await deployPoseidon();
    const nativeToken = await viem.getContractAt("USDcoin", nativeTokenAddress);

    const name = `wrapped-warptoad-${await nativeToken.read.name()}`;
    const symbol = `wrptd-${(await nativeToken.read.symbol()).toUpperCase()}`;

    const { L1WarpToad, withdrawVerifier, PoseidonT3Lib, LazyIMTLib } = await ignition.deploy(L1WarpToadModule, {
        parameters: {
            L1WarpToadModule: {
                PoseidonT3LibAddress: PoseidonT3Address,
                nativeToken: nativeTokenAddress,
                name: name,
                symbol: symbol,
            }
        },
    });
    const IS_MAINNET = chainId === 1n
    const L1ScrollMessengerAddress = IS_MAINNET ? L1_SCROLL_MESSENGER_MAINNET : L1_SCROLL_MESSENGER_SEPOLIA
    //--------------------infra------------------------
    const { gigaBridge, L1AztecBridgeAdapter, L1ScrollBridgeAdapter } = await ignition.deploy(L1InfraModule, {
        parameters: {
            L1InfraModule: {
                LazyIMTLibAddress: LazyIMTLib.address,
                L1WarpToadAddress: L1WarpToad.address,
                L1ScrollMessengerAddress: L1ScrollMessengerAddress
            }
        },
    });


    console.log(`
    deployed: 
        LazyIMTLib:                 ${LazyIMTLib.address}
        PoseidonT3Lib:              ${PoseidonT3Lib.address}

        gigaBridge:                 ${gigaBridge.address}
        L1WarpToad:                 ${L1WarpToad.address}
        withdrawVerifier:           ${withdrawVerifier.address}
        
        L1AztecBridgeAdapter:       ${L1AztecBridgeAdapter.address}
        L1ScrollBridgeAdapter:      ${L1ScrollBridgeAdapter.address}
    `)
    if (chainId !== 31337n) {
        // -------verify -----------------
        // TODO make this into a more reusable script / function
        // gather data for constructor arguments and libraries
        const journalFilePath = `ignition/deployments/chain-${chainId}/journal.jsonl`
        const journal = await readFile(journalFilePath, 'utf8');
        const parsedJournal = journal.split('\n').filter(line => line.trim() !== '').map(line => JSON.parse(line));
        const journalDataPerId = parsedJournal.reduce((allData, currentLine) => {
            if ("futureId" in currentLine) {
                const contractName = currentLine["futureId"].split("#")[1]
                if (contractName in allData) {
                    allData[contractName] = { ...currentLine, ...allData[contractName] }
                } else {
                    allData[contractName] = currentLine
                }
            }
            return allData
        }, {})

        const journalDataPerAddress = Object.fromEntries(Object.entries(journalDataPerId).map((v: any) => {
            if ("contractAddress" in v[1]) {
                return [v[1]["contractAddress"], v[1]]
            } else {
                return [v[1]["result"]["address"], v[1]]
            }
        }))

        // verify
        const waitTimeBetweenVerify = 1000 * 3
        // ----------- libraries ----------------
        console.log(`verifying: LazyIMTLib: ${LazyIMTLib.address}`)
        await verifyContract({
            address: LazyIMTLib.address,
            contract: "@zk-kit/lazy-imt.sol/LazyIMT.sol:LazyIMT",
            constructorArgs: journalDataPerAddress[LazyIMTLib.address].constructorArgs,
            libraries: journalDataPerAddress[LazyIMTLib.address].libraries,
        }, hre);
        await sleep(waitTimeBetweenVerify)

        // console.log(`verifying: poseidon: ${PoseidonT3Lib.target}`)
        // await hre.run("verify:verify", {
        //   address: LazyIMTLib.target,
        //   contract: "poseidon-solidity/PoseidonT3.sol:PoseidonT3",
        //   constructorArguments: journalDataPerAddress[PoseidonT3Lib.target].constructorArgs,
        //   libraries: journalDataPerAddress[PoseidonT3Lib.target].libraries,
        // });
        // await sleep(waitTimeBetweenVerify)



        // ------------------- giga bridge -----------------
        console.log(`verifying: gigaBridge: ${gigaBridge.address}`)
        await verifyContract({
            address: gigaBridge.address,
            contract: "contracts/evm/GigaBridge.sol:GigaBridge",
            constructorArgs: journalDataPerAddress[gigaBridge.address].constructorArgs,
            libraries: journalDataPerAddress[gigaBridge.address].libraries,
        }, hre);
        await sleep(waitTimeBetweenVerify)


        // --------------------- warp toad----------------------
        console.log(`verifying: L1WarpToad: ${L1WarpToad.address}`)
        await verifyContract({
            address: L1WarpToad.address,
            contract: "contracts/evm/warptoad/L1WarpToad.sol:L1WarpToad",
            constructorArgs: journalDataPerAddress[L1WarpToad.address].constructorArgs,
            libraries: journalDataPerAddress[L1WarpToad.address].libraries,
        }, hre);
        await sleep(waitTimeBetweenVerify)

        console.log(`verifying: withdrawVerifier: ${withdrawVerifier.address}`)
        await verifyContract({
            address: withdrawVerifier.address,
            contract: "contracts/evm/withdrawVerifier.sol:WithdrawVerifier",
            constructorArgs: journalDataPerAddress[withdrawVerifier.address].constructorArgs,
            libraries: journalDataPerAddress[withdrawVerifier.address].libraries,
        }, hre);
        await sleep(waitTimeBetweenVerify)


        //------------ L1 adapters -------------------------
        console.log(`verifying: L1AztecBridgeAdapter: ${L1AztecBridgeAdapter.address}`)
        await verifyContract({
            address: L1AztecBridgeAdapter.address,
            contract: "contracts/evm/adapters/L1AztecBridgeAdapter.sol:L1AztecBridgeAdapter",
            constructorArgs: journalDataPerAddress[L1AztecBridgeAdapter.address].constructorArgs,
            libraries: journalDataPerAddress[L1AztecBridgeAdapter.address].libraries,
        }, hre);
        await sleep(waitTimeBetweenVerify)

        console.log(`verifying: L1ScrollBridgeAdapter: ${L1ScrollBridgeAdapter.address}`)
        await verifyContract({
            address: L1ScrollBridgeAdapter.address,
            contract: "contracts/evm/adapters/L1ScrollBridgeAdapter.sol:L1ScrollBridgeAdapter",
            constructorArgs: journalDataPerAddress[L1ScrollBridgeAdapter.address].constructorArgs,
            libraries: journalDataPerAddress[L1ScrollBridgeAdapter.address].libraries,
        }, hre);
        await sleep(waitTimeBetweenVerify)
    }

}
main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    }); 