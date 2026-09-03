import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

/**
 * A local Hardhat node stands in for the permissioned consortium network during
 * development. A real deployment targets a QBFT/IBFT chain whose validators are
 * run by NCRB, the State CID, the judiciary, the forensic laboratories and the
 * prosecution directorate — see docs/ARCHITECTURE.md.
 */
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    localhost: { url: 'http://127.0.0.1:8545' },
    consortium: {
      url: process.env.PRAMANA_RPC_URL ?? 'http://127.0.0.1:8545',
      // Zero gas price: a permissioned chain has no cryptocurrency and no fee market.
      gasPrice: 0,
    },
  },
};

export default config;
