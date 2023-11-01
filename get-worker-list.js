require('dotenv').config()

const { options, OnChainRegistry } = require('@phala/sdk')
const { ApiPromise, WsProvider } = require('@polkadot/api')

const argv = require('arg')({
  '--ws': String,
  // '--clusterId': String,
  // '--worker': String,
  // '--pruntimeURL': String
})

async function main() {
  const ws = argv['--ws'] || process.env.ENDPOINT
  if (!ws) {
    throw new Error('No ws endpoint specified')
  }
  const apiPromise = await ApiPromise.create(options({
    provider: new WsProvider(ws),
    noInitWarn: true
  }))
  const registry = new OnChainRegistry(apiPromise)

  // List all workers
  const workers = await registry.getClusterWorkers()
  console.log(`Found ${workers.length} workers`)
  console.log('--')
  for (const worker of workers) {
    console.log('Worker ID:', worker.pubkey)
    console.log('Worker Endpoint:', worker.endpoints.default)
    console.log('')
  }

  console.log('Shuffle and pick randomly')
  const idx = Math.floor(workers.length * Math.random())
  const picked = workers[idx]
  console.log('Picked: ', idx, picked)

  await registry.connect(picked)
  console.log('Connected.')
}

main().catch(console.error).finally(() => process.exit())
