# warptoad-demo
a demo deployable working demo for warptoad v0


# install 

make sure to install pnpm 
```shell
nvm use 22.10
npm install -g pnpm@latest-10
pnpm install;
```

make sure you're on aztec 3.0.0-devnet.5
```shell
aztec-up 3.0.0-devnet.5
```
install noir and backend
```shell
bbup -v 0.72.1;
noirup -v 1.0.0-beta.5;
```
## compile contracts
### aztec
```shell
pnpm run aztec:build
```

## run sandbox
run this in a new shell
```shell
VERSION=3.0.0-devnet.5 aztec start --sandbox --rollup-version 1714840162
```

# deploy test token 

```shell
pnpm hardhat ignition deploy ignition/modules/TestToken.ts --network aztecSandbox;
```

# deploy L1 

NATIVE_TOKEN_ADDRESS=0xUrNativeTokenAddress yarn workspace @warp-toad/backend
```shell
pnpm hardhat run scripts/deploy/L1/deploy.ts --network aztecSandbox;
```