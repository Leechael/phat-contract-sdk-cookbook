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

  const client = await getClient({ transport: ws, ...connectionOptions })

  console.log('Connected via', ws)
  console.log('Cluster ID:', client.clusterId)
  console.log('Worker ID:', client.remotePubkey)
  console.log('Worker Endpoint:', client.pruntimeURL)
}

main().catch(console.error).finally(() => process.exit())
