require('dotenv').config()

const Phala = require('@phala/sdk')
const { typeDefinitions } = require('@polkadot/types');
const { ApiPromise, WsProvider } = require('@polkadot/api')
const R = require('ramda');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const endpoint = process.env.ENDPOINT
  const account = process.env.POLKADOT_ACCOUNT || '//Alice'
  if (!endpoint || !account) {
    console.log('Please create your own .env file with `ENDPOINT` and `POLKADOT_ACCOUNT`.')
    return process.exit(1)
  }
  const contractId = process.argv[2]
  if (!contractId) {
    console.log('Usage: node tail.js [contractId]')
    return process.exit(1)
  }

  const api = await ApiPromise.create({
    provider: new WsProvider(endpoint),
    types: {
      ...Phala.types,
      ...typeDefinitions,
      CheckMqSequence: null,
    },
    noInitWarn: true,
  })

  const phatRegistry = await Phala.OnChainRegistry.create(api)
  const pinkLogger = await Phala.PinkLoggerContractPromise.create(api, phatRegistry, phatRegistry.systemContract)

  const intervalMs = 1_500

  let lastSequence = -1
  while (true) {
    const { records } = await pinkLogger.getLog(contractId)
    const newRecords = R.filter(i => i.sequence > lastSequence, records)
    if (newRecords.length > 0) {
      const last = R.last(R.map(R.prop('sequence'), newRecords))
      if (last) {
        lastSequence = last
        for (let rec of newRecords) {
          const d = new Date(rec['timestamp'])
          console.log(`#${rec['blockNumber']} [${d.toISOString()}] ${rec['message']}`)
        }
      }
    }
    await sleep(intervalMs)
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
