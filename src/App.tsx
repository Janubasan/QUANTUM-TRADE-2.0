import { useState, useEffect } from 'react';
import { Account, Bot, Trade, Ticker, SystemLog } from './types';
import {
  fetchAccounts,
  fetchBots,
  fetchTrades,
  fetchTickers,
  fetchLogs,
} from './services/api';
import { Navbar } from './components/Navbar';
import { TickerBar } from './components/TickerBar';
import { DashboardView } from './components/DashboardView';
import { AccountsView } from './components/AccountsView';
import { BotsView } from './components/BotsView';
import { WebhookView } from './components/WebhookView';
import { AuditValidationView } from './components/AuditValidationView';
import { EntanglementView } from './components/EntanglementView';

import { BacktestingView } from './components/BacktestingView';
import { TradeHistoryView } from './components/TradeHistoryView';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tickers, setTickers] = useState<Record<string, Ticker>>({});
  const [logs, setLogs] = useState<SystemLog[]>([]);

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC/BRL');

  const loadData = async () => {
    try {
      const [accs, bts, trds, tcks, lgs] = await Promise.all([
        fetchAccounts().catch(() => []),
        fetchBots().catch(() => []),
        fetchTrades().catch(() => []),
        fetchTickers().catch(() => ({})),
        fetchLogs().catch(() => []),
      ]);

      if (accs.length > 0) setAccounts(accs);
      setBots(bts);
      setTrades(trds);
      if (Object.keys(tcks).length > 0) setTickers(tcks);
      setLogs(lgs);

      if (!selectedAccountId && accs.length > 0) {
        setSelectedAccountId(accs[0].id);
      }
    } catch (err) {
      console.error('Error in loadData:', err);
    }
  };

  useEffect(() => {
    loadData();

    // Subscribe to SSE real-time stream from server
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/stream');
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.accounts) setAccounts(data.accounts);
          if (data.bots) setBots(data.bots);
          if (data.trades) setTrades(data.trades);
          if (data.tickers) setTickers(data.tickers);
          if (data.logs) setLogs(data.logs);
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };
      eventSource.onerror = () => {
        // EventSource will automatically attempt to reconnect; polling provides seamless fallback
      };
    } catch (e) {
      console.warn('SSE fallback to polling:', e);
    }

    // Polling fallback
    const interval = setInterval(loadData, 3000);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(interval);
    };
  }, []);

  const selectedAccount =
    accounts.find((a) => a.id === selectedAccountId) || accounts[0] || {
      id: 'demo-1',
      name: 'Desafio R$100 Demo',
      broker: 'binance',
      type: 'demo',
      initialBalance: 100,
      currentBalance: 105.8,
      baseCurrency: 'BRL',
      isActive: true,
      createdAt: new Date().toISOString(),
      totalTrades: 4,
      winningTrades: 3,
      pnlTotal: 5.8,
    };

  return (
    <div className="min-h-screen bg-[#050507] text-[#e0e0e0] font-sans selection:bg-cyan-500 selection:text-slate-950 flex flex-col">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        setSelectedAccountId={setSelectedAccountId}
        bots={bots}
        onOpenNewAccountModal={() => setActiveTab('accounts')}
      />

      {/* Live Market Price Ticker Marquee Bar */}
      <TickerBar
        tickers={tickers}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={setSelectedSymbol}
      />

      {/* Main View Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            account={selectedAccount}
            trades={trades}
            tickers={tickers}
            selectedSymbol={selectedSymbol}
            onRefreshData={loadData}
          />
        )}

        {activeTab === 'accounts' && (
          <AccountsView accounts={accounts} onRefreshData={loadData} />
        )}

        {activeTab === 'bots' && (
          <BotsView
            bots={bots}
            accounts={accounts}
            logs={logs}
            onRefreshData={loadData}
          />
        )}

        {activeTab === 'webhook' && <WebhookView />}

        {activeTab === 'validation' && <AuditValidationView />}

        {activeTab === 'entanglement' && <EntanglementView />}


        {activeTab === 'backtest' && <BacktestingView />}

        {activeTab === 'history' && (
          <TradeHistoryView trades={trades} logs={logs} />
        )}
      </main>
    </div>
  );
}
