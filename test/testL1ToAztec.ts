// Hardhat 
const hre = require("hardhat");
//@ts-ignore
import { expect } from "chai";
//@ts-ignore
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers.js";

// Test fixtures
import { l1ToAztecFixture } from "./fixtures/deployments";

// Utilities
import { ethers } from "ethers";
import { gasCostPerChain } from "../scripts/lib/constants";
import { hashCommitment, hashPreCommitment } from "../scripts/lib/hashing";
import { getMerkleData, calculateFeeFactor } from "../scripts/lib/proving";
import { bridgeBetweenL1AndL2, parseEventFromTx } from "../scripts/lib/bridging";



describe("WarpToad L1 → Aztec", function () {

    describe("burnL1MintAztec", function () {
        it("Should burn on L1 and mint on Aztec", async function () {
            //----------------------setup--------------------------------
            const contracts = await loadFixture(l1ToAztecFixture);
            const { 
                L2AztecBridgeAdapter, 
                L1AztecBridgeAdapter, 
                L1WarpToad, 
                AztecWarpToad, 
                aztecWallets, 
                evmWallets, 
                gigaBridge, 
                PXE,
                L1WarpToadWithSender,
                initialBalance: initialBalanceSender
            } = contracts;
            
            const aztecDeployer = aztecWallets[0];
            const aztecRecipient = aztecWallets[2];
            const evmRelayer = evmWallets[1];
            const evmSender = evmWallets[2];

            //@ts-ignore
            const provider = hre.ethers.provider;
            
            // Note: Tokens already wrapped via fixture

            // ------------------ burn -----------------------------------------
            console.log("burning!")
            const amountToBurn1 = 5n * 10n ** 18n
            const amountToBurn2 = 4n * 10n ** 18n

            // Note: Tokens already wrapped via fixture
            const balancePreBurn = await L1WarpToadWithSender.balanceOf(evmSender.getAddress())
            const { chainId: chainIdEvmProvider } = await provider.getNetwork()

            const aztecVersion = (await PXE.getNodeInfo()).rollupVersion
            const aztecVersionFromContract = await AztecWarpToad.methods.get_version().simulate({from:aztecDeployer.getAddress()});
            const chainIdAztecFromContract = hre.ethers.toBigInt(await AztecWarpToad.methods.get_chain_id_unconstrained(aztecVersion).simulate({from:aztecDeployer.getAddress()}))

            const commitmentPreImg1 = {
                amount: amountToBurn1,
                destination_chain_id: chainIdAztecFromContract,
                secret: 1234n,
                nullifier_preimg: 4321n, // Use Fr.random().toBigInt() in prod pls
            }

            const commitmentPreImg2 = {
                amount: amountToBurn2,
                destination_chain_id: chainIdAztecFromContract,
                secret: 12341111111n,
                nullifier_preimg: 432111111n, // Use Fr.random().toBigInt() in prod pls
            }

            const preCommitment1 = hashPreCommitment(commitmentPreImg1.nullifier_preimg, commitmentPreImg1.secret, commitmentPreImg1.destination_chain_id)
            const preCommitment2 = hashPreCommitment(commitmentPreImg2.nullifier_preimg, commitmentPreImg2.secret, commitmentPreImg2.destination_chain_id)
            const burnTx1 = await (await L1WarpToadWithSender.burn(preCommitment1, commitmentPreImg1.amount)).wait(1)
            const balancePostBurn = await L1WarpToadWithSender.balanceOf(await evmSender.getAddress())

            //expect(chainIdEvmProvider).to.not.equal(chainIdAztecFromContract);
            expect(balancePostBurn).to.equal(balancePreBurn - amountToBurn1);

            // relayer fee logic
            const priorityFee = 100000000n;// in wei (this is 0.1 gwei)
            const maxFee = 5n * 10n ** 18n;   // i don't want to pay no more than 5 usdc okay cool thanks
            const ethPriceInToken = 1700.34 // how much tokens you need to buy 1 eth. In this case 1700 usdc tokens to buy 1 eth. Cheap!
            // L1 evm estimate. re-estimating this on every tx will require you to make a zk proof twice so i hardcoded. You should get a up to date value for L2's with alternative gas pricing from backend/scripts/dev_op/estimateGas.ts
            const gasCost = Number(gasCostPerChain[Number(chainIdEvmProvider)])
            const relayerBonusFactor = 1.1 // 10% earnings on gas fees! 
            const feeFactor = calculateFeeFactor(ethPriceInToken, gasCost, relayerBonusFactor);

            L1WarpToad.connect(evmRelayer)

            // ------------------bridge------------------------------------
            console.log("bridge!")
            const localRootProviders = [await L1WarpToad.getAddress(), await L1AztecBridgeAdapter.getAddress()];
            const gigaRootRecipients = [await L1WarpToad.getAddress(), await L1AztecBridgeAdapter.getAddress()];
            
            //@ts-ignore
            const { txObjects } = await bridgeBetweenL1AndL2(
                evmRelayer,
                L1AztecBridgeAdapter,
                gigaBridge,
                L2AztecBridgeAdapter,
                AztecWarpToad,
                localRootProviders,
                [],
                {
                    //@ts-ignore
                    isAztec: true,
                    //@ts-ignore
                    aztecNode: contracts.node,
                    sponsoredPaymentMethod: undefined
                }
            );
            
            const { gigaRootUpdateTx } = txObjects;
        
            // check updateGigaRoot
            const parsedGigaRootUpdateEvent = parseEventFromTx(gigaRootUpdateTx, gigaBridge, "ConstructedNewGigaRoot");
            const newGigaRootFromBridgeEvent = parsedGigaRootUpdateEvent!.args[0];
            const gigaRootFromContract = await gigaBridge.gigaRoot();
            expect(newGigaRootFromBridgeEvent.toString()).to.equal(gigaRootFromContract.toString());

            //check bridgeGigaRoot
            const newGigaRootFromL2 = await AztecWarpToad.methods.get_giga_root().simulate({from:aztecDeployer.getAddress()});
            const newGigaRootFromL1 = await gigaBridge.gigaRoot();
            expect(newGigaRootFromL2.toString()).to.equal(BigInt(newGigaRootFromL1.toString()));
            

            // -------------mint-----------------------------------
            console.log("mint!")
            // const proofInputs = await getProofInputs(
            //     gigaBridge,
            //     L1WarpToad,
            //     L1WarpToadWithSender,
            //     amountToBurn1,
            //     feeFactor,
            //     priorityFee,
            //     maxFee,
            //     await evmRelayer.getAddress(),
            //     await evmRecipient.getAddress(),
            //     commitmentPreImg1.nullifier_preimg,
            //     commitmentPreImg1.secret,
            // )
            const commitment1 = hashCommitment(preCommitment1,commitmentPreImg1.amount)
            const aztecMerkleData1 = await getMerkleData(gigaBridge,L1WarpToad,AztecWarpToad,commitment1)
            //await generateNoirTest(proofInputs);
            // const proof = await createProof(proofInputs, os.cpus().length)

            console.log("TODO balance_of!!!!!!!!")
            //const balanceRecipientPreMint = await AztecWarpToad.methods.balance_of(await evmRecipient.getAddress()).simulate()
            const mintTx = await AztecWarpToad.methods.mint_giga_root_evm(
                commitmentPreImg1.amount,
                commitmentPreImg1.secret,
                commitmentPreImg1.nullifier_preimg,
                aztecRecipient.getAddress(),
                aztecMerkleData1.blockNumber,
                aztecMerkleData1.originLocalRoot,
                aztecMerkleData1.gigaMerkleData as any, // no way i am gonna spend time getting this type right >:(
                aztecMerkleData1.evmMerkleData as any,
            ).send({from:aztecDeployer.getAddress()}).wait()
            // check mint tx
            console.log("TODO balance_of!!!!!!!!")
            // const balanceRecipientPostMint = await AztecWarpToad.methods.balance_of(aztecRecipient.getAddress()).simulate()
        
            // expect(balanceRecipientPostMint).to.equal(balanceRecipientPreMint + ethers.toBigInt(commitmentPreImg1.amount))


            const burnTx2 = await (await L1WarpToadWithSender.burn(preCommitment2, commitmentPreImg2.amount)).wait(1);
            const commitment2 = hashCommitment(preCommitment2, commitmentPreImg2.amount);
            console.log({gigaBridge, L1WarpToad, AztecWarpToad, commitment2});
           
            // Bridge again for second burn
            await bridgeBetweenL1AndL2(
                evmRelayer,
                L1AztecBridgeAdapter,
                gigaBridge,
                L2AztecBridgeAdapter,
                AztecWarpToad,
                localRootProviders,
                [],
                {
                    //@ts-ignore
                    isAztec: true,
                    //@ts-ignore
                    aztecNode: contracts.node,
                    sponsoredPaymentMethod: undefined
                }
            );

            const aztecMerkleData2 = await getMerkleData(gigaBridge,L1WarpToad,AztecWarpToad,commitment2)
            // possible bugs. aztecMerkleData2 needs to be called after bridging. 
            // not waiting on tx to settle
            // the localRoot block number extracted from the gigaRoot event is wrong

            await AztecWarpToad.methods.mint_giga_root_evm(
                commitmentPreImg2.amount,
                commitmentPreImg2.secret,
                commitmentPreImg2.nullifier_preimg,
                aztecRecipient.getAddress(),
                aztecMerkleData2.blockNumber,
                aztecMerkleData2.originLocalRoot,
                aztecMerkleData2.gigaMerkleData as any, // no way i am gonna spend time getting this type right >:(
                aztecMerkleData2.evmMerkleData as any,
            ).send({from:aztecDeployer.getAddress()}).wait()

            console.log("TODO balance_of!!!!!!!!")
            // const balanceRecipientPostPostMint = await AztecWarpToad.methods.balance_of(aztecRecipient.getAddress()).simulate()
            // console.log(balanceRecipientPostPostMint, balanceRecipientPostMint)
        });
    });
});
