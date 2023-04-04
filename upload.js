require('dotenv').config()

const util = require('util')
const fs = require('fs')
const Phala = require('@phala/sdk')
const { typeDefinitions } = require('@polkadot/types');
const { ApiPromise, Keyring, WsProvider } = require('@polkadot/api')
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
              hash: result.status.asInBlock.toString(),
              // @ts-ignore
              events: result.toHuman().events,
              result,
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

  // const abi = new Abi(contractFile)
  // console.log(abi.constructors)

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
  const user = pair = keyring.addFromUri(process.env.POLKADOT_ACCOUNT)
  const accountInfo = await api.query.system.account(user.address)
  const free = accountInfo.data.free.div(new BN(1e10)) / 100
  if (free < 20) {
    console.log('Not enough balance. Please transfer some tokens not less then 20 PHA to', user.address)
    return process.exit(1)
  }
  console.log(`Account ${user.address} has ${free} PHA.`)

  const phatRegistry = await Phala.OnChainRegistry.create(api)

  const clusterId = phatRegistry.clusterId
  // const clusterInfo = phatRegistry.clusterInfo
  const pruntimeURL = phatRegistry.pruntimeURL
  console.log('Cluster ID:', clusterId)
  console.log('Pruntime Endpoint URL:', pruntimeURL)

  const balance = await phatRegistry.getClusterBalance(user, user.address)
  console.log('Cluster Balance:', balance.total.toPrimitive() / 1e12, balance.free.toPrimitive() / 1e12)

  if ((balance.free.toPrimitive() / 1e12) < 10) {
    console.log('Transfer to cluster...')
    try {
      await signAndSend(phatRegistry.transferToCluster(user.address, 1e12 * 10), user)
    } catch (err) {
      console.log(`Transfer to cluster failed: ${err}`)
      console.error(err)
      return process.exit(1)
    }
  }

  //
  // Step 1: Upload with PinkCodePromise
  //
  console.log('Upload codes...')
  const codePromise = new Phala.PinkCodePromise(api, phatRegistry, contractFile, contractFile.source.wasm)
  const { result: uploadResult } = await signAndSend(codePromise.tx.new({}), user)
  {
    const cert = await Phala.signCertificate({ pair, api })
    await uploadResult.waitFinalized(user, cert, 120_000)
  }

  console.log('Code ready in cluster.')

  //
  // Step 2: instantiate with PinkBlueprintPromise
  //
  console.log('Instantiating...')
  let instantiateResult
  try {
    const { blueprint } = uploadResult // Or use `blueprintPromise` instead: new Phala.PinkBlueprintPromise(api, phatRegistry, contractFile, contractFile.source.hash)
    const cert = await Phala.signCertificate({ pair, api })
    const { gasRequired, storageDeposit, salt } = await blueprint.query.new(user, cert) // Support instantiate arguments.
    const response = await signAndSend(
      blueprint.tx.new({ gasLimit: gasRequired.refTime, storageDepositLimit: storageDeposit.isCharge ? storageDeposit.asCharge : null, salt }),
      user
    )
    instantiateResult = response.result
    await instantiateResult.waitFinalized()
  } catch (err) {
    console.log(`Instantiate failed: ${err}`)
    console.error(err)
    return process.exit(1)
  }

  const { contractId, contract } = instantiateResult
  console.log('Contract uploaded & instantiated: ', contractId)

  //
  // Step 3: adjust staking for the contract (optional)
  //
  console.info(`Auto staking to the contract...`);
  await signAndSend(api.tx.phalaPhatTokenomic.adjustStake(contractId, 1e10), user)

  //
  // query test. 
  //
  const cert = await Phala.signCertificate({ pair, api })
  const totalQueryResponse = await contract.query.getTotalBadges(user, cert)
  const total = totalQueryResponse.output.toJSON()
  console.log('total:', total)
}

const main = upload_and_instantiate_contract

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
