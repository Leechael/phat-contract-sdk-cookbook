require('dotenv').config()

const R = require('ramda')
const { options, createPruntimeClient } = require('@phala/sdk')
const { ApiPromise, WsProvider, HttpProvider } = require('@polkadot/api')

const argv = require('arg')({
  '--ws': String,
  '--http': Boolean,
})

//
// @returns [workerId, endpointUrl, isAvailable, errorMessage]
//
async function diagnoseEndpointAvailability([workerId, endpointUrl]) {
  const checkEndpoint = async () => {
    try {
      const client = createPruntimeClient(endpointUrl)
      const info = await client.getInfo({})
      if (`0x${info.ecdhPublicKey || ''}` === workerId) {
        return [true, null]
      }
      return [false, 'On-chain worker ID not match to the worker ECDH PublicKey.']
    } catch (err) {
      return [false, `${err}`]
    }
  }
  const result = await Promise.race([
    checkEndpoint(),
    new Promise((resolve) => setTimeout(() => resolve([false, 'Timeout after 3 secs, worker might be offline.']), 3_000)),
  ])
  return [workerId, endpointUrl, ...result]
}

async function main() {
  const ws = argv['--ws'] || process.env.ENDPOINT
  if (!ws) {
    throw new Error('No ws endpoint specified')
  }
  const provider = argv['--http'] ? new HttpProvider(ws.replace('wss://', 'https://').replace('ws://', 'http://')) : new WsProvider(ws)
  const apiPromise = await ApiPromise.create(options({
    provider,
    noInitWarn: true
  }))

  // 1. Getting all registered workers by cluster.
  console.log('getting all registered workers...')
  const clusterWorkersQuery = await apiPromise.query.phalaPhatContracts.clusterWorkers.entries()
  const clusterWorkers = clusterWorkersQuery.map(([storageKeys, workerList]) => {
    const clusterId = storageKeys.args[0].toHex()
    return [clusterId, workerList.map(i => i.toHex())]
  })

  // 2. Get all registered endpoint from on-chain.
  console.log('getting all registered endpoints...')
  const endpointsQuery = await apiPromise.query.phalaRegistry.endpoints.entries()
  const endpointInfos = endpointsQuery.map(([storageKeys, endpoint]) => {
    const endpointId = storageKeys.args[0].toHex()
    return [endpointId, endpoint.toHuman()?.V1?.[0]]
  })

  // 3. batch check all pruntime endpoint.
  console.log('checking all pruntime endpoint...')
  const result = await Promise.all(endpointInfos.map(diagnoseEndpointAvailability))

  // 4. Print to console.
  console.log("\n")
  for (let group of clusterWorkers) {
    const [clusterId, workerIds] = group
    console.log(`cluster=${clusterId}`)
    for (let workerId of workerIds) {
      const diagnoseResult = R.find(([_workerId]) => _workerId === workerId, result)
      if (!diagnoseResult) {
        console.log(`  ❌ ${workerId} Worker not found.`)
        continue
      }
      const [endpointId, endpointUrl, isAvailable, errorMessage] = diagnoseResult
      console.log(`  ${isAvailable ? '✅' : '❌'} ${workerId} ${endpointUrl} ${errorMessage || ''}`)
    }
  }
}

function handleUncaughtExceptionOrRejection() {}
process.on('unhandledRejection', handleUncaughtExceptionOrRejection);
process.on('uncaughtException', handleUncaughtExceptionOrRejection);


main().catch(console.error).finally(() => process.exit())
