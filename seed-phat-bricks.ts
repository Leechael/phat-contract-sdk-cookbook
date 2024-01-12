require('dotenv').config()

import fs from 'node:fs'
import type { u64, Bool } from '@polkadot/types-codec'
import { signAndSend, signCertificate, OnChainRegistry, options, PinkCodePromise, PinkBlueprintPromise, KeyringPairProvider, type FrameSystemAccountInfo, PinkContractPromise, PinkContractQuery, PinkContractTx, getClient, unsafeGetAbiFromGitHubRepoByCodeHash, unsafeGetWasmFromGithubRepoByCodeHash } from '@phala/sdk'
import { ApiPromise, Keyring, WsProvider } from '@polkadot/api'


const LEGO_CODE_HASH = '0xe5b86ea5a92b207cffa9f814911bb96cc900bef19817f3e07b75a23f60ca963b'
const ACTION_OFFCHAIN_ROLLUP_CODE_HASH = '0x96ca5480eb52b8087b1e64cae52c75e6db037e1920320653584ef920db5d29d5'
const BRICK_PROFILE_CODE_HASH = '0x27332bc5304f12851f8d48e50df26d6be4b2a2764dcd5b6fdbc9ba4158bc9c84'
const BRICK_PROFILE_FACTORY_CODE_HASH = '0xeb65d30766360fb51fe01f638142ae4a5ef1ffbe66c016336b17977f4d5f7c29'

async function main() {
  const endpoint = process.env.ENDPOINT
  const account = process.env.POLKADOT_ACCOUNT
  if (!endpoint || !account) {
    console.log('Please create your own .env file with `ENDPOINT` and `POLKADOT_ACCOUNT`.')
    return process.exit(1)
  }

  const client = await getClient({ transport: endpoint })

  const keyring = new Keyring({ type: 'sr25519', ss58Format: 30 })
  const pair = keyring.addFromUri(account)
  // const provider = await KeyringPairProvider.createFromSURI(client.api, account, { ss58Format: 30 })
  const provider = await KeyringPairProvider.create(client.api, pair)

  console.log('endpoint: ', endpoint)
  console.log('deployer:', provider.address)

  await provider.send(client.transferToCluster(provider.address, 2000 * 1e12))

  // prepare the lego_rs instance.
  {
    const { output: existsCheck } = await client.systemContract!.q.system.codeExists<Bool>({ args: [LEGO_CODE_HASH, 'Ink'] })
    if (existsCheck.isErr) {
      throw new Error('Failed to check if the contract exists: is it PRuntime running healthy')
    }
    let blueprint: PinkBlueprintPromise
    if (existsCheck.asOk.isFalse) {
      const [wasmCode, abi] = await Promise.all([
        unsafeGetWasmFromGithubRepoByCodeHash(LEGO_CODE_HASH),
        unsafeGetAbiFromGitHubRepoByCodeHash(LEGO_CODE_HASH),
      ])
      const codePromise = new PinkCodePromise(client.api, client, abi, wasmCode)
      const upload = await codePromise.send({ provider })
      await upload.waitFinalized()
      blueprint = upload.blueprint
    } else {
      const abi = await unsafeGetAbiFromGitHubRepoByCodeHash(LEGO_CODE_HASH)
      blueprint = new PinkBlueprintPromise(client.api, client, abi, LEGO_CODE_HASH)
    }
    const instantiation = await blueprint.send.default({ provider })
    await instantiation.waitFinalized()
    console.log(`lego_rs instantiated: ${instantiation.contractId}`)
  }

  // action_offchain_rollup & brick_profile both are upload only
  {
    const { output: existsCheck } = await client.systemContract!.q.system.codeExists<Bool>({ args: [ACTION_OFFCHAIN_ROLLUP_CODE_HASH, 'Ink'] })
    if (existsCheck.isErr) {
      throw new Error('Failed to check if the contract exists: is it PRuntime running healthy')
    }
    if (existsCheck.asOk.isFalse) {
      console.log('Fetching wasm and abi for action_offchain_rollup...')
      const [wasmCode, abi] = await Promise.all([
        unsafeGetWasmFromGithubRepoByCodeHash(ACTION_OFFCHAIN_ROLLUP_CODE_HASH),
        unsafeGetAbiFromGitHubRepoByCodeHash(ACTION_OFFCHAIN_ROLLUP_CODE_HASH),
      ])
      console.log('Downloaded.')
      const codePromise = new PinkCodePromise(client.api, client, abi, wasmCode)
      const upload = await codePromise.send({ provider })
      await upload.waitFinalized()
      console.log('`action_offchain_rollup` uploaded.')
    } else {
      console.log('`action_offchain_rollup` already exists, skip.')
    }
  }
  {
    const { output: existsCheck } = await client.systemContract!.q.system.codeExists<Bool>({ args: [BRICK_PROFILE_CODE_HASH, 'Ink'] })
    if (existsCheck.isErr) {
      throw new Error('Failed to check if the contract exists: is it PRuntime running healthy')
    }
    if (existsCheck.asOk.isFalse) {
      console.log('Fetching wasm and abi for brick_profile...')
      const [wasmCode, abi] = await Promise.all([
        unsafeGetWasmFromGithubRepoByCodeHash(BRICK_PROFILE_CODE_HASH),
        unsafeGetAbiFromGitHubRepoByCodeHash(BRICK_PROFILE_CODE_HASH),
      ])
      console.log('Downloaded.')
      const codePromise = new PinkCodePromise(client.api, client, abi, wasmCode)
      const upload = await codePromise.send({ provider })
      await upload.waitFinalized()
      console.log('`brick_profile` uploaded.')
    } else {
      console.log('`brick_profile` already exists, skip.')
    }
  }

  {
    const { output: existsCheck } = await client.systemContract!.q.system.codeExists<Bool>({ args: [BRICK_PROFILE_FACTORY_CODE_HASH, 'Ink'] })
    if (existsCheck.isErr) {
      throw new Error('Failed to check if the contract exists: is it PRuntime running healthy')
    }
    let blueprint: PinkBlueprintPromise
    if (existsCheck.asOk.isFalse) {
      const [wasmCode, abi] = await Promise.all([
        unsafeGetWasmFromGithubRepoByCodeHash(BRICK_PROFILE_FACTORY_CODE_HASH),
        unsafeGetAbiFromGitHubRepoByCodeHash(BRICK_PROFILE_FACTORY_CODE_HASH),
      ])
      const codePromise = new PinkCodePromise(client.api, client, abi, wasmCode)
      const upload = await codePromise.send({ provider })
      await upload.waitFinalized()
      blueprint = upload.blueprint
    } else {
      const abi = await unsafeGetAbiFromGitHubRepoByCodeHash(BRICK_PROFILE_FACTORY_CODE_HASH)
      blueprint = new PinkBlueprintPromise(client.api, client, abi, BRICK_PROFILE_FACTORY_CODE_HASH)
    }
    const instantiation = await blueprint.send.new({ provider }, BRICK_PROFILE_CODE_HASH)
    await instantiation.waitFinalized()
    console.log(`brick_profile_factory instantiated: ${instantiation.contractId}`)
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
