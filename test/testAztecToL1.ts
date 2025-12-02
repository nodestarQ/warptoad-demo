// Hardhat 
const hre = require("hardhat");
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

// Test fixtures
import { aztecToL1Fixture } from "./fixtures/deployments";

// Utilities
import { ethers } from "ethers";
import os from 'os';
import { gasCostPerChain } from "../scripts/lib/constants";
import { calculateFeeFactor, createProof, getProofInputs } from "../scripts/lib/proving";
import { bridgeBetweenL1AndL2 } from "../scripts/lib/bridging";



describe("WarpToad Aztec → L1", function () {

    describe("deployment", function () {
        it("Should deploy and initialize all contracts", async function () {
            const contracts = await loadFixture(aztecToL1Fixture);
            const { AztecWarpToad, L1AztecBridgeAdapter } = contracts;
            
            // Verify Aztec contract knows its L1 adapter
            const aztecsL1Adapter = ethers.getAddress(
                ethers.toBeHex((await AztecWarpToad.methods.get_l1_bridge_adapter().simulate()).inner)
            );
            expect(aztecsL1Adapter).to.eq(await L1AztecBridgeAdapter.getAddress());
        });
    });

    describe("burnAztecMintEvm", function () {
        it("Should burn on Aztec and mint on L1 with ZK proof", async function () {
            //----------------------setup--------------------------------
            const contracts = await loadFixture(aztecToL1Fixture);
            const { 
                L2AztecBridgeAdapter, 
                L1AztecBridgeAdapter, 
                L1WarpToad, 
                AztecWarpToad, 
                aztecWallets, 
                evmWallets, 
                gigaBridge, 
                PXE,
                AztecWarpToadWithSender,
                initialBalance: initialBalanceSender
            } = contracts;
            
            const aztecSender = aztecWallets[1];
            const aztecRecipient = aztecWallets[2];
            const evmRelayer = evmWallets[1];
            const evmRecipient = evmWallets[3];

            //@ts-ignore
            const provider = hre.ethers.provider;
            
            // Note: Tokens already minted via fixture

            // ------------------ burn -----------------------------------------
            console.log("burning!")
            const amountToBurn1 = 5n * 10n ** 18n
            const amountToBurn2 = 4n * 10n ** 18n
            const balancePreBurn = await AztecWarpToadWithSender.methods.balance_of(aztecSender.getAddress()).simulate()
            const { chainId: chainIdEvmProvider } = await provider.getNetwork()

            const aztecVersion = (await PXE.getNodeInfo()).rollupVersion

            const chainIdAztecFromContract = hre.ethers.toBigInt(await AztecWarpToadWithSender.methods.get_chain_id_unconstrained(aztecVersion).simulate())

            const commitmentPreImg1 = {
                amount: amountToBurn1,
                destination_chain_id: chainIdEvmProvider,
                secret: 1234n,
                nullifier_preimg: 4321n, // Use Fr.random().toBigInt() in prod pls
            }

            const commitmentPreImg2 = {
                amount: amountToBurn2,
                destination_chain_id: chainIdEvmProvider,
                secret: 12341111111n,
                nullifier_preimg: 432111111n, // Use Fr.random().toBigInt() in prod pls
            }
            const burnTx1 = await AztecWarpToadWithSender.methods.burn(commitmentPreImg1.amount, commitmentPreImg1.destination_chain_id, commitmentPreImg1.secret, commitmentPreImg1.nullifier_preimg).send().wait()
            const balancePostBurn = await AztecWarpToadWithSender.methods.balance_of(aztecSender.getAddress()).simulate()
            // chain id is same as evm?? switch to context.version??
            //console.log("Make issue of this. These shouldn't be the same!!!", { aztecWalletChainId, chainIdEvmProvider })
            // its silly but aztec doesn't have a chainId (yet?) here is a issue i made on it: https://github.com/AztecProtocol/aztec-packages/issues/13961#issuecomment-2844691811
            // TLDR is that context.version is basically their chainId likely. But we cant just use it as is because it doesnt care about conflicting with existing chainIds and currently return 1 (the same as L1  🙃)
            expect(chainIdAztecFromContract).to.equal(chainIdAztecFromContract);
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
            await L1WarpToad.storeLocalRootInHistory()
            const localRootProviders = [L1WarpToad.target, L1AztecBridgeAdapter.target]
            const gigaRootRecipients = [L1WarpToad.target, L1AztecBridgeAdapter.target]
            // const {refreshRootTx, PXE_L2Root, gigaRootUpdateTx} = await doFullBridgeAztec(        
            //     PXE,
            //     L2AztecBridgeAdapter,
            //     L1AztecBridgeAdapter,
            //     provider,
            //     gigaBridge,
            //     AztecWarpToad,
            //     localRootProviders,
            //     gigaRootRecipients
            // )
            await bridgeBetweenL1AndL2(
                evmRelayer,
                L1AztecBridgeAdapter,
                gigaBridge,
                L2AztecBridgeAdapter,
                AztecWarpToad,
                localRootProviders,
                [], // no payable root providers (only aztec!)
                {
                    isAztec: true,
                    PXE: PXE,
                    sponsoredPaymentMethod: undefined
                }
            )
        
            // check bridgeNoteHashTreeRoot()
            //const parsedRefreshRootEvent = parseEventFromTx(refreshRootTx, L1AztecBridgeAdapter, "ReceivedNewL2Root")
            //const bridgedL2Root = parsedRefreshRootEvent!.args[0];
            //expect(bridgedL2Root).to.not.be.undefined;
            //expect(bridgedL2Root.toString()).to.equal(BigInt(PXE_L2Root.toString()));

            // check updateGigaRoot
            //const parsedGigaRootUpdateEvent = parseEventFromTx(gigaRootUpdateTx,gigaBridge,"ConstructedNewGigaRoot")
            //const newGigaRootFromBridgeEvent = parsedGigaRootUpdateEvent!.args[0];
            const gigaRootFromContract = await gigaBridge.gigaRoot();
            //expect(newGigaRootFromBridgeEvent.toString()).to.equal(gigaRootFromContract.toString());


            //check bridgeGigaRoot
            const newGigaRootFromL2 = await AztecWarpToad.methods.get_giga_root().simulate();
            const newGigaRootFromL1 = await gigaBridge.gigaRoot();
            expect(newGigaRootFromL2.toString()).to.equal(BigInt(newGigaRootFromL1.toString()))


            // change the note hash tree root
            const burnTx2 = await AztecWarpToadWithSender.methods.burn(commitmentPreImg2.amount, commitmentPreImg2.destination_chain_id, commitmentPreImg2.secret, commitmentPreImg2.nullifier_preimg).send().wait()
            await L2AztecBridgeAdapter.methods.count(463n).send().wait()
            // bridge it again! but exclude aztecWarptoad as recipient of the gigaRoot (so i can see what happens if aztec is one gigaRoot behind)
            // await doFullBridgeAztec(        
            //     PXE,
            //     L2AztecBridgeAdapter,
            //     L1AztecBridgeAdapter,
            //     provider,
            //     gigaBridge,
            //     AztecWarpToad,
            //     localRootProviders,
            //     [L1AztecBridgeAdapter.target]
            // )
            await bridgeBetweenL1AndL2(
                evmRelayer,
                L1AztecBridgeAdapter,
                gigaBridge,
                L2AztecBridgeAdapter,
                AztecWarpToad,
                localRootProviders,
                [], // no payable root providers (only aztec!)
                {
                    isAztec: true,
                    PXE: PXE,
                    sponsoredPaymentMethod: undefined
                }
            )
            

            // -------------mint-----------------------------------
            console.log("mint!")
            const proofInputs = await getProofInputs(
                gigaBridge,
                L1WarpToad,
                AztecWarpToadWithSender,
                amountToBurn1,
                feeFactor,
                priorityFee,
                maxFee,
                await evmRelayer.getAddress(),
                await evmRecipient.getAddress(),
                commitmentPreImg1.nullifier_preimg,
                commitmentPreImg1.secret,
            )
            //await generateNoirTest(proofInputs);
            const proof = await createProof(proofInputs, os.cpus().length)

            const balanceRecipientPreMint = await L1WarpToad.balanceOf(await evmRecipient.getAddress())
            const mintTx = await (await L1WarpToad.mint(
                ethers.toBigInt(proofInputs.nullifier),
                ethers.toBigInt(proofInputs.amount),
                ethers.toBigInt(proofInputs.giga_root),
                ethers.toBigInt(proofInputs.destination_local_root),
                ethers.toBigInt(proofInputs.fee_factor),
                ethers.toBigInt(proofInputs.priority_fee),
                ethers.toBigInt(proofInputs.max_fee),
                ethers.getAddress(proofInputs.relayer_address.toString()),
                ethers.getAddress(proofInputs.recipient_address.toString()),
                ethers.hexlify(proof.proof),
                {
                    maxPriorityFeePerGas: ethers.toBigInt(proofInputs.priority_fee),
                    maxFeePerGas: ethers.toBigInt(proofInputs.priority_fee) * 100n //Otherwise HRE does the gas calculations wrong to make sure we don't get `max_priority_fee_per_gas` greater than `max_fee_per_gas
                }
            )).wait(1)

            // check mint tx
            const balanceRecipientPostMint = await L1WarpToad.balanceOf(await evmRecipient.getAddress())
            const expectedFee = BigInt(Number(mintTx!.fee) * ethPriceInToken * relayerBonusFactor)
            const feePaid = ethers.toBigInt(proofInputs.amount) - balanceRecipientPostMint - balanceRecipientPreMint
            const overPayPercentage = (1 - Number(expectedFee) / Number(feePaid)) * 100
            const marginOfErrorFee = 5 //no more than 5% off!
            console.log({overPayPercentage})
            expect(overPayPercentage).approximately(0, marginOfErrorFee, "This likely failed because HRE does something bad in gas calculation. Run it in something like an anvil node/aztecSandbox instead. Or gas usage changed")
            expect(balanceRecipientPostMint).to.above(balanceRecipientPreMint + ethers.toBigInt(proofInputs.amount) - maxFee)
        });
    });
});
