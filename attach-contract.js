require('dotenv').config()

const fs = require('fs')
const { getClient, getContract, unstable_EvmAccountMappingProvider } = require('@phala/sdk')
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
  const contractId = argv['--contract']

  // Initialization
  const phatRegistry = await getClient({ transport: endpoint })

  // Create WalletClient.
  const account = privateKeyToAccount(argv['--privkey'] || process.env.PRVIKEY_KEY)
  const walletClient = createWalletClient({
    account,
    chain: mainnet,
    transport: http()
  })

  const provider = await unstable_EvmAccountMappingProvider.create(phatRegistry.api, walletClient, account)
  const cert = await provider.signCertificate()

  const contract = await getContract({
    client: phatRegistry,
    abi: contractFile,
    contractId,
  })

  //
  // query test. 
  //
  const totalQueryResponse = await contract.query.getTotalBadges(cert.address, { cert })
  const total = totalQueryResponse.output.toJSON()
  console.log('total:', total)

  //
  // trx with auto-deposit test.
  //
  const name = `Badge${new Date().getTime()}`
  const result = await contract.send.newBadge({ cert, unstable_provider: provider }, name)
  await result.waitFinalized()
  console.log('trx submited')

  //
  // query data after trx.
  //
  const { output: after } = await contract.query.getTotalBadges(cert.address, { cert })
  console.log('total:', after.toJSON())
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
