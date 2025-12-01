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

const PXE_URL = "http://localhost:8080";

const __dirname = "./";


type AccountKeys = {
    secretKey: Fr;
    salt: Fr;
    signingPrivateKey: Fq
}

const deployerKeysFileName = "./deployer-keys.json"


function createNewAccountKeys(): AccountKeys {
    const accountKeys: AccountKeys = {
        secretKey: Fr.random(),
        salt: new Fr(0),
        signingPrivateKey: GrumpkinScalar.random()
    }
    return accountKeys
}

function storeDeployerAccountKeys(keys: AccountKeys, fileName: string) {
    const serializable = {
        secretKey: keys.secretKey.toString(),
        salt: keys.salt.toString(),
        signingPrivateKey: keys.signingPrivateKey.toString()
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


async function deployWallet(accountKeys: AccountKeys) {

    const nodeUrl = process.env.AZTEC_NODE_URL || "http://localhost:8080";
    const node = createAztecNodeClient(nodeUrl);
    const wallet = await TestWallet.create(node);

    const initialAccount = await wallet.createSchnorrAccount(
        accountKeys.secretKey,
        accountKeys.salt
    );

    const sponsoredFPCInstance = await getSponsoredFPCInstance();

    console.log("\n " + sponsoredFPCInstance.address)

    const sponsoredPaymentMethod = new SponsoredFeePaymentMethod(
        sponsoredFPCInstance.address
    );

    const deployMethod = await initialAccount.getDeployMethod();
    await deployMethod
        .send({
            from: AztecAddress.ZERO,
            fee: { paymentMethod: sponsoredPaymentMethod },
        })
        .wait();

    console.log("wallet got deployed YaY!!!")


    /*
    
    const deployMethod = await anotherAccount.getDeployMethod();
    await deployMethod
      .send({
        from: AztecAddress.ZERO,
        fee: { paymentMethod: sponsoredPaymentMethod },
      })
      .wait();
    
    */

}


async function main() {

    if (!isValidAccountKeys(deployerKeysFileName)) {
        const newDeployerAccountKeys = createNewAccountKeys();
        storeDeployerAccountKeys(newDeployerAccountKeys, deployerKeysFileName);
    }

    const readKeys = loadDeployerAccountKeys(deployerKeysFileName);
    await deployWallet(readKeys)
    //console.log(readKeys);




    //check if deployer wallet is already created
    //yes, skip and use wallet data, else create new

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