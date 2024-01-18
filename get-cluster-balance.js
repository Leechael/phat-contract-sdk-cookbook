require('dotenv').config()

const { getClient } = require('@phala/sdk')
const BN = require('bn.js')

const argv = require('arg')({
  '--ws': String,
})

async function main() {
  const endpoint = argv['--ws'] || process.env.ENDPOINT
  if (!endpoint) {
    console.log('Please create your own .env file with `ENDPOINT` and `POLKADOT_ACCOUNT`.')
    return process.exit(1)
  }
  if (!argv['_'].length) {
    console.log('Usage: node get-cluster-balance.js <address>')
    return process.exit(1)
  }
  const address = argv['_'][0]

  // Initialization
  console.log('Connecting to', endpoint, '...')
  const client = await getClient({ transport: endpoint })
  console.log('Connected.')

  const accountInfo = await client.api.query.system.account(address)
  const free = accountInfo.data.free.div(new BN(1e10)) / 100
  console.log(`Account ${address} has ${free} PHA.`)

  const balance = await client.getClusterBalance(address)
  console.log('Cluster Balance total:', balance.total.toPrimitive() / 1e12)
  console.log('Cluster Balance free:', balance.free.toPrimitive() / 1e12)
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})

