require('dotenv').config()

const fs = require('fs')
const { PinkCodePromise, getClient, EvmAccountMappingProvider } = require('@phala/sdk')
const { createWalletClient, http } = require('viem')
const { mainnet } = require('viem/chains')
const { privateKeyToAccount } = require('viem/accounts')


const argv = require('arg')({
  '--ws': String,
  '--suri': String,
  '--contract': String,
  '--privkey': String
})

async function main() {
  const endpoint = process.env.ENDPOINT
  if (!endpoint) {
    console.log('Please create your own .env file with `ENDPOINT` and `POLKADOT_ACCOUNT`.')
    return process.exit(1)
  }
  const targetFile = 'abis/fat_badges.contract'
  if (!fs.existsSync(targetFile)) {
    console.log(`${targetFile} not exists.`)
    return process.exit(1)
  }
  const contractFile = JSON.parse(fs.readFileSync(targetFile))

  // Initialization
  const phatRegistry = await getClient({ transport: endpoint })

  // Create WalletClient.
  const account = privateKeyToAccount(argv['--privkey'] || process.env.PRVIKEY_KEY)
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http()
  })

  const provider = await EvmAccountMappingProvider.create(phatRegistry.api, walletClient, account)
  const cert = await provider.signCertificate()

  //
  //
  //
  const balance = await phatRegistry.api.query.system.account(provider.address)
  console.log(`address: ${provider.address} | ${balance.data.free.toNumber() / 1e12} PHA`)

  ///
  /// All prepare conditions ready.
  ///

  //
  // Step 1: Upload with PinkCodePromise
  //
  console.log('Upload codes...')
  const codePromise = new PinkCodePromise(phatRegistry.api, phatRegistry, contractFile, contractFile.source.wasm)
  const uploadResult = await codePromise.send({ provider: provider })
  await uploadResult.waitFinalized()
  console.log('Code ready in cluster.')

  //
  // Step 2: instantiate with PinkBlueprintPromise
  //
  console.log('Instantiating...')
  const instantiateResult = await uploadResult.blueprint.send.new({ provider: provider })
  await instantiateResult.waitFinalized()

  const { contractId, contract } = instantiateResult
  console.log('Contract uploaded & instantiated: ', contractId)

  //
  // Step 3: adjust staking for the contract (optional)
  //
  console.info(`Auto staking to the contract...`);
  await provider.adjustStake(contractId, 1e10)

  contract.provider = provider

  //
  // query test. 
  //
  // const totalQueryResponse = await contract.query.getTotalBadges(cert.address, { cert })
  const totalQueryResponse = await contract.q.getTotalBadges()
  const total = totalQueryResponse.output.toJSON()
  console.log('total:', total)

  //
  // trx with auto-deposit test.
  //
  const name = `Badge${new Date().getTime()}`
  // const result = await contract.send.newBadge({ cert, provider: provider }, name)
  const result = await contract.exec.newBadge({ args: [name] })
  await result.waitFinalized()
  console.log('trx submited')

  //
  // query data after trx.
  //
  // const { output: after } = await contract.query.getTotalBadges(cert.address, { cert })
  const { output: after } = await contract.q.getTotalBadges()
  console.log('total:', after.toJSON())
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
