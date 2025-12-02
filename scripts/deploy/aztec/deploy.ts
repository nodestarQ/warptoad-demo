import { WarpToadCoreContract } from '../../../contracts/aztec/WarpToadCore/src/artifacts/WarpToadCore.ts'
import { L2AztecBridgeAdapterContract } from '../../../contracts/aztec/L2AztecBridgeAdapter/src/artifacts/L2AztecBridgeAdapter.ts'
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { Fq, Fr, GrumpkinScalar } from '@aztec/aztec.js/fields';
import { AztecNode, createAztecNodeClient } from "@aztec/aztec.js/node";
import { createPXE, getPXEConfig, PXE } from "@aztec/pxe/server";
import { TestWallet } from '@aztec/test-wallet/server';
import { createStore } from "@aztec/kv-store/lmdb";
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee/testing';
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { SponsoredFPCContract } from "@aztec/noir-contracts.js/SponsoredFPC";
import { AccountManager } from '@aztec/aztec.js/wallet';
import { USDcoin } from '../../../types/ethers-contracts/index.ts';

const PXE_URL = "http://localhost:8080";

const __dirname = "./testWalletStore";


type AccountKeys = {
    secretKey: Fr;
    salt: Fr;
    signingPrivateKey: Fq;
    deployed: boolean;
}

const deployerKeysFileName = "./deployer-keys.json"


function createNewAccountKeys(): AccountKeys {
    const accountKeys: AccountKeys = {
        secretKey: Fr.random(),
        salt: new Fr(0),
        signingPrivateKey: GrumpkinScalar.random(),
        deployed: false
    }
    return accountKeys
}

function storeDeployerAccountKeys(keys: AccountKeys, fileName: string) {
    const serializable = {
        secretKey: keys.secretKey.toString(),
        salt: keys.salt.toString(),
        signingPrivateKey: keys.signingPrivateKey.toString(),
        deployed: keys.deployed
    };

    const filePath = join(__dirname, fileName);

    writeFileSync(filePath, JSON.stringify(serializable, null, 2), "utf-8");
    console.log("Deployer keys stored at", filePath);
}

function loadDeployerAccountKeys(fileName: string) {
    const filePath = join(__dirname, fileName);

    const data = JSON.parse(readFileSync(filePath, "utf-8"));

    return {
        secretKey: Fr.fromString(data.secretKey),
        salt: Fr.fromString(data.salt),
        signingPrivateKey: Fq.fromString(data.signingPrivateKey),
        deployed: data.deployed
    };
}

function isValidAccountKeys(fileName: string) {
    const filePath = join(__dirname, fileName);
    if (!existsSync(filePath)) return false;
    try {
        //check if valid json
        const data = JSON.parse(readFileSync(filePath, "utf-8"));

        //check if it has all the appropriate fields
        if (
            typeof data.secretKey !== "string" ||
            typeof data.salt !== "string" ||
            typeof data.signingPrivateKey !== "string"
        ) {
            return false;
        }

        //chec if convertible into Fr/Fq
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


export async function initNodeClient(): Promise<AztecNode> {
    try {
        console.log("creating Aztec Node Client...");
        const node = createAztecNodeClient(PXE_URL);
        const nodeInfo = await node.getNodeInfo();
        console.log("Connected to sandbox version:", nodeInfo.nodeVersion);
        console.log("Chain ID:", nodeInfo.l1ChainId);
        return node;

    } catch (error) {
        console.log("failed to create Aztec Node Client: ", error);
        throw error;
    }
}

export async function initPXE(node: AztecNode): Promise<PXE> {
    try {
        const l1Contracts = await node.getL1ContractAddresses();
        console.log("creating PXE client");
        const config = getPXEConfig();
        const fullConfig = { ...config, l1Contracts };
        fullConfig.proverEnabled = false; // you'll want to set this to "true" once you're ready to connect to the testnet

        const store = await createStore("pxe", {
            dataDirectory: "store",
            dataStoreMapSizeKb: 1e6,
        });
        const pxe = await createPXE(node, fullConfig, { store });
        return pxe

    } catch (error) {
        console.log("failed to create Aztec PXE: ", error);
        throw error;
    }
}


async function getSponsoredFPCInstance() {
    const sponsoredFPCInstance = await getContractInstanceFromInstantiationParams(
        SponsoredFPCContract.artifact,
        {
            salt: new Fr(0),
        }
    );
    return sponsoredFPCInstance
}

async function createAccount(accountKeys: AccountKeys) {
    const nodeUrl = process.env.AZTEC_NODE_URL || "http://localhost:8080";
    const node = createAztecNodeClient(nodeUrl);
    const wallet = await TestWallet.create(node);

    const initialAccount = await wallet.createSchnorrAccount(
        accountKeys.secretKey,
        accountKeys.salt
    );

    return initialAccount
}

async function deployWallet(accountKeys: AccountKeys) {

    const nodeUrl = process.env.AZTEC_NODE_URL || "http://localhost:8080";
    const node = createAztecNodeClient(nodeUrl);
    const wallet = await TestWallet.create(node);

    const initialAccount = await wallet.createSchnorrAccount(
        accountKeys.secretKey,
        accountKeys.salt
    );

    const sponsoredFPCInstance = await getSponsoredFPCInstance();

    console.log("registering sponsored fpc instance contract with pxe");

    await wallet.registerContract(
        sponsoredFPCInstance,
        SponsoredFPCContract.artifact
    );

    console.log("\n sponsoredFPCInstance address:" + sponsoredFPCInstance.address + "\n")

    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(
        sponsoredFPCInstance.address
    );
    const deployMethod = await initialAccount.getDeployMethod();
    try {
        await deployMethod
            .send({
                from: AztecAddress.ZERO,
                fee: { paymentMethod: sponsoredPaymentMethod },
            })
            .wait();
        storeDeployerAccountKeys({ ...accountKeys, deployed: true }, deployerKeysFileName)

        console.log("wallet got deployed YaY!!!: ", initialAccount.address)

        return initialAccount;

    } catch (error) {
        console.log(error)
    }

}

async function deployAdminWallet() {

    if (!isValidAccountKeys(deployerKeysFileName)) {
        const newDeployerAccountKeys = createNewAccountKeys();
        storeDeployerAccountKeys(newDeployerAccountKeys, deployerKeysFileName);
    }

    const readKeys = loadDeployerAccountKeys(deployerKeysFileName);
    if (!readKeys.deployed) {
        try {
            await deployWallet(readKeys)
        } catch (error) {
            throw error
        }
    } else {
        console.log("wallet is already deployed")
    }

    const returnAccount = await createAccount(readKeys)
    return returnAccount
}

export async function deployAztecWarpToad(nativeToken: USDcoin | any, deployerWallet: TestWallet, sponsoredPaymentMethod: SponsoredFeePaymentMethod | undefined) {
    console.log("deploying Aztec Warptoad")
    const name = `wrapped-warptoad-${await nativeToken.name()}`;
    const symbol = `wrptd-${(await nativeToken.symbol()).toUpperCase()}`;
    const decimals = 6n; // only 6 decimals what is this tether??

    const AztecWarpToad = await WarpToadCoreContract.deploy(deployerWallet, nativeToken.target, name, symbol, decimals).send({ fee: { paymentMethod: sponsoredPaymentMethod }, from: (await deployerWallet.getAccounts())[0].item }).deployed({ timeout: 60 * 60 * 12 });

    return { AztecWarpToad };
}



async function main() {
    //deploy admin wallet
    const adminAccount = await deployAdminWallet()

    console.log("\nadmin wallet: ", adminAccount.address)

    //deploy Contract 1




}


//create admin/deployer wallet


//then deploy


/* 
async function deployWarptoadCore() {
    const contract = await WarpToadCoreContract.deploy(

    )
}
    */



main()