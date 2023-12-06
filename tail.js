require('dotenv').config()

const fs = require('fs')
const { getLogger } = require('@phala/sdk')
const R = require('ramda');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const argv = require('arg')({
    '--ws': String,
    '--skip': [String],
    '--interval': Number,
    '-f': Boolean,
    '--abi': String,
    '--type': String,
    '--topic': String,
    '--nonce': String,
  })
  const transport = argv['--ws'] || process.env.ENDPOINT
  if (!transport) {
    console.log('You neeed specific the target endpoint with --ws')
    return process.exit(1)
  }

  if (argv['--skip'] && argv['--type']) {
    console.log('You can only specific one of --skip and --type')
    return process.exit(1)
  }

  let type = ['Log', 'MessageOutput', 'QueryIn', 'Event']
  if (argv['--skip']) {
    if (typeof argv.skip === 'string') {
      type = R.filter(i => i !== argv.skip, type)
    } else {
      type = R.without(argv.skip, type)
    }
  } else if (argv['--type'] && R.includes(argv['--type'], type)) {
    type = argv['--type']
  } else if (argv['--topic']) {
    type = 'Event'
  } else if (argv['--nonce']) {
    type = 'MessageOutput'
  }
  const polling = argv['-f']
  const intervalMs = argv['--interval'] || 1500
  const contractId = argv._[0]

  //
  // END: parse arguments
  //

  const pinkLogger = await getLogger({ transport })

  const query = {
    contract: contractId,
    type,
    topic: argv['--topic'],
    abi: argv['--abi'] ? fs.readFileSync(argv['--abi'], 'utf-8') : null,
    nonce: argv['--nonce'],
  }

  let lastSequence = -1
  while (true) {
    const { records } = await pinkLogger.tail(10000, query)
    if (records) {
      const newRecords = R.filter(i => i.sequence > lastSequence, records)
      if (newRecords.length > 0) {
        const last = R.last(R.map(R.prop('sequence'), newRecords))
        if (last) {
          lastSequence = last
          for (let rec of newRecords) {
            if (rec['type'] === 'Log') {
              const d = new Date(rec['timestamp'])
              console.log(`${rec['type']} #${rec['blockNumber']} contract=[${rec['contract']}] [${d.toISOString()}] ${rec['message']}`)
            } else if (rec['type'] === 'MessageOutput') {
              console.log(`${rec['type']} #${rec['blockNumber']} contract=[${rec['contract']}] nonce=[${rec['nonce']}] ${JSON.stringify(rec['output'])}`)
            } else if (rec['type'] === 'Event') {
              if (rec.decoded) {
                const args = rec.decoded.args.map((i, idx) => `${rec.decoded.event.args[idx].name}=${i.toHuman()}`)
                console.log(`${rec['type']} #${rec['blockNumber']} contract=[${rec['contract']}] ${rec.decoded.event.identifier} \{${args.join(", ")}\}`)
              } else {
                console.log(`${rec['type']} #${rec['blockNumber']} contract=[${rec['contract']}] ${JSON.stringify(rec['topics'])}`)
              }
            } else {
              console.log(`${rec['type']} ${JSON.stringify(rec)}`)
            }
          }
        }
      }
    }
    if (!polling) {
      break
    }
    await sleep(intervalMs)
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
