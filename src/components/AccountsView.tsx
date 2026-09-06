import React, { useState } from 'react';
import { Account, BrokerId, AccountType } from '../types';
import { createAccount, resetDemoAccount, deleteAccount, setMetaMaskWatchAddress } from '../services/api';
import {
  Wallet,
  Plus,
  RefreshCw,
  Trash2,
  ShieldCheck,
  Key,
  X,
  CheckCircle,
  Copy,
  Check,
  Coins,
  ExternalLink,
} from 'lucide-react';
import { connectMetaMask, FALLBACK_SEPOLIA_ADDRESS } from '../lib/web3MetaMask';

interface AccountsViewProps {
  accounts: Account[];
  onRefreshData: () => void;
}

export function AccountsView({ accounts, onRefreshData }: AccountsViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [broker, setBroker] = useState<BrokerId>('coinbase');
  const [type, setType] = useState<AccountType>('real');
  const [initialBalance, setInitialBalance] = useState<number>(100);
  const [walletAddress, setWalletAddress] = useState('3G24UKtkZzYmYewL2fPEGs4hq8SBfwmGVv');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // MetaMask modal Web3 connection state
  const [mmModalConnecting, setMmModalConnecting] = useState(false);
  const [mmModalNotice, setMmModalNotice] = useState<{ type: 'success' | 'warning' | 'info'; text: string } | null>(null);

  const handleBrokerChange = (newBroker: BrokerId) => {
    setBroker(newBroker);
    setMmModalNotice(null);
    if (newBroker === 'metamask' || newBroker === 'blockchain_evm') {
      if (walletAddress === '3G24UKtkZzYmYewL2fPEGs4hq8SBfwmGVv') {
        setWalletAddress('');
      }
    } else if (newBroker === 'coinbase') {
      if (!walletAddress) {
        setWalletAddress('3G24UKtkZzYmYewL2fPEGs4hq8SBfwmGVv');
      }
    }
  };

  const handleDetectMetaMaskInModal = async () => {
    setMmModalConnecting(true);
    setMmModalNotice(null);
    try {
      const res = await connectMetaMask();
      if (res.success && res.address) {
        setWalletAddress(res.address);
        setMmModalNotice({
          type: 'success',
          text: `Carteira conectada: ${res.address.slice(0, 6)}...${res.address.slice(-4)} (${res.chainName || 'EVM'})`,
        });
      } else {
        setMmModalNotice({
          type: 'info',
          text: res.error || 'MetaMask não respondeu neste ambiente. Você pode usar a carteira Sepolia Testnet abaixo ou colar manualmente.',
        });
      }
    } catch (err: any) {
      if (err?.code === 4001) {
        setMmModalNotice({ type: 'warning', text: 'Conexão cancelada pelo usuário no popup MetaMask.' });
      } else {
        setMmModalNotice({ type: 'warning', text: `Erro de detecção Web3: ${err?.message || 'Falha de comunicação'}` });
      }
    } finally {
      setMmModalConnecting(false);
    }
  };

  const brokerLabels: Record<BrokerId, { name: string; color: string }> = {
    binance: { name: 'Binance (Spot & Futures CCXT)', color: 'border-amber-500/40 text-amber-400 bg-amber-500/10' },
    mt5: { name: 'MetaTrader 5 (JOAT Python Bridge)', color: 'border-blue-500/40 text-blue-400 bg-blue-500/10' },
    ctrader: { name: 'cTrader Open API (IC Markets)', color: 'border-cyan-500/40 text-cyan-400 bg-cyan-500/10' },
    blockchain_evm: { name: 'Direct EVM Blockchain (7 Chains DEX)', color: 'border-purple-500/40 text-purple-400 bg-purple-500/10' },
    coinbase: { name: 'Coinbase (Bitcoin & Vault)', color: 'border-indigo-500/40 text-indigo-400 bg-indigo-500/10' },
    metamask: { name: 'MetaMask (Web3 DeFi Wallet)', color: 'border-orange-500/40 text-orange-400 bg-orange-500/10' },
    national_broker: { name: 'B3 Brasil (XP / Genial / Clear)', color: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' },
    mercado_bitcoin: { name: 'Mercado Bitcoin (BRL v4)', color: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' },
    ibkr: { name: 'Interactive Brokers (IBKR)', color: 'border-rose-500/40 text-rose-400 bg-rose-500/10' },
    bybit: { name: 'Bybit Derivatives', color: 'border-purple-500/40 text-purple-400 bg-purple-500/10' },
    paper: { name: 'Quantum Paper Sim', color: 'border-zinc-500/40 text-zinc-300 bg-zinc-500/10' },
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createAccount({
        name: name || (broker === 'coinbase' ? 'Coinbase Bitcoin Vault' : `Conta ${broker.toUpperCase()}`),
        broker,
        type,
        initialBalance,
        walletAddress: walletAddress || (broker === 'coinbase' ? '3G24UKtkZzYmYewL2fPEGs4hq8SBfwmGVv' : undefined),
        apiKeyEncrypted: apiKey,
        apiSecretEncrypted: apiSecret,
      });

      // Se for conta MetaMask com endereço EVM, sincroniza também o gateway backend
      if (broker === 'metamask' && walletAddress && walletAddress.startsWith('0x')) {
        await setMetaMaskWatchAddress(walletAddress).catch(() => null);
      }

      setIsModalOpen(false);
      setName('');
      setApiKey('');
      setApiSecret('');
      setMmModalNotice(null);
      onRefreshData();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetDemo = async (id: string) => {
    try {
      await resetDemoAccount(id);
      onRefreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (confirm('Tem certeza que deseja remover esta conta?')) {
      try {
        await deleteAccount(id);
        onRefreshData();
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2 tracking-tight">
            <Wallet className="w-5 h-5 text-cyan-400" />
            Gerenciamento de Contas Multi-Broker & Carteiras Crypto
          </h2>
          <p className="text-xs text-white/40 mt-1">
            Conecte suas contas Coinbase, Binance, Mercado Bitcoin e endereços Bitcoin auditados.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.4)] transition"
        >
          <Plus className="w-4 h-4" /> Nova Conta / Carteira
        </button>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {accounts.map((acc) => {
          const profit = acc.currentBalance - acc.initialBalance;
          const brokerInfo = brokerLabels[acc.broker] || brokerLabels.coinbase;

          return (
            <div
              key={acc.id}
              className="bg-zinc-900/30 border border-white/5 rounded-3xl p-6 shadow-2xl flex flex-col justify-between hover:border-white/10 transition group"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-bold border ${brokerInfo.color}`}>
                      {acc.broker.replace('_', ' ')}
                    </span>
                    <h3 className="text-lg font-bold text-white mt-3 tracking-tight">{acc.name}</h3>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase ${
                      acc.type === 'demo'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {acc.type}
                  </span>
                </div>

                {/* Balances */}
                <div className="mt-5 pt-4 border-t border-white/5 space-y-2.5 font-mono">
                  <div className="flex justify-between text-xs text-white/40">
                    <span>Saldo Inicial:</span>
                    <span className="text-white/80">
                      {acc.baseCurrency} {(acc.initialBalance ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Saldo Atual:</span>
                    <span className="font-bold text-cyan-300">
                      {acc.baseCurrency} {(acc.currentBalance ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Lucro Acumulado:</span>
                    <span className={`font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {profit >= 0 ? '+' : ''}
                      {acc.baseCurrency} {(profit ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Wallet Address Badge if present */}
                {acc.walletAddress && (
                  <div className={`mt-4 p-3 rounded-2xl bg-black/60 border ${
                    acc.broker === 'metamask' || acc.broker === 'blockchain_evm'
                      ? 'border-orange-500/30 text-orange-300'
                      : 'border-amber-500/30 text-amber-300'
                  } text-[11px] font-mono space-y-1`}>
                    <div className="flex items-center justify-between text-white/50 text-[10px]">
                      <span className={`flex items-center gap-1 font-bold ${
                        acc.broker === 'metamask' || acc.broker === 'blockchain_evm' ? 'text-orange-400' : 'text-amber-400'
                      }`}>
                        {acc.broker === 'metamask' ? (
                          <>
                            <Wallet className="w-3.5 h-3.5 text-orange-400" /> Carteira MetaMask Web3 (EVM):
                          </>
                        ) : acc.broker === 'blockchain_evm' ? (
                          <>
                            <Wallet className="w-3.5 h-3.5 text-purple-400" /> Carteira EVM On-Chain:
                          </>
                        ) : (
                          <>
                            <Coins className="w-3.5 h-3.5 text-amber-400" /> Endereço Bitcoin (BTC):
                          </>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopy(acc.walletAddress!, acc.id)}
                          className="hover:text-white transition flex items-center gap-1 cursor-pointer text-[10px]"
                          title="Copiar Endereço"
                        >
                          {copiedId === acc.id ? (
                            <span className="text-emerald-400 flex items-center gap-0.5"><Check className="w-3 h-3" /> Copiado</span>
                          ) : (
                            <span className="flex items-center gap-0.5"><Copy className="w-3 h-3" /> Copiar</span>
                          )}
                        </button>
                        {acc.walletAddress.startsWith('0x') && (
                          <a
                            href={`https://sepolia.etherscan.io/address/${acc.walletAddress}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-white transition text-[10px] text-orange-400 flex items-center gap-0.5"
                            title="Ver no Etherscan"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-white font-mono break-all bg-black/50 p-1.5 rounded-lg border border-white/5">
                      {acc.walletAddress}
                    </div>
                  </div>
                )}

                {/* Credentials Badge */}
                {acc.apiKeyEncrypted && (
                  <div className="mt-4 p-3 rounded-2xl bg-black/40 border border-white/5 text-[11px] font-mono text-white/50 flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Credenciais AES-256 Protegidas</span>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                {acc.type === 'demo' ? (
                  <button
                    onClick={() => handleResetDemo(acc.id)}
                    className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white/80 font-mono text-[11px] flex items-center gap-1.5 cursor-pointer transition border border-white/5"
                  >
                    <RefreshCw className="w-3 h-3 text-cyan-400" /> Reset $100 USD
                  </button>
                ) : (
                  <span className="text-[11px] text-white/40 font-mono flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Conexão Segura
                  </span>
                )}

                <button
                  onClick={() => handleDeleteAccount(acc.id)}
                  className="p-2 rounded-full hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
                  title="Excluir Conta"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* New Account Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#09090d] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 text-white/40 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-400" /> Adicionar Conta Multi-Broker & Wallet
            </h3>

            <form onSubmit={handleCreateAccount} className="space-y-4 text-xs font-mono">
              <div>
                <label className="text-white/50 block mb-1">Nome da Conta</label>
                <input
                  type="text"
                  placeholder="Ex: Coinbase Pro Bitcoin Vault"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/50 block mb-1">Corretora / Wallet</label>
                  <select
                    value={broker}
                    onChange={(e) => handleBrokerChange(e.target.value as BrokerId)}
                    className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                  >
                    <option value="binance" className="bg-zinc-900">Binance (Spot & Futures)</option>
                    <option value="mt5" className="bg-zinc-900">MetaTrader 5 (JOAT Bridge)</option>
                    <option value="ctrader" className="bg-zinc-900">cTrader Open API</option>
                    <option value="blockchain_evm" className="bg-zinc-900">Direct EVM Blockchain (7 Chains DEX)</option>
                    <option value="coinbase" className="bg-zinc-900">Coinbase (BTC Vault)</option>
                    <option value="metamask" className="bg-zinc-900">MetaMask (Web3 DeFi)</option>
                    <option value="national_broker" className="bg-zinc-900">B3 Brasil (XP / Genial)</option>
                    <option value="mercado_bitcoin" className="bg-zinc-900">Mercado Bitcoin (BRL)</option>
                    <option value="ibkr" className="bg-zinc-900">Interactive Brokers</option>
                    <option value="bybit" className="bg-zinc-900">Bybit Derivatives</option>
                    <option value="paper" className="bg-zinc-900">Quantum Paper (Simulado)</option>
                  </select>
                </div>

                <div>
                  <label className="text-white/50 block mb-1">Tipo de Conta</label>
                  <select
                    value={type}
                    onChange={(e) => {
                      const t = e.target.value as AccountType;
                      setType(t);
                      if (t === 'demo') setInitialBalance(100);
                      else setInitialBalance(100);
                    }}
                    className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                  >
                    <option value="real" className="bg-zinc-900">Real (Corretora / Carteira)</option>
                    <option value="demo" className="bg-zinc-900">Demo (Simulada)</option>
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-white/50 block">
                    {broker === 'metamask'
                      ? 'Endereço EVM MetaMask (0x...)'
                      : broker === 'blockchain_evm'
                      ? 'Endereço EVM da Carteira (0x...)'
                      : broker === 'coinbase'
                      ? 'Endereço Bitcoin (BTC Vault)'
                      : 'Endereço da Carteira (Opcional)'}
                  </label>
                  {broker === 'metamask' && (
                    <button
                      type="button"
                      onClick={handleDetectMetaMaskInModal}
                      disabled={mmModalConnecting}
                      className="text-[11px] text-orange-400 hover:text-orange-300 font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${mmModalConnecting ? 'animate-spin' : ''}`} />
                      {mmModalConnecting ? 'Detectando...' : 'Detectar MetaMask'}
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  placeholder={
                    broker === 'metamask' || broker === 'blockchain_evm'
                      ? '0x... Cole seu endereço EVM'
                      : 'Ex: 3G24UKtkZzYmYewL2fPEGs4hq8SBfwmGVv'
                  }
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className={`w-full bg-black/50 border ${
                    broker === 'metamask'
                      ? 'border-orange-500/30 text-orange-300 focus:border-orange-500'
                      : broker === 'blockchain_evm'
                      ? 'border-purple-500/30 text-purple-300 focus:border-purple-500'
                      : 'border-amber-500/30 text-amber-300 focus:border-amber-500'
                  } rounded-2xl p-3 outline-none font-mono text-sm`}
                />

                {broker === 'metamask' && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWalletAddress(FALLBACK_SEPOLIA_ADDRESS)}
                      className="text-[11px] text-orange-400/80 hover:text-orange-300 underline cursor-pointer"
                    >
                      Preencher com Carteira Sepolia Testnet (0x71C2...b437)
                    </button>
                  </div>
                )}

                {mmModalNotice && (
                  <div className={`mt-2 p-2 rounded-xl text-xs ${
                    mmModalNotice.type === 'success'
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                      : mmModalNotice.type === 'info'
                      ? 'bg-sky-500/10 border border-sky-500/20 text-sky-300'
                      : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'
                  }`}>
                    {mmModalNotice.text}
                  </div>
                )}
              </div>

              <div>
                <label className="text-white/50 block mb-1">Saldo Inicial ($ USD)</label>
                <input
                  type="number"
                  required
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(parseFloat(e.target.value) || 100)}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                />
              </div>

              {type === 'real' && (
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <div>
                    <label className="text-white/50 block mb-1">API Key (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Sua API Key da Corretora"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>

                  <div>
                    <label className="text-white/50 block mb-1">API Secret (Opcional)</label>
                    <input
                      type="password"
                      placeholder="Seu API Secret (Criptografado AES-256)"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.4)]"
              >
                <CheckCircle className="w-4 h-4" />
                {isSubmitting ? 'Criando Conta...' : 'Salvar e Conectar Conta'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
