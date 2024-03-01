require('dotenv').config()

const { inspect } = require('util')
const { getLogger } = require('@phala/sdk')
const R = require('ramda');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const argv = require('arg')({
    '--pruntime': String,
    '--loggerContractId': String,
    '--systemContractId': String,
    '--skip': [String],
    '--interval': Number,
    '-f': Boolean,
    '--abi': String,
    '--type': String,
    '--topic': String,
    '--blockNumber': Number,
    '--inspect': Boolean,
  })

  if (!argv['--pruntime']) {
    console.log('You neeed specific the target pruntime with --pruntime')
    return process.exit(1)
  }
  if (!argv['--loggerContractId']) {
    console.log('You neeed specific the logger contract id with --loggerContractId')
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
  }
  const polling = argv['-f']
  const intervalMs = argv['--interval'] || 1500
  const contractId = argv._[0]
  const blockNumber = Number(argv['--blockNumber'])

  //
  // END: parse arguments
  //

  const pinkLogger = await getLogger({
    pruntimeURL: argv['--pruntime'],
    contractId: argv['--loggerContractId'],
    systemContract: argv['--systemContractId'],
  })

  const query = {
    contract: contractId,
    type,
    topic: argv['--topic'],
    abi: argv['--abi'] ? fs.readFileSync(argv['--abi'], 'utf-8') : null,
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
            if (blockNumber && rec.blockNumber !== blockNumber) {
              continue
            }
            if (argv['--inspect']) {
              console.log(inspect(rec, false, null, true))
              continue
            }
            if (rec['type'] === 'Log') {
              const d = new Date(rec['timestamp'])
              console.log(`${rec['type']} #${rec['blockNumber']} [${d.toISOString()}] ${rec['message']}`)
            } else if (rec['type'] === 'MessageOutput') {
              console.log(`${rec['type']} #${rec['blockNumber']} ${JSON.stringify(rec['output'])}`)
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

  // await waitReady()
  // const keyring = new Keyring({ type: 'sr25519' })
  // const pair = keyring.addFromUri('//Alice')
  // const phactory = createPruntimeClient(argv['--pruntime'])
  // const pinkLogger = new PinkLoggerContractPromise(phactory, argv['--remotePubkey'], pair, argv['--loggerContractId'], argv['--systemContractId'])

}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
