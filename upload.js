require('dotenv').config()

const util = require('util')
const fs = require('fs')
const Phala = require('@phala/sdk')
const { typeDefinitions } = require('@polkadot/types');
const { ApiPromise, wsProvider, Keyring, WsProvider } = require('@polkadot/api')
const { ContractPromise } = require('@polkadot/api-contract')
const R = require('ramda')
const crypto = require('crypto')

function hex(b) {
    if (typeof b != "string") {
        b = Buffer.from(b).toString('hex');
    }
    if (!b.startsWith('0x')) {
        return '0x' + b;
    } else {
        return b;
    }
}

async function sleep(t) {
  await new Promise(resolve => {
      setTimeout(resolve, t);
  });
}

const signAndSend = (target, signer) => {
  return new Promise(async (resolve, reject) => {
    // Ready -> Broadcast -> InBlock -> Finalized
    const unsub = await target.signAndSend(
      signer, (result) => {
        const humanized = result.toHuman()          
        if (result.status.isInBlock) {
          let error;
          for (const e of result.events) {
            const { event: { data, method, section } } = e;
            if (section === 'system' && method === 'ExtrinsicFailed') {
              error = data[0];
            }
          }
          // @ts-ignore
          unsub();
          if (error) {
            reject(error);
          } else {
            resolve({
              hash: result.status.asInBlock.toHuman(),
              // @ts-ignore
              events: result.toHuman().events,
            });
          }
        } else if (result.status.isInvalid) {
          // @ts-ignore
          unsub();
          reject('Invalid transaction');
        }
      }
    )
  })
}

async function checkUntil(async_fn, timeout) {
    const t0 = new Date().getTime();
    while (true) {
        if (await async_fn()) {
            return;
        }
        const t = new Date().getTime();
        if (t - t0 >= timeout) {
            throw new Error('timeout');
        }
        await sleep(100);
    }
}

async function checkUntilEq(async_fn, expected, timeout, verbose=true) {
  const t0 = new Date().getTime();
  let lastActual = undefined;
  while (true) {
      const actual = await async_fn();
      if (actual === expected) {
          return;
      }
      if (actual !== lastActual && verbose) {
          console.debug(`Waiting... (current = ${actual}, expected = ${expected})`)
          lastActual = actual;
      }
      const t = new Date().getTime();
      if (t - t0 >= timeout) {
          throw new Error('timeout');
      }
      await sleep(100);
  }
}

async function main() {
  const endpoint = process.argv[2]
  const targetFile = process.argv[3]
  if (!endpoint || !targetFile) {
    console.log('Usage: node upload.js [ws://your_endpoint_addr:port] [path/to/yours.contract]')
    return process.exit(1)
  }
  if (!fs.existsSync(targetFile)) {
    console.log(`${targetFile} not exists.`)
    return process.exit(1)
  }
  if (!process.env.POLKADOT_ACCOUNT) {
    conole.log('Your need setup your account with `POLKADOT_ACCOUNT` environment.')
    return process.exit(1)
  }

  const contractFile = JSON.parse(fs.readFileSync(targetFile))

  // Initialization
  const api = await ApiPromise.create({
    provider: new WsProvider(endpoint),
    types: {
      ...Phala.types,
      ...typeDefinitions,
    },
    noInitWarn: true,
  })
  const keyring = new Keyring({ type: 'sr25519' });
  const user = keyring.addFromUri(process.env.POLKADOT_ACCOUNT)
  console.log('Operator: ', user.address)

  //
  // grab cluster & pruntime information from chain so we don't need setup manually.
  //

  const clusters = {}
  {
    const result = await api.query.phalaFatContracts.clusters.entries()
    result.forEach(([storageKey, value]) => {
      const clusterId = storageKey.toHuman()
      const clusterInfo = value.unwrap().toHuman()
      clusters[clusterId] = clusterInfo
    })
  }
  console.log('Registered clusters:', clusters)

  const clusterId = R.head(R.keys(clusters))

  // const result = await api.query.phalaFatContracts.clusterWorkers(clusterId)
  // console.log(result.toHuman())

  let pruntimeURL = ''
  {
    const result = await api.query.phalaRegistry.endpoints(...clusters[clusterId].workers)
    pruntimeURL = R.path(['V1', '0'], result.toHuman())
  }
  console.log('PruntimeURL: ', pruntimeURL)

  //
  // Pick the instantiate function
  //

  const initSelector = R.pipe(
    // R.filter((c) => c.label === 'default' || c.label === 'new'),
    R.filter((c) => c.label === 'default'),
    R.sortBy((c) => c.args.length),
    i => R.head(i),
    (i) => i ? i.selector : undefined,
  )(contractFile.V3.spec.constructors)
  console.log('Target Contract codeHash & initSelector: ', contractFile.source.hash, initSelector)

  /**
   * Upload & instantiate contract.
   */

  console.log('Transfer to cluster...')
  await signAndSend(api.tx.phalaFatContracts.transferToCluster(2e12, clusterId, user.address), user)

  console.log('Uploading to cluster...')
  await signAndSend(api.tx.phalaFatContracts.clusterUploadResource(clusterId, 'InkCode', contractFile.source.wasm), user)

  // The sleep may not need
  await sleep(10_000);

  //
  // Estimate instantiate fee.
  //
  const salt = hex(crypto.randomBytes(4))
  {
    console.log('Uploaded. Estimate instantiate fee...')
    const { instantiate } = await Phala.create({
      api: api.clone(),
      baseURL: pruntimeURL,
      contractId: clusters[clusterId].systemContract,
      autoDeposit: true
    })
    const cert = await Phala.signCertificate({ api, pair: user })
    const instantiateReturns = await instantiate({
      codeHash: contractFile.source.hash,
      salt,
      instantiateData: initSelector,
      deposit: 0,
      transfer: 0,
    }, cert)
    const response = api.createType('InkResponse', instantiateReturns)
    const rawReturns = R.path(['nonce', 'result', 'ok', 'inkMessageReturn'], response.toJSON())
    const returns = api.createType('ContractInstantiateResult', rawReturns)
    console.log('estimate instantiate fee: ', initSelector, util.inspect(returns.toHuman(), false, null, true))
  }

  console.log('Instantiating...')
  const instantiateResult = await signAndSend(
    api.tx.phalaFatContracts.instantiateContract(
      { 'WasmCode': contractFile.source.hash },
      initSelector,
      salt,
      clusterId,
      0,
      1e12,
      null,
      0
    ),
    user
  )

  const instantiateEvent = R.find(R.pathEq(['event', 'method'], 'Instantiating'), instantiateResult.events)
  console.log('instantiateEvent: ', instantiateEvent)
  const contractId = R.path(['event', 'data', 'contract'], instantiateEvent)
  console.log('Target contract ID: ', contractId)

  try {
    await checkUntilEq(
      async () => {
        const result = await api.query.phalaFatContracts.clusterContracts(clusterId)
        const contractIds = result.map(i => i.toString())
        return contractIds.filter((id) => id === contractId).length
      },
      1,
      1000 * 60
    )
  } catch (err) {
    throw new Error('Failed to check contract in cluster: may be initialized failed in cluster')
  }

  console.log(`Pooling: ensure contract exists in registry (${60 * 4} secs timeout)`)
  await checkUntil(
    async () => (await api.query.phalaRegistry.contractKeys(contractId)).isSome,
    4 * 60
  )

  console.info('Auto staking to the contract...');
  await signAndSend(
    api.tx.phalaFatTokenomic.adjustStake(
      contractId,
      1e10,  // stake 1 cent
    ),
    user
  )

  console.log('Contract uploaded & instantiated: ', contractId)
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
