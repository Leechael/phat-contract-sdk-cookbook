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
  })

  if (!argv['--pruntime']) {
    console.log('You neeed specific the target pruntime with --pruntime')
    return process.exit(1)
  }
  if (!argv['--loggerContractId']) {
    console.log('You neeed specific the logger contract id with --loggerContractId')
    return process.exit(1)
  }

  //
  // END: parse arguments
  //

  const pinkLogger = await getLogger({
    pruntimeURL: argv['--pruntime'],
    contractId: argv['--loggerContractId'],
    systemContract: argv['--systemContractId'],
  })

  const info = await pinkLogger.getInfo()
  console.log(info)
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
