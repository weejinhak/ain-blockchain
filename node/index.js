const ainUtil = require('@ainblockchain/ain-util');
const {GenesisAccounts} = require('../constants');
const DB = require('../db');
const Transaction = require('../tx-pool/transaction');
const ACCOUNT_INDEX = process.env.ACCOUNT_INDEX || null;

class Node {
  constructor() {
    this.db = new DB();
    this.nonce = null;
    // TODO(lia): Add account importing functionality.
    this.account = ACCOUNT_INDEX !== null ?
        GenesisAccounts.others[ACCOUNT_INDEX] : ainUtil.createAccount();
    console.log(`Creating new node with account: ${this.account.address}`);
  }

  // For testing purpose only.
  setAccountForTesting(accountIndex) {
    this.account = GenesisAccounts.others[accountIndex];
  }

  startWithBlockchain(blockchain, tp) {
    console.log('Starting database with a blockchain..')
    //blockchain.setBackDb(new BackupDb(this.account));
    blockchain.setBackDb(new DB());
    this.nonce = this.getNonce(blockchain);
    this.reconstruct(blockchain, tp);
  }

  getNonce(blockchain) {
    // TODO (Chris): Search through all blocks for any previous nonced transaction with current
    //               publicKey
    let nonce = 0;
    for (let i = blockchain.chain.length - 1; i > -1; i--) {
      for (let j = blockchain.chain[i].transactions.length -1; j > -1; j--) {
        if (ainUtil.areSameAddresses(blockchain.chain[i].transactions[j].address,
                                     this.account.address)
            && blockchain.chain[i].transactions[j].nonce > -1) {
          // If blockchain is being restarted, retreive nonce from blockchain
          nonce = blockchain.chain[i].transactions[j].nonce + 1;
          break;
        }
      }
      if (nonce > 0) {
        break;
      }
    }
    console.log(`Setting nonce to ${nonce}`);
    return nonce;
  }

  /**
    * Validates transaction is valid according to AIN database rules and returns a transaction
    * instance
    *
    * @param {dict} operation - Database write operation to be converted to transaction
    * @param {boolean} isNoncedTransaction - Indicates whether transaction should include nonce or
    *                                        not
    * @return {Transaction} Instance of the transaction class
    */
  createTransaction(txData, isNoncedTransaction = true) {
    if (Transaction.isBatchTransaction(txData)) {
      const txList = [];
      txData.tx_list.forEach((subData) => {
        txList.push(this.createSingleTransaction(subData, isNoncedTransaction));
      })
      return { tx_list: txList };
    }
    return this.createSingleTransaction(txData, isNoncedTransaction);
  }

  createSingleTransaction(txData, isNoncedTransaction) {
    // Workaround for skip_verif with custom address
    if (txData.address !== undefined) {
      txData.skip_verif = true;
    }
    if (txData.nonce === undefined) {
      let nonce;
      if (isNoncedTransaction) {
        nonce = this.nonce;
        this.nonce++;
      } else {
        nonce = -1;
      }
      txData.nonce = nonce;
    }
    return Transaction.newTransaction(this.account.private_key, txData);
  }

  reconstruct(blockchain, transactionPool) {
    console.log('Reconstructing database');
    this.db.setDbToSnapshot(blockchain.backupDb);
    this.db.createDatabase(blockchain, transactionPool);
    this.db.addTransactionPool(transactionPool.validTransactions());
  }
}

module.exports = Node;
