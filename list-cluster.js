require('dotenv').config()

const { options, OnChainRegistry } = require('@phala/sdk')
const { ApiPromise, WsProvider } = require('@polkadot/api')

const argv = require('arg')({
  '--ws': String,
})

async function main() {
  const ws = argv['--ws'] || process.env.WS_ENDPOINT
  if (!ws) {
    throw new Error('No ws endpoint specified')
  }

  const apiPromise = await ApiPromise.create(options({
    provider: new WsProvider(ws),
    noInitWarn: true
  }))
  const registry = await OnChainRegistry.create(apiPromise)

  const clusters = await registry.getClusters()
  for (const [clusterId, clusterInfo] of clusters) {
    console.log('Cluster', clusterId)
    console.log('Owner Address:', clusterInfo.owner.toHex())
    console.log('Permission:', clusterInfo.permission.isPublic ? 'Public' : clusterInfo.permission.asOnlyOwner.toJSON())
    console.log('System Contract ID:', clusterInfo.systemContract.toHex())
    console.log('Gas Price: ', clusterInfo.gasPrice.toNumber())
    console.log('Deposit Per Item:', clusterInfo.depositPerItem.toNumber(), '(', clusterInfo.depositPerItem.toNumber() / 1e12, 'PHA )')
    console.log('Deposit Per Byte:', clusterInfo.depositPerByte.toNumber(), '(', clusterInfo.depositPerByte.toNumber() / 1e12, 'PHA )')
    console.log('Workers:')
    for (let workerId of clusterInfo.workers) {
      console.log('\t', workerId.toHex())
    }
    console.log('>> Total: ', clusterInfo.workers.length)
    console.log('')
  }
}

main().catch(console.error).finally(() => process.exit())
