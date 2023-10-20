require('dotenv').config()

const fs = require('fs')
const { signAndSend, signCertificate, OnChainRegistry, options, PinkCodePromise } = require('@phala/sdk')
const { ApiPromise, Keyring, WsProvider } = require('@polkadot/api')

const argv = require('arg')({
  '--ws': String,
  '--suri': String,
  '--clusterId': String,
  '--worker': String,
  '--pruntimeURL': String
})

async function main() {
  const targetFile = 'abis/fat_badges.contract'
  if (!fs.existsSync(targetFile)) {
    console.log(`${targetFile} not exists.`)
    return process.exit(1)
  }
  const contractFile = JSON.parse(fs.readFileSync(targetFile))

  const ws = argv['--ws'] || process.env.ENDPOINT
  const suri = argv['--suri'] || process.env.POLKADOT_ACCOUNT
  if (!ws) {
    throw new Error('No ws endpoint specified')
  }
  if (!suri) {
    throw new Error('No suri specified')
  }
  const clusterId = argv['--clusterId']
  const workerId = argv['--worker']
  const pruntimeURL = argv['--pruntimeURL']

  const connectionOptions = {}
  if (clusterId) {
    connectionOptions.clusterId = clusterId
  }
  if (workerId) {
    connectionOptions.workerId = workerId
  } else if (pruntimeURL) {
    connectionOptions.pruntimeURL = pruntimeURL
  }

  const apiPromise = await ApiPromise.create(options({
    provider: new WsProvider(ws),
    noInitWarn: true
  }))
  const registry = await OnChainRegistry.create(apiPromise, connectionOptions)

  const keyring = new Keyring({ type: 'sr25519' })
  const pair = keyring.addFromUri(suri)
  const cert = await signCertificate({ pair })

  console.log('Connected via', ws)
  console.log('Cluster ID:', registry.clusterId)
  console.log('Worker ID:', registry.remotePubkey)
  console.log('Worker Endpoint:', registry.pruntimeURL)

  ///
  /// All prepare conditions ready.
  ///

  //
  // setUp: Upload & instantiate the contract
  //
  const codePromise = new PinkCodePromise(apiPromise, registry, contractFile, contractFile.source.wasm)
  const uploadResult = await signAndSend(codePromise.upload(), pair)
  await uploadResult.waitFinalized(pair, cert)
  const instantiateResult = await uploadResult.blueprint.send.new({ pair, cert, address: cert.address })
  await instantiateResult.waitFinalized()
  const { contractId, contract } = instantiateResult
  console.log('Contract uploaded & instantiated: ', contractId)
  //
  // END: setUp
  //

  //
  // NOTE: with the `{ plain: true }`, you can debugging the payload with subscan; it also means, your payload
  //       will visible to everyone. So use it carefully, and ensure when you debugging with it, no sensitive
  //       data in the payload.
  //
  //
  const result = await contract.send.newBadge(
    { pair, cert, address: cert.address, plain: true },
   `Badge${new Date().getTime()}`
  )
  await result.waitFinalized()
  console.log('trx submited')
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
