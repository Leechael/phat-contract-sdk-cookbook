require('dotenv').config()

import type { AbstractArray } from '@polkadot/types-codec/abstract'
import type { u16 } from '@polkadot/types-codec'
import { getClient, type GetClientOptions } from '@phala/sdk'

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

  const connectionOptions: Partial<GetClientOptions> = {}
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

  console.log('Connected via', ws)
  console.log('Cluster ID:', registry.clusterId)
  console.log('Worker ID:', registry.remotePubkey)
  console.log('Worker Endpoint:', registry.pruntimeURL)

  console.log('')

  if (registry.systemContract) {
    console.log('System Contract ID:', registry.systemContract.address.toHex())
    const { output: systemVersionQuery } = await registry.systemContract.q.system.version<AbstractArray<u16>>()
    console.log('System Contract Version:', systemVersionQuery.asOk.toJSON())
    console.log('')

    if (registry.loggerContract) {
      const loggerInfo = await registry.loggerContract.getInfo()
      const loggerContractInfo = await registry.phactory.getContractInfo({ contracts: [
        registry.loggerContract.address.toHex()
      ]})
      console.log('PinkLogger Contract ID:', registry.loggerContract.address.toHex())
      console.log('PinkLogger Running State:', loggerContractInfo.contracts?.[0]?.sidevm?.state)
      console.log('PinkLogger SideVM Start Time:', loggerContractInfo.contracts?.[0]?.sidevm?.startTime)
      console.log('PinkLogger Info:', loggerInfo)
      console.log('')
    }

    // const { output: jsDelegateQuery } = await registry.systemContract.query['system::getDriver'](cert.address, { cert }, 'JsDelegate')
    const { output: jsDelegateQuery } = await registry.systemContract.q.system.getDriver({ args: ['JsDelegate'] })
    console.log('JsDelegate Contract ID:', jsDelegateQuery.asOk.toHex())

    console.log('')

    // const { output: sidevmOperationQuery } = await registry.systemContract.query['system::getDriver'](cert.address, { cert }, 'SidevmOperation')
    const { output: sidevmOperationQuery } = await registry.systemContract.q.system.getDriver({ args: ['SidevmOperation'] })
    console.log('SidevmOperation Contract ID:', sidevmOperationQuery.asOk.toHex())
  }
}

main().catch(console.error).finally(() => process.exit())
