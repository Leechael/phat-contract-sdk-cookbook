require('dotenv').config()

const util = require('util')
const fs = require('fs')
const Phala = require('@phala/sdk')
const { typeDefinitions } = require('@polkadot/types');
const { ApiPromise, Keyring, WsProvider } = require('@polkadot/api')
// const { ContractPromise } = require('@polkadot/api-contract')
const R = require('ramda')
const crypto = require('crypto')
const BN = require('bn.js')


function inspect(obj) {
  return util.inspect(obj, false, null, true)
}

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

async function txAccepted(txBuilder, signer, shouldSucceed = true) {
    return await new Promise(async (resolve, _reject) => {
        const unsub = await txBuilder.signAndSend(signer, { nonce: -1 }, (result) => {
            if (result.status.isInBlock) {
                let error;
                for (const e of result.events) {
                    const { event: { data, method, section } } = e;
                    if (section === 'system' && method === 'ExtrinsicFailed') {
                        if (shouldSucceed) {
                            error = data[0];
                        } else {
                            unsub();
                            resolve(error);
                        }
                    }
                }
                if (error) {
                    console.error(`Extrinsic failed with error: ${error}`);
                }
                unsub();
                resolve({
                    hash: result.status.asInBlock,
                    events: result.events,
                });
            } else if (result.status.isInvalid) {
                assert.fail('Invalid transaction');
                unsub();
                resolve();
            }
        });
    });
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

//
//
//

async function upload_and_instantiate_contract() {
  const endpoint = process.env.ENDPOINT
  const account = process.env.POLKADOT_ACCOUNT
  if (!endpoint || !account) {
    console.log('Please create your own .env file with `ENDPOINT` and `POLKADOT_ACCOUNT`.')
    return process.exit(1)
  }
  const targetFile = process.argv[2]
  if (!endpoint || !targetFile) {
    console.log('Usage: node upload.js [path/to/yours.contract]')
    return process.exit(1)
  }
  if (!fs.existsSync(targetFile)) {
    console.log(`${targetFile} not exists.`)
    return process.exit(1)
  }
  const contractFile = JSON.parse(fs.readFileSync(targetFile))

  // Initialization
  console.log('Connecting to', endpoint, '...')
  const api = await ApiPromise.create({
    provider: new WsProvider(endpoint),
    types: {
      ...Phala.types,
      ...typeDefinitions,
    },
    noInitWarn: true,
  })
  console.log('Connected.')

  const keyring = new Keyring({ type: 'sr25519' })
  const user = keyring.addFromUri(process.env.POLKADOT_ACCOUNT)
  const accountInfo = await api.query.system.account(user.address)
  const free = accountInfo.data.free.div(new BN(1e10)) / 100
  if (free < 20) {
    console.log('Not enough balance. Please transfer some tokens not less then 20 PHA to', user.address)
    return process.exit(1)
  }
  console.log(`Account ${user.address} has ${free} PHA.`)

  const phatRegistry = await Phala.OnChainRegistry.create(api)

  const clusterId = phatRegistry.clusterId
  const clusterInfo = phatRegistry.clusterInfo
  const pruntimeURL = phatRegistry.pruntimeURL
  console.log('Cluster ID:', clusterId)
  console.log('PruntimeURL:', pruntimeURL)

  //
  // Pick the instantiate function
  //

  const initSelector = R.pipe(
    R.filter((c) => c.label === 'default' || c.label === 'new'),
    R.sortBy((c) => c.args.length),
    i => R.head(i),
    (i) => i ? i.selector : undefined,
  )(contractFile.V3.spec.constructors)
  if (!initSelector) {
    console.log('No default constructor found.')
    return process.exit(1)
  }
  console.log('Target Contract codeHash & initSelector: ', contractFile.source.hash, initSelector)

  /**
   * Upload & instantiate contract.
   */

  console.log('Transfer to cluster...')
  try {
    await signAndSend(api.tx.phalaFatContracts.transferToCluster(2e12, clusterId, user.address), user)
  } catch (err) {
    console.log(`Transfer to cluster failed: ${err}`)
    console.error(err)
    return process.exit(1)
  }

  console.log('Uploading to cluster...')
  try {
    await signAndSend(api.tx.phalaFatContracts.clusterUploadResource(clusterId, 'InkCode', contractFile.source.wasm), user)
  } catch (err) {
    console.log(`Upload failed: ${err}`)
    console.error(err)
    return process.exit(1)
  }

  // The sleep may not need
  await sleep(10_000);

  //
  // Estimate instantiate fee.
  //
  const salt = hex(crypto.randomBytes(4))
  try {
    console.log('Uploaded. Estimate instantiate fee...')
    const { instantiate } = await Phala.create({
      api: api.clone(),
      baseURL: pruntimeURL,
      contractId: clusterInfo.systemContract,
      autoDeposit: true
    })
    const cert = await Phala.signCertificate({ api, pair: user })
    console.log('codeHash: ', contractFile.source.hash)
    const result = await instantiate({
      codeHash: contractFile.source.hash,
      salt,
      instantiateData: initSelector,
      deposit: 0,
      transfer: 0,
    }, cert)
    console.log('estimate instantiate fee: ', initSelector, util.inspect(result.toHuman(), false, null, true))
  } catch (err) {
    console.log(`Estimate instantiate fee failed: ${err}`)
    console.error(err)
    return process.exit(1)
  }

  console.log('Instantiating...')
  let instantiateResult
  try {
    instantiateResult = await signAndSend(
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
  } catch (err) {
    console.log(`Instantiate failed: ${err}`)
    console.error(err)
    return process.exit(1)
  }

  const instantiateEvent = R.find(R.pathEq(['event', 'method'], 'Instantiating'), instantiateResult.events)
  console.log('instantiateEvent: ', instantiateEvent)
  const contractId = R.path(['event', 'data', 'contract'], instantiateEvent)
  console.log('Instantiated contract ID: ', contractId)

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

const main = upload_and_instantiate_contract

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
