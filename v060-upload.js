require('dotenv').config()

const fs = require('fs')
const { signAndSend, signCertificate, OnChainRegistry, options, PinkCodePromise, KeyringPairProvider } = require('@phala/sdk')
const { ApiPromise, Keyring, WsProvider } = require('@polkadot/api')
const BN = require('bn.js')

async function main() {
  const endpoint = process.env.ENDPOINT
  const account = process.env.POLKADOT_ACCOUNT
  if (!endpoint || !account) {
    console.log('Please create your own .env file with `ENDPOINT` and `POLKADOT_ACCOUNT`.')
    return process.exit(1)
  }
  const targetFile = 'abis/fat_badges.contract'
  // const targetFile = process.argv[2]
  // if (!endpoint || !targetFile) {
  //   console.log('Usage: node upload.js [path/to/yours.contract]')
  //   return process.exit(1)
  // }
  if (!fs.existsSync(targetFile)) {
    console.log(`${targetFile} not exists.`)
    return process.exit(1)
  }
  const contractFile = JSON.parse(fs.readFileSync(targetFile))

  // Initialization
  console.log('Connecting to', endpoint, '...')
  const provider = new WsProvider(endpoint)
  const api = await ApiPromise.create(options({ provider, noInitWarn: true }))
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

  const phatRegistry = await OnChainRegistry.create(api)

  const clusterId = phatRegistry.clusterId
  // const clusterInfo = phatRegistry.clusterInfo
  const pruntimeURL = phatRegistry.pruntimeURL
  console.log('Cluster ID:', clusterId)
  console.log('Pruntime Endpoint URL:', pruntimeURL)

  const balance = await phatRegistry.getClusterBalance(user.address)
  console.log('Cluster Balance:', balance.total.toPrimitive() / 1e12, balance.free.toPrimitive() / 1e12)

  if ((balance.free.toPrimitive() / 1e12) < 500) {
    console.log('Transfer to cluster...')
    try {
      await signAndSend(phatRegistry.transferToCluster(user.address, 1e12 * 500), user)
    } catch (err) {
      console.log(`Transfer to cluster failed: ${err}`)
      // console.error(err)
      return process.exit(1)
    }
  }

  const cert = await signCertificate({ pair })
  ///
  /// All prepare conditions ready.
  ///

  //
  // Step 1: Upload with PinkCodePromise
  //
  console.log('Upload codes...')
  const codePromise = new PinkCodePromise(phatRegistry, contractFile, contractFile.source.wasm)
  const uploadResult = await signAndSend(codePromise.tx.new(), user)
  // await uploadResult.waitFinalized(user, cert)
  await uploadResult.waitFinalized()
  console.log('Code ready in cluster.')

  //
  // Step 2: instantiate with PinkBlueprintPromise
  //
  console.log('Instantiating...')
  const instantiateResult = await uploadResult.blueprint.send.new({ pair, cert, address: cert.address })
  await instantiateResult.waitFinalized()

  const { contractId, contract } = instantiateResult
  console.log('Contract uploaded & instantiated: ', contractId)

  //
  // Step 3: adjust staking for the contract (optional)
  //
  console.info(`Auto staking to the contract...`);
  await signAndSend(api.tx.phalaPhatTokenomic.adjustStake(contractId, 1e10), user)

  //
  // New in v0.6.x: bind provider & proxy based flavor.
  //
  contract.provider = new KeyringPairProvider(api, pair)

  //
  // query test. 
  //
  const old_call = await contract.query.getTotalBadges(user.address, { cert })
  const new_call = await contract.q.getTotalBadges()
  console.log('total:', old_call.output.toJSON(), new_call.output.toJSON(), old_call.output.toJSON() === new_call.output.toJSON())

  //
  // trx with auto-deposit test.
  //
  const name = `Badge${new Date().getTime()}`
  // const result = await contract.send.newBadge({ pair, cert, address: cert.address }, name)
  const result = await contract.exec.newBadge({ args: [name] })
  await result.waitFinalized()
  console.log('trx submited with nonce:', result.nonce)

  //
  // query data after trx.
  //
  // const { output: after } = await contract.query.getTotalBadges(pair.address, { cert })
  const { output: after } = await contract.q.getTotalBadges()
  console.log('total:', after.toJSON())
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
