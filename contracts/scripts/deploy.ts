import hre from 'hardhat';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Deploys the PRAMANA contract set and writes contracts/deployments.json, which
 * the API's `evm` ledger driver reads. After running this, start the API with:
 *
 *   PRAMANA_LEDGER=evm npm run dev:api
 */
async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  console.log(`deploying from ${deployer.address}\n`);

  const names = [
    'DocumentRegistry',
    'CustodyLedger',
    'AuditAnchor',
    'AccessPolicyRegistry',
    'SealedCustody',
    'RetentionRegistry',
  ] as const;

  const deployments: Record<string, string> = {};
  for (const name of names) {
    const factory = await ethers.getContractFactory(name);
    const contract = await factory.deploy();
    await contract.waitForDeployment();
    const address = await contract.getAddress();
    deployments[name] = address;
    console.log(`  ${name.padEnd(22)} ${address}`);
  }

  const path = resolve(__dirname, '..', 'deployments.json');
  writeFileSync(path, `${JSON.stringify(deployments, null, 2)}\n`);
  console.log(`\nwrote ${path}`);
  console.log('start the API against it with:  PRAMANA_LEDGER=evm npm run dev:api');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
