require('dotenv').config()

const { options, OnChainRegistry } = require('@phala/sdk')
const { ApiPromise, WsProvider } = require('@polkadot/api')

const argv = require('arg')({
  '--ws': String,
  '--clusterId': String,
  '--pruntimeURL': String
})

async function main() {
  const ws = argv['--ws'] || process.env.ENDPOINT
  if (!ws) {
    throw new Error('No ws endpoint specified')
  }
  const partialInfo = {
    clusterId: argv['--clusterId'],
    pruntimeURL: argv['--pruntimeURL'],
  }
  if (!partialInfo.pruntimeURL) {
    throw new Error('You need specified --pruntimeURL for the PRuntime RPC connected to.')
  }

  const apiPromise = await ApiPromise.create(options({
    provider: new WsProvider(ws),
    noInitWarn: true
  }))
  const registry = new OnChainRegistry(apiPromise)
  await registry.connect(partialInfo)

  console.log('Connected')
  console.log(registry.clusterInfo.toJSON())
  console.log(registry.workerInfo)

  console.log('DONE.')
}

main().catch(console.error).finally(() => process.exit())
