
require('dotenv').config()

const Phala = require('@phala/sdk')
const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api')
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

  const api = await ApiPromise.create(Phala.options({
    provider: new WsProvider(endpoint),
    noInitWarn: true,
  }))
  const phatRegistry = await Phala.OnChainRegistry.create(api)

  const keyring = new Keyring({ type: 'sr25519' })
  const pair = keyring.addFromUri(account)
  const cert = await Phala.signCertificate({ api, pair })

  // Get the PinkLogger contract id.
  const { output } = await phatRegistry.systemContract.query['system::getDriver'](pair.address, { cert }, 'PinkLogger')
  const contractId = output.asOk.toHex()
  console.log(`The PinkLogger contractId is: ${contractId}`)

  // Fetch all pruntime endpoint URL from chains.
  const endpoints = await phatRegistry.getEndpints()

  for (let endpoint of endpoints) {
    const url = endpoint[1].unwrap().asV1[0].toPrimitive()
    console.log(`Checking ${url}`)
    const phactory = Phala.createPruntimeApi(url)
    const resp = await phactory.getContractInfo({contracts: [contractId]})
    console.log(resp)
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
