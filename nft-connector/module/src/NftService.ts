import {PinoLogger} from 'nestjs-pino';
import BigNumber from 'bignumber.js';
import * as fcl from '@onflow/fcl';
import * as types from '@onflow/types';
import * as sdk from '@onflow/sdk';
import {NftError} from './NftError';
import {
    CeloBurnErc721,
    CeloDeployErc721,
    CeloMintErc721,
    CeloMintMultipleErc721,
    CeloTransferErc721,
    Currency,
    EthBurnErc721,
    EthDeployErc721,
    EthMintErc721,
    EthMintMultipleErc721,
    EthTransferErc721, FlowBurnNft, FlowMintMultipleNft, FlowMintNft, FlowTransferNft,
    prepareBscBurnBep721SignedTransaction,
    prepareBscDeployBep721SignedTransaction,
    prepareBscMintBep721SignedTransaction,
    prepareBscMintBepCashback721SignedTransaction,
    prepareBscMintMultipleBep721SignedTransaction,
    prepareBscMintMultipleCashbackBep721SignedTransaction,
    prepareBscTransferBep721SignedTransaction,
    prepareBscUpdateCashbackForAuthorErc721SignedTransaction,
    prepareCeloBurnErc721SignedTransaction,
    prepareCeloDeployErc721SignedTransaction,
    prepareCeloMintCashbackErc721SignedTransaction,
    prepareCeloMintErc721SignedTransaction,
    prepareCeloMintMultipleCashbackErc721SignedTransaction,
    prepareCeloMintMultipleErc721SignedTransaction,
    prepareCeloTransferErc721SignedTransaction,
    prepareCeloUpdateCashbackForAuthorErc721SignedTransaction,
    prepareEthBurnErc721SignedTransaction,
    prepareEthDeployErc721SignedTransaction,
    prepareEthMintCashbackErc721SignedTransaction,
    prepareEthMintErc721SignedTransaction,
    prepareEthMintMultipleCashbackErc721SignedTransaction,
    prepareEthMintMultipleErc721SignedTransaction,
    prepareEthTransferErc721SignedTransaction,
    prepareEthUpdateCashbackForAuthorErc721SignedTransaction,
    sendFlowNftBurnToken,
    sendFlowNftMintMultipleToken,
    sendFlowNftMintToken,
    sendFlowNftTransferToken,
    getFlowNftMetadata,
    getFlowNftTokenByAddress,
    FlowDeployNft,
    prepareXdcTransferErc721SignedTransaction,
    prepareXdcMintErc721SignedTransaction,
    prepareXdcMintErcCashback721SignedTransaction,
    prepareXdcMintMultipleErc721SignedTransaction,
    prepareXdcMintMultipleCashbackErc721SignedTransaction,
    prepareXdcUpdateCashbackForAuthorErc721SignedTransaction,
    prepareXdcBurnErc721SignedTransaction,
    prepareXdcDeployErc721SignedTransaction,
    CeloUpdateCashbackErc721,
    UpdateCashbackErc721,
    TransactionHash
} from '@tatumio/tatum';
import erc721_abi from '@tatumio/tatum/dist/src/contracts/erc721/erc721_abi';
import Web3 from 'web3';
import {Transaction, TransactionReceipt} from 'web3-eth';
import {
    FlowTxType,
} from '@tatumio/tatum/dist/src/transaction/flow';

export abstract class NftService {

    protected constructor(protected readonly logger: PinoLogger) {
    }

    protected abstract storeKMSTransaction(txData: string, currency: string, signatureId: string[], index?: number): Promise<string>;

    protected abstract isTestnet(): Promise<boolean>;

    protected abstract getNodesUrl(chain: Currency, testnet: boolean): Promise<string[]>;

    protected abstract broadcast(chain: Currency, txData: string, signatureId?: string);

    protected abstract deployFlowNft(testnet: boolean, body: FlowDeployNft): Promise<TransactionHash>;

    public async getMetadataErc721(chain: Currency, token: string, contractAddress: string, account?: string): Promise<{ data: string }> {
        if (chain === Currency.FLOW) {
            if (!account) {
                throw new NftError(`Account address must be present.`, 'nft.erc721.failed');
            }
            try {
                return {data: await getFlowNftMetadata(await this.isTestnet(), account, token, contractAddress)};
            } catch (e) {
                this.logger.error(e);
                throw new NftError(`Unable to obtain information for token. ${e}`, 'nft.erc721.failed');
            }
        }
        // @ts-ignore
        const c = new (await this.getClient(chain, await this.isTestnet())).eth.Contract(erc721_abi, contractAddress);
        try {
            return {data: await c.methods.tokenURI(token).call()};
        } catch (e) {
            this.logger.error(e);
            throw new NftError(`Unable to obtain information for token. ${e}`, 'nft.erc721.failed');
        }
    }

    public async getRoyaltyErc721(chain: Currency, token: string, contractAddress: string) {
        if (chain === Currency.FLOW) {
            throw new NftError(`Unsupported chain ${chain}.`, 'unsupported.chain');
        }
        // @ts-ignore
        const c = new (await this.getClient(chain, await this.isTestnet())).eth.Contract(erc721_abi, contractAddress);
        try {
            const [addresses, values] = await Promise.all([c.methods.tokenCashbackRecipients(token).call(), c.methods.tokenCashbackValues(token).call()]);
            return {addresses, values: values.map(c => new BigNumber(c).dividedBy(1e18).toString(10))};
        } catch (e) {
            this.logger.error(e);
            throw new NftError(`Unable to obtain information for token. ${e}`, 'nft.erc721.failed');
        }
    }

    public async getTokensOfOwner(chain: Currency, address: string, contractAddress: string): Promise<{ data: string }> {
        if (chain === Currency.FLOW) {
            try {
                return {data: await getFlowNftTokenByAddress(await this.isTestnet(), address, contractAddress)};
            } catch (e) {
                this.logger.error(e);
                throw new NftError(`Unable to obtain information for token. ${e}`, 'nft.erc721.failed');
            }
        }
        // @ts-ignore
        const c = new (await this.getClient(chain, await this.isTestnet())).eth.Contract(erc721_abi, contractAddress);
        try {
            return {data: await c.methods.tokensOfOwner(address).call()};
        } catch (e) {
            this.logger.error(e);
            throw new NftError(`Unable to obtain information for token. ${e}`, 'nft.erc721.failed');
        }
    }

    public async getContractAddress(chain: Currency, txId: string) {
        if (chain === Currency.FLOW) {
            try {
                await this.getClient(chain, await this.isTestnet());
                const tx = await sdk.send(sdk.build([sdk.getTransaction(txId)]));
                const {args} = await sdk.decode(tx);
                if (args && args.length) {
                    return args[0].value;
                }
            } catch (e) {
                this.logger.error(e);
            }
            throw new NftError('Transaction not found. Possible not exists or is still pending.', 'tx.not.found');
        }
        try {
            const web3 = await this.getClient(chain, await this.isTestnet());
            const {contractAddress} = await web3.eth.getTransactionReceipt(txId);
            return {contractAddress};
        } catch (e) {
            this.logger.error(e);
            throw new NftError('Transaction not found. Possible not exists or is still pending.', 'tx.not.found');
        }
    }

    public async getTransaction(chain: Currency, txId: string): Promise<Transaction & TransactionReceipt> {
        if (chain === Currency.FLOW) {
            try {
                await this.getClient(chain, await this.isTestnet());
                const tx = await sdk.send(sdk.build([sdk.getTransaction(txId)]));
                return await sdk.decode(tx);
            } catch (e) {
                this.logger.error(e);
            }
            throw new NftError('Transaction not found. Possible not exists or is still pending.', 'tx.not.found');
        }
        try {
            const web3 = await this.getClient(chain, await this.isTestnet());
            const {r, s, v, hash, ...transaction} = (await web3.eth.getTransaction(txId)) as any;
            let receipt: TransactionReceipt = undefined;
            try {
                receipt = await web3.eth.getTransactionReceipt(hash);
            } catch (_) {
                transaction.transactionHash = hash;
            }
            return {...transaction, ...receipt};
        } catch (e) {
            this.logger.error(e);
            throw new NftError('Transaction not found. Possible not exists or is still pending.', 'tx.not.found');
        }
    }

    public async transferErc721(body: CeloTransferErc721 | EthTransferErc721 | FlowTransferNft): Promise<TransactionHash | { signatureId: string }> {
        const testnet = await this.isTestnet();
        let txData;
        const {chain} = body;
        const provider = (await this.getNodesUrl(chain, testnet))[0];
        switch (chain) {
            case Currency.ETH:
                txData = await prepareEthTransferErc721SignedTransaction(body as EthTransferErc721, provider);
                break;
            case Currency.BSC:
                txData = await prepareBscTransferBep721SignedTransaction(body as EthTransferErc721, provider);
                break;
            case Currency.CELO:
                txData = await prepareCeloTransferErc721SignedTransaction(testnet, body as CeloTransferErc721, provider);
                break;
            case Currency.FLOW:
                if (body.signatureId) {
                    txData = JSON.stringify({type: FlowTxType.TRANSFER_NFT, body});
                } else {
                    return await sendFlowNftTransferToken(testnet, body as FlowTransferNft);
                }
                break;
            case Currency.XDC:
                txData = await prepareXdcTransferErc721SignedTransaction(body, (await this.getNodesUrl(chain, testnet))[0]);
                break;
            default:
                throw new NftError(`Unsupported chain ${chain}.`, 'unsupported.chain');
        }
        if (body.signatureId) {
            return {signatureId: await this.storeKMSTransaction(txData, chain, [body.signatureId], body.index)};
        } else {
            return this.broadcast(chain, txData);
        }
    }

    public async mintErc721(body: CeloMintErc721 | EthMintErc721 | FlowMintNft): Promise<TransactionHash | { signatureId: string }> {
        const testnet = await this.isTestnet();
        let txData;
        const {chain} = body;
        const provider = (await this.getNodesUrl(chain, testnet))[0];
        switch (chain) {
            case Currency.ETH:
                if (!(body as EthMintErc721).authorAddresses) {
                    txData = await prepareEthMintErc721SignedTransaction(body as EthMintErc721, provider);
                } else {
                    txData = await prepareEthMintCashbackErc721SignedTransaction(body as EthMintErc721, provider);
                }
                break;
            case Currency.BSC:
                if (!(body as EthMintErc721).authorAddresses) {
                    txData = await prepareBscMintBep721SignedTransaction(body as EthMintErc721, provider);
                } else {
                    txData = await prepareBscMintBepCashback721SignedTransaction(body as EthMintErc721, provider);
                }
                break;
            case Currency.CELO:
                if (!(body as CeloMintErc721).authorAddresses) {
                    txData = await prepareCeloMintErc721SignedTransaction(testnet, body as CeloMintErc721, provider);
                } else {
                    txData = await prepareCeloMintCashbackErc721SignedTransaction(testnet, body as CeloMintErc721, provider);
                }
                break;
            case Currency.FLOW:
                if (body.signatureId) {
                    txData = JSON.stringify({type: FlowTxType.MINT_NFT, body});
                } else {
                    return await sendFlowNftMintToken(testnet, body as FlowMintNft);
                }
            case Currency.XDC:
                if (!(body as EthMintErc721).authorAddresses) {
                    txData = await prepareXdcMintErc721SignedTransaction(body as EthMintErc721, provider);
                } else {
                    txData = await prepareXdcMintErcCashback721SignedTransaction(body as EthMintErc721, provider);
                }
                break;
            default:
                throw new NftError(`Unsupported chain ${chain}.`, 'unsupported.chain');
        }
        if (body.signatureId) {
            return {signatureId: await this.storeKMSTransaction(txData, chain, [body.signatureId], body.index)};
        } else {
            return this.broadcast(chain, txData);
        }
    }

    public async mintMultipleErc721(body: CeloMintMultipleErc721 | EthMintMultipleErc721 | FlowMintMultipleNft): Promise<TransactionHash | { signatureId: string }> {
        const testnet = await this.isTestnet();
        let txData;
        const {chain} = body;
        const provider = (await this.getNodesUrl(chain, testnet))[0];
        switch (chain) {
            case Currency.ETH:
                if (!(body as EthMintMultipleErc721).authorAddresses) {
                    txData = await prepareEthMintMultipleErc721SignedTransaction(body as EthMintMultipleErc721, provider);
                } else {
                    txData = await prepareEthMintMultipleCashbackErc721SignedTransaction(body as EthMintMultipleErc721, provider);
                }
                break;
            case Currency.BSC:
                if (!(body as EthMintMultipleErc721).authorAddresses) {
                    txData = await prepareBscMintMultipleBep721SignedTransaction(body as EthMintMultipleErc721, provider);
                } else {
                    txData = await prepareBscMintMultipleCashbackBep721SignedTransaction(body as EthMintMultipleErc721, provider);
                }
                break;
            case Currency.CELO:
                if (!(body as CeloMintMultipleErc721).authorAddresses) {
                    txData = await prepareCeloMintMultipleErc721SignedTransaction(testnet, body as CeloMintMultipleErc721, provider);
                } else {
                    txData = await prepareCeloMintMultipleCashbackErc721SignedTransaction(testnet, body as CeloMintMultipleErc721, provider);
                }
                break;
            case Currency.FLOW:
                if (body.signatureId) {
                    txData = JSON.stringify({type: FlowTxType.MINT_MULTIPLE_NFT, body});
                } else {
                    return await sendFlowNftMintMultipleToken(testnet, body as FlowMintMultipleNft);
                }
            case Currency.XDC:
                if (!(body as EthMintMultipleErc721).authorAddresses) {
                    txData = await prepareXdcMintMultipleErc721SignedTransaction(body as EthMintMultipleErc721, provider);
                } else {
                    txData = await prepareXdcMintMultipleCashbackErc721SignedTransaction(body as EthMintMultipleErc721, provider);
                }
                break;
            default:
                throw new NftError(`Unsupported chain ${chain}.`, 'unsupported.chain');
        }
        if (body.signatureId) {
            return {signatureId: await this.storeKMSTransaction(txData, chain, [body.signatureId], body.index)};
        } else {
            return this.broadcast(chain, txData);
        }
    }

    public async updateCashbackForAuthor(body: CeloUpdateCashbackErc721 | UpdateCashbackErc721): Promise<TransactionHash | { signatureId: string }> {
        const testnet = await this.isTestnet();
        let txData;
        const {chain} = body;
        switch (chain) {
            case Currency.ETH:
                txData = await prepareEthUpdateCashbackForAuthorErc721SignedTransaction(body, (await this.getNodesUrl(chain, testnet))[0]);
                break;
            case Currency.BSC:
                txData = await prepareBscUpdateCashbackForAuthorErc721SignedTransaction(body, (await this.getNodesUrl(chain, testnet))[0]);
                break;
            case Currency.CELO:
                txData = await prepareCeloUpdateCashbackForAuthorErc721SignedTransaction(testnet, body as CeloUpdateCashbackErc721, (await this.getNodesUrl(chain, testnet))[0]);
                break;
            case Currency.XDC:
                txData = await prepareXdcUpdateCashbackForAuthorErc721SignedTransaction(body, (await this.getNodesUrl(chain, testnet))[0]);
                break;
            default:
                throw new NftError(`Unsupported chain ${chain}.`, 'unsupported.chain');
        }
        if (body.signatureId) {
            return {signatureId: await this.storeKMSTransaction(txData, chain, [body.signatureId], body.index)};
        } else {
            return this.broadcast(chain, txData);
        }
    }

    public async burnErc721(body: CeloBurnErc721 | EthBurnErc721 | FlowBurnNft): Promise<TransactionHash | { signatureId: string }> {
        const testnet = await this.isTestnet();
        let txData;
        const {chain} = body;
        const provider = (await this.getNodesUrl(chain, testnet))[0];
        switch (chain) {
            case Currency.ETH:
                txData = await prepareEthBurnErc721SignedTransaction(body as EthBurnErc721, provider);
                break;
            case Currency.BSC:
                txData = await prepareBscBurnBep721SignedTransaction(body as EthBurnErc721, provider);
                break;
            case Currency.CELO:
                txData = await prepareCeloBurnErc721SignedTransaction(testnet, body as CeloBurnErc721, provider);
                break;
            case Currency.FLOW:
                if (body.signatureId) {
                    txData = JSON.stringify({type: FlowTxType.BURN_NFT, body});
                } else {
                    return await sendFlowNftBurnToken(testnet, body as FlowBurnNft);
                }
                break;
            case Currency.XDC:
                txData = await prepareXdcBurnErc721SignedTransaction(body, (await this.getNodesUrl(chain, testnet))[0]);
                break;
            default:
                throw new NftError(`Unsupported chain ${chain}.`, 'unsupported.chain');
        }
        if (body.signatureId) {
            return {signatureId: await this.storeKMSTransaction(txData, chain, [body.signatureId], body.index)};
        } else {
            return this.broadcast(chain, txData);
        }
    }

    public async deployErc721(body: CeloDeployErc721 | EthDeployErc721 | FlowDeployNft): Promise<TransactionHash | { signatureId: string }> {
        const testnet = await this.isTestnet();
        let txData;
        const {chain} = body;
        const provider = (await this.getNodesUrl(chain, testnet))[0];
        switch (chain) {
            case Currency.ETH:
                txData = await prepareEthDeployErc721SignedTransaction(body as EthDeployErc721, provider);
                break;
            case Currency.BSC:
                txData = await prepareBscDeployBep721SignedTransaction(body as EthDeployErc721, provider);
                break;
            case Currency.CELO:
                txData = await prepareCeloDeployErc721SignedTransaction(testnet, body as CeloDeployErc721, provider);
                break;
            case Currency.FLOW:
                await this.deployFlowNft(testnet, body as FlowDeployNft);
                return;
            case Currency.XDC:
                txData = await prepareXdcDeployErc721SignedTransaction(body as EthDeployErc721, (await this.getNodesUrl(chain, testnet))[0]);
                break;
            default:
                throw new NftError(`Unsupported chain ${chain}.`, 'unsupported.chain');
        }
        if (body.signatureId) {
            return {signatureId: await this.storeKMSTransaction(txData, chain, [body.signatureId], body.index)};
        } else {
            return this.broadcast(chain, txData);
        }
    }

    private async getClient(chain: Currency, testnet: boolean) {
        const url = (await this.getNodesUrl(chain, testnet))[0];
        if (chain === Currency.FLOW) {
            fcl.config().put('accessNode.api', url);
            return;
        }
        return new Web3(url);
    }
}
