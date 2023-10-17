require('dotenv').config()

const { options, OnChainRegistry } = require('@phala/sdk')
const { ApiPromise, WsProvider } = require('@polkadot/api')
const R = require('ramda');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const argv = require('arg')({
    '--ws': String,
    '--skip': [String],
    '--interval': Number,
  })
  const endpoint = argv['--ws'] || process.env.ENDPOINT
  if (!endpoint) {
    console.log('You neeed specific the target endpoint with --ws')
    return process.exit(1)
  }

  let types = ['Log', 'MessageOutput', 'QueryIn', 'Event']
  if (argv['--skip']) {
    if (typeof argv.skip === 'string') {
      types = R.filter(i => i !== argv.skip, types)
    } else {
      types = R.without(argv.skip, types)
    }
  }

  const contractId = argv._[0]

  const intervalMs = argv['--interval'] || 1500

  const api = await ApiPromise.create(options({
    provider: new WsProvider(endpoint),
    noInitWarn: true,
  }))

  const phatRegistry = await OnChainRegistry.create(api)
  const pinkLogger = phatRegistry.loggerContract

  if (!pinkLogger) {
    console.log('No logger contract found')
    return process.exit(1)
  }

  // logserver tail support comes with getInfo API, so if getInfo is not available, we fallback the original approach.
  // @see https://github.com/Phala-Network/phala-blockchain/pull/1352
  let useTail = true
  try {
    await pinkLogger.getInfo()
  } catch (_err) {
    useTail = false
  }

  let lastSequence = -1
  while (true) {
    const { records } = await (useTail ? pinkLogger.tail(10000,{ contract: contractId }) : pinkLogger.getLog(contractId))
    const newRecords = R.filter(i => i.sequence > lastSequence, records)
    if (newRecords.length > 0) {
      const last = R.last(R.map(R.prop('sequence'), newRecords))
      if (last) {
        lastSequence = last
        for (let rec of newRecords) {
          if (!R.includes(rec['type'], types)) {
            continue
          }
          if (rec['type'] === 'Log') {
            const d = new Date(rec['timestamp'])
            console.log(`${rec['type']} #${rec['blockNumber']} [${d.toISOString()}] ${rec['message']}`)
          } else if (rec['type'] === 'MessageOutput') {
            console.log(`${rec['type']} #${rec['blockNumber']} ${rec['output']}`)
          } else {
            console.log(`${rec['type']} ${JSON.stringify(rec)}`)
          }
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
