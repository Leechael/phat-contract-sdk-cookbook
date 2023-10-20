require('dotenv').config()

const { options, OnChainRegistry } = require('@phala/sdk')
const { ApiPromise, WsProvider } = require('@polkadot/api')

const argv = require('arg')({
  '--ws': String,
  '--clusterId': String,
  '--worker': String,
  '--pruntimeURL': String
})

const locale = new Intl.NumberFormat('en-US')

async function main() {
  const ws = argv['--ws'] || process.env.ENDPOINT
  if (!ws) {
    throw new Error('No ws endpoint specified')
  }
  const workerId = argv['--worker']
  const pruntimeURL = argv['--pruntimeURL']
  if (!workerId && !pruntimeURL) {
    throw new Error('No worker specified: you need specified either --worker or --pruntimeURL')
  }
  const connectionOptions = {}
  if (workerId) {
    connectionOptions.workerId = workerId
  } else if (pruntimeURL) {
    connectionOptions.pruntimeURL = pruntimeURL
  }
  if (argv['--clusterId']) {
    connectionOptions.clusterId = argv['--clusterId']
  }

  const apiPromise = await ApiPromise.create(options({
    provider: new WsProvider(ws),
    noInitWarn: true
  }))
  // If will throws error when worker not found in the cluster.
  const registry = await OnChainRegistry.create(apiPromise, connectionOptions)

  console.log('Connected via', ws)
  console.log('Cluster ID:', registry.clusterId)
  console.log('Worker ID:', registry.remotePubkey)
  console.log('Worker Endpoint:', registry.pruntimeURL)
  const info = await registry.phactory.getInfo({})
  console.log(info)
  console.log('---')
  const lastBlockHeight = await apiPromise.derive.chain.bestNumberFinalized()
  console.log('Best Finalized Num:\t', locale.format(lastBlockHeight))
  console.log('Pruntime block Num:\t', locale.format(info.blocknum))
  console.log('Pruntime Header Num:\t', locale.format(info.headernum))
}

main().catch(console.error).finally(() => process.exit()) // eslint-disable-line no-process-exit
