'use strict';

const {ReadDbOperations, PredefinedDbPaths, TransactionStatus} = require('../constants');
const {Block} = require('../blockchain/block');
const ainUtil = require('@ainblockchain/ain-util');

/**
 * Defines the list of funtions which are accessibly to clients through the
 * JSON-RPC calls
 *
 * @param {Blockchain} blockchain Instance of the Blockchain class.
 * @param {TransactionPool} transactionPool Instance of the TransactionPool class.
 * @param {P2pServer} p2pServer Instance of the the P2pServer class.
 * @return {dict} A closure of functions compatible with the jayson library for
 *                  servicing JSON-RPC requests.
 */
module.exports = function getMethods(blockchain, transactionPool, p2pServer) {
  return {
    // Bloock API
    ain_getBlockList: function(args, done) {
      const blocks = blockchain.getChainSection(args.from, args.to);
      done(null, blocks);
    },

    ain_getRecentBlock: function(args, done) {
      const block = blockchain.lastBlock();
      done(null, block);
    },

    ain_getRecentBlockNumber: function(args, done) {
      const block = blockchain.lastBlock();
      done(null, block ? block.number : null);
    },

    ain_getBlockHeadersList: function(args, done) {
      const blocks = blockchain.getChainSection(args.from, args.to);
      const blockHeaders = [];
      blocks.forEach((block) => {
        blockHeaders.push(block.header);
      });
      done(null, blockHeaders);
    },

    ain_getBlockByHash: function(args, done) {
      let block = blockchain.getBlockByHash(args.hash);
      if (!block || args.getFullTransactions) {
        done(null, block);
      } else {
        block.transactions = extractTransactionHashes(block);
        done(null, block);
      }
    },

    ain_getBlockByNumber: function(args, done) {
      let block = blockchain.getBlockByNumber(args.number);
      if (!block || args.getFullTransactions) {
        done(null, block);
      } else {
        block.transactions = extractTransactionHashes(block);
        done(null, block);
      }
    },

    ain_getProposerByHash: function(args, done) {
      const block = blockchain.getBlockByHash(args.hash);
      done(null, block ? block.proposer : null);
    },

    ain_getProposerByNumber: function(args, done) {
      const block = blockchain.getBlockByNumber(args.number);
      done(null, block ? block.proposer : null);
    },

    ain_getValidatorsByNumber: function(args, done) {
      const block = blockchain.getBlockByNumber(args.number);
      done(null, block ? block.validators : null);
    },

    ain_getValidatorsByHash: function(args, done) {
      const block = blockchain.getBlockByHash(args.hash);
      done(null, block ? block.validators : null);
    },

    ain_getBlockTransactionCountByHash: function(args, done) {
      const block = blockchain.getBlockByHash(args.hash);
      done(null, block ? block.transactions.length : null);
    },

    ain_getBlockTransactionCountByNumber: function(args, done) {
      const block = blockchain.getBlockByNumber(args.number);
      done(null, block ? block.transactions.length : null);
    },

    // Transaction API
    ain_getPendingTransactions: function(args, done) {
      done(null, transactionPool.transactions);
    },

    ain_sendSignedTransaction: function(args, done) {
      // TODO (lia): return the transaction hash or an error message
      done(null, p2pServer.executeAndBroadcastTransaction(args));
    },

    ain_getTransactionByHash: function(args, done) {
      const transactionInfo = transactionPool.transactionTracker[args.hash];
      if (!transactionInfo) {
        done(null, null);
      } else {
        let transaction = null;
        if (transactionInfo.status === TransactionStatus.BLOCK_STATUS) {
          const block = blockchain.getBlockByNumber(transactionInfo.number);
          const index = transactionInfo.index;
          transaction = block.transactions[index];
        } else if (transactionInfo.status === TransactionStatus.POOL_STATUS) {
          const address = transactionInfo.address;
          const index = transactionInfo.index;
          transaction = transactionPool.transactions[address][index];
        }
        done(null, transaction);
      }
    },

    ain_getTransactionByBlockHashAndIndex: function(args, done) {
      let result;
      if (!args.block_hash || !args.index) {
        result = null;
      } else {
        const index = Number(args.index);
        const block = blockchain.getBlockByHash(args.block_hash);
        result = block.transactions.length > index && index >= 0 ? block.transactions[index] : null;
      }
      done(null, result);
    },

    ain_getTransactionByBlockNumberAndIndex: function(args, done) {
      let result;
      if (!args.block_number || !args.index) {
        result = null;
      } else {
        const index = Number(args.index);
        const block = blockchain.getBlockByNumber(args.block_number);
        result = block.transactions.length > index && index >= 0 ? block.transactions[index] : null;
      }
      done(null, result);
    },

    // Database API
    ain_get: function(args, done) { // TODO (lia): split this method
      switch (args.type) {
        case ReadDbOperations.GET_VALUE:
          done(null, p2pServer.db.getValue(args.ref));
          return;
        case ReadDbOperations.GET_RULE:
          done(null, p2pServer.db.getRule(args.ref));
          return;
        case ReadDbOperations.GET_OWNER:
          done(null, p2pServer.db.getOwner(args.ref));
          return;
        case ReadDbOperations.GET:
          done(null, p2pServer.db.get(args.op_list));
          return;
        default:
          done(null, {error: "Invalid get request type"});
      }
    },

    // Account API
    // TODO (lia): verify and convert to checksum addresses
    ain_getBalance: function(args, done) {
      const address = args.address;
      // TODO (lia): Check validity of the address with ain-util
      const balance = p2pServer.db
          .getValue(`/${PredefinedDbPaths.ACCOUNTS}/${address}/balance`) || 0;
      done(null, balance);
    },

    ain_getNonce: function(args, done) {
      const address = args.address;
      if (args.from === 'pending') {
        if (ainUtil.areSameAddresses(p2pServer.db.account.address, address)) {
          done(null, p2pServer.db.nonce);
        } else {
          const nonce = transactionPool.pendingNonceTracker[address];
          done(null, nonce === undefined ? -1 : nonce);
        }
      } else {
        // get the "committed nonce" by default
        const nonce = transactionPool.committedNonceTracker[address];
        done(null, nonce === undefined ? -1 : nonce);
      }
    },

    ain_isValidator: function(args, done) {
      // TODO (lia): update this function after revamping consensus staking
      const staked = p2pServer.db.getValue(
          `${PredefinedDbPaths.VOTING_NEXT_ROUND_VALIDATORS}/${args.address}`);
      done(null, staked ? staked > 0 : false);
    },

    // Network API
    net_listening: function(args, done) {
      // TODO (lia): Check if this number is lower than max peer number
      const peerCount = p2pServer.sockets.length;
      done(null, !!peerCount);
    },

    net_peerCount: function(args, done) {
      const peerCount = p2pServer.sockets.length;
      done(null, peerCount);
    },

    net_syncing: function(args, done) {
      // TODO (lia): return { starting, latest } with block numbers if the node
      // is currently syncing.
      done(null, !blockchain.syncedAfterStartup);
    },
  };
};

function extractTransactionHashes(block) {
  if (!block) return [];
  const hashes = [];
  block.transactions.forEach(tx => {
    hashes.push(tx.hash);
  });
  return hashes;
}
