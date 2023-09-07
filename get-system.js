require('dotenv').config()

const { options, OnChainRegistry } = require('@phala/sdk')
const { ApiPromise, WsProvider } = require('@polkadot/api')
const argParser = require('minimist')


async function main() {
  const argv = argParser(process.argv.slice(2))
  const endpoint = argv.endpoint || process.env.ENDPOINT
  const account = process.env.POLKADOT_ACCOUNT || '//Alice'
  if (!endpoint || !account) {
    console.log('Please create your own .env file with `ENDPOINT` and `POLKADOT_ACCOUNT`.')
    return process.exit(1)
  }

  console.log('endpoint:', endpoint)
  const api = await ApiPromise.create(options({
    provider: new WsProvider(endpoint),
    noInitWarn: true,
  }))

  const phatRegistry = await OnChainRegistry.create(api)

  const cert = await phatRegistry.getAnonymousCert()

  console.log('System Contract Address:', phatRegistry.systemContract.address.toHex())

  const result = await phatRegistry.systemContract.query['system::getDriver'](cert.address, { cert }, 'PinkLogger')
  const loggerContractId = result.output.asOk.toHex()
  console.log('PinkLogger Contract Address:', loggerContractId)
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
