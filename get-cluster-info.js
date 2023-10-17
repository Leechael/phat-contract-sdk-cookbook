require('dotenv').config()

const { options, OnChainRegistry } = require('@phala/sdk')
const { ApiPromise, WsProvider } = require('@polkadot/api')

const argv = require('arg')({
  '--ws': String,
  '--clusterId': String,
  '--worker': String,
  '--pruntimeURL': String
})

async function main() {
  const ws = argv['--ws'] || process.env.WS_ENDPOINT
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

  const apiPromise = await ApiPromise.create(options({
    provider: new WsProvider(ws),
    noInitWarn: true
  }))
  const registry = await OnChainRegistry.create(apiPromise, connectionOptions)
  const cert = await registry.getAnonymousCert()

  console.log('Connected via', ws)
  console.log('Cluster ID:', registry.clusterId)
  console.log('Worker ID:', registry.remotePubkey)
  console.log('Worker Endpoint:', registry.pruntimeURL)

  console.log('')

  const { output: systemVersionQuery } = await registry.systemContract.query['system::version'](cert.address, { cert })
  console.log('System Contract ID:', registry.systemContract.address.toHex())
  console.log('System Version:', systemVersionQuery.asOk.toJSON())

  console.log('')

  const loggerInfo = await registry.loggerContract.getInfo()
  const loggerContractInfo = await registry.phactory.getContractInfo({ contracts: [
    registry.loggerContract.address.toHex()
  ]})
  console.log('PinkLogger Contract ID:', registry.loggerContract.address.toHex())
  console.log('PinkLogger Running State:', loggerContractInfo.contracts[0].sidevm.state)
  console.log('PinkLogger SideVM Start Time:', loggerContractInfo.contracts[0].sidevm.startTime)
  console.log('PinkLogger Info:', loggerInfo)

  console.log('')

  const { output: jsDelegateQuery } = await registry.systemContract.query['system::getDriver'](cert.address, { cert }, 'JsDelegate')
  console.log('JsDelegate Contract ID:', jsDelegateQuery.asOk.toHex())

  console.log('')

  const { output: sidevmOperatorQuery } = await registry.systemContract.query['system::getDriver'](cert.address, { cert }, 'SidevmOperation')
  console.log('SidevmOperator Contract ID:', sidevmOperatorQuery.asOk.toHex())
}

main().catch(console.error).finally(() => process.exit())
