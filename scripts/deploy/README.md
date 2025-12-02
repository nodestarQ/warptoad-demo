# WarpToad Deployment Guide

This directory contains all deployment scripts for the WarpToad bridge system.

## 🚀 Quick Start

### Prerequisites
1. **Aztec Sandbox must be running:**
   ```bash
   aztec sandbox
   ```

2. **Contracts must be compiled:**
   ```bash
   pnpm run aztec:build
   ```

### Deploy Everything
```bash
pnpm run deploy:local          # Normal output
pnpm run deploy:local:verbose  # Detailed output
```

This single command:
- ✅ Deploys all EVM contracts on L1
- ✅ Deploys all Aztec contracts on L2
- ✅ Initializes all connections
- ✅ Saves deployment addresses

---

## 📁 Directory Structure

```
scripts/deploy/
├── utils/                          # Shared utilities
│   ├── aztecUtils.ts              # Aztec connection, wallet management
│   ├── evmUtils.ts                # EVM deployment helpers
│   └── logger.ts                  # Logging with verbosity control
├── aztec/
│   ├── deployAztec.ts             # Aztec contract deployment
│   ├── deployer-keys.json         # Wallet keys (gitignored)
│   └── aztecDeployments/          # Deployment addresses
│       ├── 31337/                 # Sandbox
│       └── 11155111/              # Sepolia testnet
├── deployEvm.ts                   # EVM deployment (uses Ignition)
├── initializeContracts.ts         # Connect all contracts
└── deployAll.ts                   # Main orchestrator
```

---

## 📝 Deployment Scripts

### 1. `deployAll.ts` - Main Orchestrator

**Usage:**
```bash
tsx scripts/deploy/deployAll.ts
tsx scripts/deploy/deployAll.ts --verbose
```

**What it does:**
1. Deploys all EVM contracts (L1)
2. Deploys all Aztec contracts (L2)
3. Initializes all connections
4. Prints deployment summary

**Output:**
- EVM addresses: `ignition/deployments/chain-31337/`
- Aztec addresses: `scripts/deploy/aztec/aztecDeployments/31337/deployed_addresses.json`

---

### 2. `deployEvm.ts` - EVM Deployment

**Usage:**
```bash
pnpm run deploy:evm
```

**What it deploys:**
- PoseidonT3 library
- LazyIMT library
- USDcoin (native token mock)
- WithdrawVerifier (ZK verifier)
- L1WarpToad
- GigaBridge
- L1AztecBridgeAdapter

**Uses Hardhat Ignition** for deterministic deployments.

---

### 3. `aztec/deployAztec.ts` - Aztec Deployment

**Usage:**
```bash
pnpm run deploy:aztec
```

**What it deploys:**
- WarpToadCore (Aztec bridge contract)
- L2AztecBridgeAdapter

**Wallet Management:**
- Creates/loads deployer wallet from `deployer-keys.json`
- Auto-generates keys if not present
- Keys are gitignored for security

---

### 4. `initializeContracts.ts` - Initialize Connections

**What it does:**
1. Connects L1AztecBridgeAdapter to Aztec registry and GigaBridge
2. Connects L1WarpToad to GigaBridge (self as adapter)
3. Connects AztecWarpToad to both adapters

**Called automatically** by `deployAll.ts` after deployment.

---

## 🔧 Utilities

### `utils/aztecUtils.ts`
- `initNodeClient()` - Connect to Aztec node
- `initPXE()` - Initialize PXE
- `connectToAztecSandbox()` - Combined connection
- `getOrCreateDeployerWallet()` - Wallet management
- `getSponsoredFPCInstance()` - Fee payment contract
- `isSandbox()` - Environment detection

### `utils/evmUtils.ts`
- `saveDeploymentAddresses()` - Save to JSON
- `loadDeploymentAddresses()` - Load from JSON
- `getDeploymentPath()` - Path management
- `validateDeployment()` - Validation
- `printDeploymentSummary()` - Console output

### `utils/logger.ts`
- `log()` - Main logging (info/success/warning/error/debug)
- `logSection()` - Section headers
- `logDeployment()` - Contract deployment formatting
- `logVerbose()` - Verbose-only output
- `setVerbose()` - Enable detailed logging

---

## 🎯 Hardhat Ignition Modules

Located in `ignition/modules/`:

### `L1Libraries.ts`
Deploys cryptographic libraries:
- PoseidonT3
- LazyIMT (depends on PoseidonT3)

### `L1WarpToadModule.ts`
Deploys L1 WarpToad system:
- USDcoin (native token)
- WithdrawVerifier
- L1WarpToad

### `L1InfraModule.ts`
Deploys infrastructure:
- L1AztecBridgeAdapter
- GigaBridge

---

## 📦 Deployment Addresses

### EVM (Hardhat Ignition)
```
ignition/deployments/chain-31337/
├── deployed_addresses.json
├── journal.jsonl
└── ... (Ignition artifacts)
```

### Aztec
```
scripts/deploy/aztec/aztecDeployments/31337/deployed_addresses.json
```

**Example structure:**
```json
{
  "AztecWarpToad": "0x...",
  "L2AztecBridgeAdapter": "0x...",
  "DeployerWallet": "0x..."
}
```

---

## 🔍 Troubleshooting

### "Cannot connect to Aztec Sandbox"
**Solution:** Make sure Aztec Sandbox is running:
```bash
aztec sandbox
```

### "Deployment addresses not found"
**Solution:** Run full deployment:
```bash
pnpm run deploy:local
```

### "Contract already deployed" error
**Solution:** Hardhat Ignition reuses deployments. For a fresh start:
```bash
rm -rf ignition/deployments/chain-31337/
rm -rf scripts/deploy/aztec/aztecDeployments/31337/
pnpm run deploy:local
```

### Verbose output for debugging
**Solution:** Use the verbose flag:
```bash
pnpm run deploy:local:verbose
```

---

## 🔒 Security Notes

- **deployer-keys.json** is gitignored
- Never commit real private keys
- Sandbox uses test keys only
- For testnet/mainnet, use proper key management

---

## 🎓 Advanced Usage

### Deploy to specific network
```bash
# EVM to Sepolia
npx hardhat run scripts/deploy/deployEvm.ts --network sepolia

# Aztec to testnet (requires AZTEC_NODE_URL env var)
AZTEC_NODE_URL=https://api.aztec.network tsx scripts/deploy/aztec/deployAztec.ts
```

### Programmatic usage
```typescript
import { deployAll } from "./scripts/deploy/deployAll.js";

const { evmContracts, aztecContracts } = await deployAll(verbose);
```

---

## 📚 Related Documentation

- **AGENTS.md** - Full project documentation
- **test/fixtures/deployments.ts** - Test fixture usage
- **README.md** - Project overview
