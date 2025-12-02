// Hardhat 
const hre = require("hardhat");
import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

// Test fixtures
import { l1ToL1Fixture } from "./fixtures/deployments";

// Utilities
import { ethers } from "ethers";
import os from 'os';
import { WithdrawVerifier__factory } from "../typechain-types";
import { gasCostPerChain } from "../scripts/lib/constants";
import { hashPreCommitment } from "../scripts/lib/hashing";
import { calculateFeeFactor, createProof, getProofInputs } from "../scripts/lib/proving";
import { sendGigaRoot } from "../scripts/lib/bridging";

describe("WarpToad L1 → L1", function () {

    describe("deployment", function () {
        it("Should deploy all L1 contracts successfully", async function () {
            const contracts = await loadFixture(l1ToL1Fixture);
            
            // Verify contracts are deployed
            expect(await contracts.L1WarpToad.getAddress()).to.be.properAddress;
            expect(await contracts.nativeToken.getAddress()).to.be.properAddress;
            expect(await contracts.gigaBridge.getAddress()).to.be.properAddress;
        });
    });

    describe("burnL1MintL1", function () {
        it("Should burn on L1 and mint on L1 with ZK proof", async function () {
            //----------------------setup--------------------------------
            const contracts = await loadFixture(l1ToL1Fixture);
            const { L1WarpToad, nativeToken, evmWallets, gigaBridge, L1WarpToadWithSender, nativeTokenWithSender } = contracts;
            
            const evmRelayer = evmWallets[1];
            const evmRecipient = evmWallets[3];

            //@ts-ignore
            const provider = hre.ethers.provider;
            // Note: Tokens already wrapped via fixture (initialBalance set there)
            const L1WarpToadWithRelayer = L1WarpToad.connect(evmRelayer);


            // ------------------ burn -----------------------------------------
            console.log("burning!")
            const amountToBurn1 = 5n * 10n ** 18n
            const amountToBurn2 = 4n * 10n ** 18n

            const { chainId: chainIdEvmProvider } = await provider.getNetwork()
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

            const preCommitment1 = hashPreCommitment(commitmentPreImg1.nullifier_preimg, commitmentPreImg1.secret, commitmentPreImg1.destination_chain_id) 
            await (await L1WarpToadWithSender.burn(preCommitment1, commitmentPreImg1.amount)).wait(1)


            // ------------------make a root------------------------------------
            // our merkle tree is lazy. So we need to wake him up and store a the local root manually!!
            await (await L1WarpToadWithRelayer.storeLocalRootInHistory()).wait(1)
            // no need to bridge we're staying on L1. How comfy! 
            // but we do need a gigaRoot since we just deployed and it doesn't even exist yet!

            // const {gigaRootUpdateTx} = await updateGigaRoot(
            //     gigaBridge,
            //     localRootProviders,
            // )
            const gigaRootRecipients = [await L1WarpToad.getAddress()] // only me. effectively no altruism :P
            const {sendGigaRootTx} = await sendGigaRoot(
                gigaBridge,
                gigaRootRecipients,
                [] // no payable gigaRootRecipients
            )



            // -------------mint-----------------------------------
            // relayer fee logic
            const priorityFee = 100000000n;// in wei (this is 0.1 gwei)
            const maxFee = 5n * 10n ** 18n;   // i don't want to pay no more than 5 usdc okay cool thanks
            const ethPriceInToken = 1700.34 // how much tokens you need to buy 1 eth. In this case 1700 usdc tokens to buy 1 eth. Cheap!
            // L1 evm estimate. re-estimating this on every tx will require you to make a zk proof twice so i hardcoded. You should get a up to date value for L2's with alternative gas pricing from backend/scripts/dev_op/estimateGas.ts
            const gasCost = Number(gasCostPerChain[Number(chainIdEvmProvider)])
            const relayerBonusFactor = 1.1 // 10% earnings on gas fees! 
            const feeFactor = calculateFeeFactor(ethPriceInToken, gasCost, relayerBonusFactor);

            console.log("mint!")
            const proofInputs = await getProofInputs(
                gigaBridge,
                L1WarpToadWithSender,
                L1WarpToadWithSender, 
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
            //@ts-ignore
            const onchainPublicInputs = await L1WarpToad._formatPublicInputs(proofInputs.nullifier, proofInputs.chain_id, proofInputs.amount, proofInputs.giga_root, proofInputs.destination_local_root, proofInputs.fee_factor, proofInputs.priority_fee, proofInputs.max_fee, proofInputs.relayer_address, proofInputs.recipient_address);
    
            console.log({jsPubInputs: proof.publicInputs, onchainPublicInputs})
            const withdrawVerifier = WithdrawVerifier__factory.connect(await L1WarpToad.withdrawVerifier(), provider)
            const jsVerifiedOnchain = await withdrawVerifier.verify(proof.proof, proof.publicInputs )
            console.log({jsVerifiedOnchain})
            const balanceRecipientPreMint = await L1WarpToadWithSender.balanceOf(await evmRecipient.getAddress())

            const mintTx = await (await L1WarpToadWithRelayer.mint(
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
            const marginOfErrorFee = 5 //no more than 5% off! note L1ToL1 is 3.2% cheaper than aztecToL1 idk why but the gasUsed can change a lott likely higher than 5%
            console.log({overPayPercentage})
            expect(overPayPercentage).approximately(0, marginOfErrorFee, "This likely failed because HRE does something bad in gas calculation. Run it in something like an anvil node/aztecSandbox instead. Or gas usage changed")
            expect(balanceRecipientPostMint).to.above(balanceRecipientPreMint + ethers.toBigInt(proofInputs.amount) - maxFee)
        });
    });
});
