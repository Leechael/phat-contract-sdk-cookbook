# Phat Contract SDK Cookbook

## Usage

1. Install dependencies: `yarn`
2. Create your own `.env` file and set up endpoint and your mnemonic in it. You can use `//Alice`: `cp env.example .env`


## Recipes

### List Available Cluster via Specified RPC Endpoint

```shell
node list-cluster.js --ws wss://poc6.phala.network/ws
```

List all available clusters and configurations. You must specified RPC endpoint via `--ws`.

The information listed includes cluster permission, system contract ID, gas price, and storage deposit unit price.

It will also list all public workers in the cluster.


### Get Cluster Information

```shell
node get-cluster-info.js --ws wss://poc6.phala.network/ws
```

Inspecting the critical driver contract IDs and checking their version and running state, if applicable.

There four critical driver contracts:

- System Contract.
- PinkLogger Contract. It runs as a SideVM contract and collects log outputs for each Phat Contract. However, it only keeps a total of records that fit within the `memoryCapacity`.
- JsDelegate Contract. The QuickJS runtime contract.
- SidevmOperation Contract. The contract responsible for performing SideVM operations.


### Get Worker Information

```shell
node get-worker-info.js --ws wss://poc6.phala.network/ws --worker 0xac5087e0e21de2b2637511e6710db74e5ec2dbc3f02db76ffa02662878ecf333
// OR
node get-worker-info.js --ws wss://poc6.phala.network/ws --pruntimeURL https://phat-cluster-us.phala.network/poc6/pruntime/0xac5087e0
```

Retrieve the specified worker's PRuntime Node information to determine its health status.

You can retrieve information using either worker ID or endpoint URL of PRuntime.

If any errors are displayed on the screen, it indicates that the worker is not functional or accessible from your region.

This script checks the best finalized block number and the last block number synced to PRuntime. If the gap between these two numbers is too large, we can consider this PRuntime Node as unhealthy.


### Upload & instantiate Phat Contract

```shell
node upload.js path/to/your.contract
```


### Pulling Logs

```shell
node tail.js --ws wss://poc6.phala.network/ws [contractId]

```

Keep pulling logs from the first cluster found in specified RPC endpoint. 

This script also have optional arguments:

- `ContractID`. Optional. You can specified the Contract ID and only log records specified for this Contract ID will retrieve.
- `--skip`: Optional. Specified the log record type you want skip, it can set multiple times.  The available log record types include:
    - `Log`
    - `MessageOutput`
    - `QueryIn`
    - `Event`
- `--interval`: Optional. The offchain query interval duration, in milliseconds, between each call to pull log records.


### Pulling Logs without connect to On-Chain RPC


```shell
node tail-offchain.js --pruntime https://phat-cluster-us.phala.network/poc6/pruntime/0xac5087e0 --remotePubkey 0xac5087e0e21de2b2637511e6710db74e5ec2dbc3f02db76ffa02662878ecf333 --loggerContractId 0x1c825d94cdacab15de009d169e0f4893b5fd33743fba010fee277a9e529431ed --systemContractId 0x7ea22b5235071e0cf239fadac406f93e4b0f3dd1f29d4d0a798945b43dcc0315
```

This script continuously pulls logs from a specified PRuntime Worker. The main difference from `tail.js` is that this script requires you to provide all the necessary arguments to create the `PinkLoggerContractPromise`. This allows it to connect directly to the specified PRuntime node and avoid any on-chain queries.

This script also have optional arguments:

- `ContractID`. Optional. You can specified the Contract ID and only log records specified for this Contract ID will retrieve.
- `--skip`: Optional. Specified the log record type you want skip, it can set multiple times.  The available log record types include:
    - `Log`
    - `MessageOutput`
    - `QueryIn`
    - `Event`
- `--interval`: Optional. The offchain query interval duration, in milliseconds, between each call to pull log records.
