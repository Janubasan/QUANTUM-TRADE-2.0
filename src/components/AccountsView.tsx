import React, { useState } from 'react';
import { Account, BrokerId, AccountType } from '../types';
import { createAccount, resetDemoAccount, deleteAccount } from '../services/api';
import {
  Wallet,
  Plus,
  RefreshCw,
  Trash2,
  ShieldCheck,
  Key,
  X,
  CheckCircle,
} from 'lucide-react';

interface AccountsViewProps {
  accounts: Account[];
  onRefreshData: () => void;
}

export function AccountsView({ accounts, onRefreshData }: AccountsViewProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [broker, setBroker] = useState<BrokerId>('binance');
  const [type, setType] = useState<AccountType>('demo');
  const [initialBalance, setInitialBalance] = useState<number>(100);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const brokerLabels: Record<BrokerId, { name: string; color: string }> = {
    binance: { name: 'Binance (Spot & Futures)', color: 'border-amber-500/40 text-amber-400 bg-amber-500/10' },
    mercado_bitcoin: { name: 'Mercado Bitcoin (BRL v4)', color: 'border-blue-500/40 text-blue-400 bg-blue-500/10' },
    ibkr: { name: 'Interactive Brokers (IBKR)', color: 'border-rose-500/40 text-rose-400 bg-rose-500/10' },
    bybit: { name: 'Bybit Derivatives', color: 'border-purple-500/40 text-purple-400 bg-purple-500/10' },
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createAccount({
        name,
        broker,
        type,
        initialBalance,
        apiKeyEncrypted: apiKey,
        apiSecretEncrypted: apiSecret,
      });
      setIsModalOpen(false);
      setName('');
      setApiKey('');
      setApiSecret('');
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
            Gerenciamento de Contas Multi-Broker
          </h2>
          <p className="text-xs text-white/40 mt-1">
            Conecte suas contas Demo e Reais em corretoras nacionais e internacionais.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-3 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs font-mono uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.4)] transition"
        >
          <Plus className="w-4 h-4" /> Nova Conta
        </button>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {accounts.map((acc) => {
          const profit = acc.currentBalance - acc.initialBalance;
          const brokerInfo = brokerLabels[acc.broker] || brokerLabels.binance;

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
                      {acc.baseCurrency} {acc.initialBalance.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Saldo Atual:</span>
                    <span className="font-bold text-cyan-300">
                      {acc.baseCurrency} {acc.currentBalance.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Lucro Acumulado:</span>
                    <span className={`font-bold ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {profit >= 0 ? '+' : ''}
                      {acc.baseCurrency} {profit.toFixed(2)}
                    </span>
                  </div>
                </div>

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
                    <RefreshCw className="w-3 h-3 text-cyan-400" /> Reset R$100
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
          <div className="bg-[#09090d] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative space-y-4">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 text-white/40 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-400" /> Adicionar Conta Multi-Broker
            </h3>

            <form onSubmit={handleCreateAccount} className="space-y-4 text-xs font-mono">
              <div>
                <label className="text-white/50 block mb-1">Nome da Conta</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Minha Conta Binance Real"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-white/50 block mb-1">Corretora</label>
                  <select
                    value={broker}
                    onChange={(e) => setBroker(e.target.value as BrokerId)}
                    className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                  >
                    <option value="binance" className="bg-zinc-900">Binance</option>
                    <option value="mercado_bitcoin" className="bg-zinc-900">Mercado Bitcoin</option>
                    <option value="ibkr" className="bg-zinc-900">Interactive Brokers</option>
                    <option value="bybit" className="bg-zinc-900">Bybit</option>
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
                      else setInitialBalance(500);
                    }}
                    className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                  >
                    <option value="demo" className="bg-zinc-900">Demo (Simulada)</option>
                    <option value="real" className="bg-zinc-900">Real (Corretora)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-white/50 block mb-1">Saldo Inicial (BRL/USDT)</label>
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
                    <label className="text-white/50 block mb-1">API Key</label>
                    <input
                      type="text"
                      placeholder="Sua API Key da Corretora"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-2xl p-3 text-white outline-none focus:border-cyan-500/50"
                    />
                  </div>

                  <div>
                    <label className="text-white/50 block mb-1">API Secret</label>
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
