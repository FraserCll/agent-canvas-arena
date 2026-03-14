require("@nomicfoundation/hardhat-toolbox");
const fs = require('fs');
const envFile = fs.existsSync('.env.mainnet') ? '.env.mainnet' : '.env.deploy';
require("dotenv").config({ path: envFile });

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    'base-sepolia': {
      url: "https://sepolia.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    'base-mainnet': {
      url: "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};
