require('dotenv').config()

const { getClient } = require('@phala/sdk')

const argv = require('arg')({
  '--ws': String,
  '--clusterId': String,
  '--worker': String,
  '--pruntimeURL': String
})

async function main() {
  
  const ws = argv['--ws'] || process.env.ENDPOINT
  if (!ws) {
    throw new Error('No ws endpoint specified')
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

  const registry = await getClient({
    transport: ws,
    ...connectionOptions
  })

  if (!argv['_'].length) {
    throw new Error('No contract ID specified')
  }

  const contractId = argv['_'][0]

  const contractKey = await registry.getContractKey(contractId)
  console.log('Contract Key:', contractKey)
}

main().catch(console.error).finally(() => process.exit())
