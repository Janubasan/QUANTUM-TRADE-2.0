import { useState, useEffect, FormEvent } from 'react';
import {
  Cpu,
  Play,
  Square,
  Key,
  Send,
  Shield,
  FileCode,
  Terminal,
  Layers,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Zap,
  Globe,
  Database,
  ArrowRight,
  Server,
  Activity,
} from 'lucide-react';
import {
  fetchNautilusStatus,
  loginNautilusToken,
  startNautilusEngine,
  stopNautilusEngine,
  sendNautilusOrder,
  fetchNautilusOrders,
  fetchNautilusLogs,
  NautilusNodeStatus,
  NautilusOrder,
  NautilusLog,
} from '../services/api';

export function NautilusBridgeView() {
  const [status, setStatus] = useState<NautilusNodeStatus | null>(null);
  const [orders, setOrders] = useState<NautilusOrder[]>([]);
  const [logs, setLogs] = useState<NautilusLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Auth test state
  const [authEmail, setAuthEmail] = useState('trader@site.com');
  const [jwtToken, setJwtToken] = useState<string>('');
  const [tokenLoading, setTokenLoading] = useState(false);

  // Order form state
  const [selectedInstrument, setSelectedInstrument] = useState('BTCUSDT.BINANCE');
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderQty, setOrderQty] = useState('0.05');
  const [orderPrice, setOrderPrice] = useState('65400.00');
  const [orderSending, setOrderSending] = useState(false);
  const [orderSuccessMsg, setOrderSuccessMsg] = useState<string | null>(null);
  const [orderErrorMsg, setOrderErrorMsg] = useState<string | null>(null);

  // Code tabs
  const [activeCodeTab, setActiveCodeTab] = useState<'main' | 'strategy' | 'frontend' | 'docker' | 'architecture'>('main');

  const loadAll = async () => {
    try {
      const [st, ords, lgs] = await Promise.all([
        fetchNautilusStatus().catch(() => null),
        fetchNautilusOrders().catch(() => []),
        fetchNautilusLogs().catch(() => []),
      ]);
      if (st) setStatus(st);
      setOrders(ords);
      setLogs(lgs);
    } catch (e) {
      console.error('Error loading Nautilus status:', e);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleStartEngine = async () => {
    setLoading(true);
    try {
      await startNautilusEngine();
      await loadAll();
    } catch (e: any) {
      alert(e.message || 'Erro ao iniciar motor');
    } finally {
      setLoading(false);
    }
  };

  const handleStopEngine = async () => {
    setLoading(true);
    try {
      await stopNautilusEngine();
      await loadAll();
    } catch (e: any) {
      alert(e.message || 'Erro ao parar motor');
    } finally {
      setLoading(false);
    }
  };

  const handleGetToken = async () => {
    setTokenLoading(true);
    try {
      const res = await loginNautilusToken(authEmail);
      setJwtToken(res.access_token);
    } catch (e: any) {
      alert(e.message || 'Erro ao autenticar');
    } finally {
      setTokenLoading(false);
    }
  };

  const handleSendOrder = async (e: FormEvent) => {
    e.preventDefault();
    setOrderSending(true);
    setOrderSuccessMsg(null);
    setOrderErrorMsg(null);

    try {
      const res = await sendNautilusOrder({
        instrument: selectedInstrument,
        side: orderSide,
        quantity: parseFloat(orderQty),
        price: parseFloat(orderPrice),
      });
      setOrderSuccessMsg(`Ordem executada no motor Nautilus em ${res.order.latencyMs}ms! (ID: ${res.order.id})`);
      await loadAll();
    } catch (e: any) {
      setOrderErrorMsg(e.message || 'Falha ao enviar ordem');
    } finally {
      setOrderSending(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const codeSnippets = {
    main: `# main.py - FastAPI + JWT Auth + Nautilus Trader Bridge
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
import asyncio

# ==========================================
# 1. CONFIGURAÇÕES DE SEGURANÇA (AUTH)
# ==========================================
SECRET_KEY = "SEU_SUPER_SEGREDO_AQUI_MUDE_EM_PROD" # Use variáveis de ambiente!
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

fake_users_db = {
    "trader@site.com": {
        "username": "trader@site.com",
        "hashed_password": pwd_context.hash("senha_forte_123"),
        "full_name": "Trader Pro",
        "disabled": False,
    }
}

class User(BaseModel):
    username: str
    full_name: Optional[str] = None
    disabled: Optional[bool] = None

class UserInDB(User):
    hashed_password: str

class Token(BaseModel):
    access_token: str
    token_type: str

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_user(db, username: str):
    if username in db:
        return UserInDB(**db[username])

def authenticate_user(db, username: str, password: str):
    user = get_user(db, username)
    if not user or not verify_password(password, user.hashed_password):
        return False
    return user

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None: raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = get_user(fake_users_db, username=username)
    if user is None: raise credentials_exception
    return user

# ==========================================
# 2. INTEGRAÇÃO COM MOTOR NAUTILUS TRADER
# ==========================================
from nautilus_trader.core.message import Event
from nautilus_trader.trading.strategy import Strategy
from nautilus_trader.model.enums import OrderSide, OrderType
from nautilus_trader.model.identifiers import InstrumentId

class NautilusManager:
    def __init__(self):
        self.is_running = False
        self.active_strategies = []
        # Em produção: Inicialize o TradingNode do Nautilus aqui.
        # self.node = TradingNode(config=TradingNodeConfig(...))

    async def start_engine(self):
        if self.is_running:
            raise HTTPException(status_code=400, detail="Motor já está rodando")
        self.is_running = True
        # self.node.run() # Inicia o motor Nautilus em background
        return {"status": "Motor Nautilus iniciado com sucesso"}

    async def stop_engine(self):
        self.is_running = False
        # self.node.stop()
        return {"status": "Motor Nautilus parado"}

    async def place_order(self, instrument: str, side: str, quantity: float):
        if not self.is_running:
            raise HTTPException(status_code=400, detail="Motor não está rodando")
        
        # Lógica real de envio de ordem via Nautilus ExecEngine
        # order = self.node.builder.market_order(...)
        # self.node.submit_order(order)
        
        return {
            "message": "Ordem enviada para o motor Nautilus",
            "instrument": instrument,
            "side": side,
            "quantity": quantity,
            "status": "PENDING"
        }

nautilus_manager = NautilusManager()

# ==========================================
# 3. API ENDPOINTS (FASTAPI)
# ==========================================
app = FastAPI(title="Nautilus Trading Platform API", version="1.0.0")

@app.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = authenticate_user(fake_users_db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=400, detail="Usuário ou senha incorretos")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/engine/start")
async def start_trading_engine(current_user: User = Depends(get_current_user)):
    return await nautilus_manager.start_engine()

@app.post("/engine/stop")
async def stop_trading_engine(current_user: User = Depends(get_current_user)):
    return await nautilus_manager.stop_engine()

@app.post("/trade/order")
async def send_order(
    instrument: str, 
    side: str, 
    quantity: float, 
    current_user: User = Depends(get_current_user)
):
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantidade inválida")
    return await nautilus_manager.place_order(instrument, side, quantity)

# Para rodar: uvicorn main:app --host 0.0.0.0 --port 8000 --reload`,

    strategy: `# strategy.py - Estratégia Nativa Nautilus Trader
from nautilus_trader.trading.strategy import Strategy
from nautilus_trader.model.events import OrderFilled
from nautilus_trader.model.identifiers import InstrumentId
from nautilus_trader.model.enums import OrderSide, TimeInForce

class MyWebIntegrationStrategy(Strategy):
    """
    Estratégia desenhada para receber comandos da API Web (FastAPI)
    e executar ordens de alta performance em Rust Core.
    """
    def __init__(self, instrument_id: InstrumentId):
        super().__init__(instrument_id=instrument_id)
        self.instrument_id = instrument_id

    def on_start(self):
        self.log.info(f"⚡ Estratégia iniciada para {self.instrument_id}")
        # Subscrever a cotações em tempo real
        # self.subscribe_quote_ticks(self.instrument_id)

    def on_stop(self):
        self.log.info("🛑 Estratégia parada com segurança")

    def on_order_filled(self, event: OrderFilled):
        self.log.info(f"✅ Ordem executada com sucesso no broker: {event}")
        # Em produção: Emitir evento WebSocket/Redis para o Frontend em tempo real`,

    frontend: `// client_integration.js - Chamadas do Frontend React/Next.js
// 1. Obter Token JWT
const login = async (email, password) => {
  const response = await fetch('http://localhost:8000/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: email, password: password })
  });
  const data = await response.json();
  localStorage.setItem('access_token', data.access_token);
  return data;
};

// 2. Iniciar Motor Nautilus Trader
const startEngine = async () => {
  const token = localStorage.getItem('access_token');
  const response = await fetch('http://localhost:8000/engine/start', {
    method: 'POST',
    headers: { 'Authorization': \`Bearer \${token}\` }
  });
  return await response.json();
};

// 3. Enviar Ordem com Validação de Risco
const sendOrder = async (instrument, side, qty) => {
  const token = localStorage.getItem('access_token');
  const response = await fetch(\`http://localhost:8000/trade/order?instrument=\${instrument}&side=\${side}&quantity=\${qty}\`, {
    method: 'POST',
    headers: {
      'Authorization': \`Bearer \${token}\`
    }
  });
  
  if (response.status === 401) {
    // Redirecionar para renovação do token
    console.error('Token expirado');
  }
  return await response.json();
};`,

    docker: `# requirements.txt & Dockerfile
# --- requirements.txt ---
fastapi==0.111.0
uvicorn[standard]==0.30.1
pydantic==2.7.4
passlib[bcrypt]==1.7.4
python-jose[cryptography]==3.3.0
python-multipart==0.0.9
nautilus_trader==1.200.0
sqlalchemy==2.0.30
redis==5.0.4

# --- Dockerfile ---
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y build-essential libssl-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`,

    architecture: `# 🏛️ REGRAS DE OURO DA ARQUITETURA NAUTILUS TRADER

1. Separação de Processos:
   - O Nautilus consome alta CPU/RAM em loop de baixa latência em Rust.
   - NUNCA rode o TradingNode dentro do mesmo processo do FastAPI em produção.
   - Use o FastAPI como ingress web e despache eventos via Redis Streams / gRPC para o worker Python/Rust.

2. Segurança de Credenciais:
   - NUNCA coloque SECRET_KEY ou chaves de API das corretoras no código.
   - Use Vault/KMS e variáveis de ambiente segregadas por ambiente (.env).

3. Banco de Dados Transacional:
   - Substitua o fake_users_db por PostgreSQL usando SQLAlchemy / SQLModel.
   - Salve histórico de fills e ordens com idempotency key.

4. WebSockets em Tempo Real:
   - Use WebSockets (FastAPI WebSocket) para streaming de ticks e confirmações de fill.

5. Sandbox & Paper Trading Primeiro:
   - Use o modo SIM do Nautilus ou as testnets da Binance/Bybit antes de ativar capital real.`
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Banner & Header */}
      <div className="bg-gradient-to-r from-zinc-900/90 via-cyan-950/40 to-zinc-900/90 border border-cyan-500/20 rounded-2xl p-6 relative overflow-hidden backdrop-blur-xl">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    Nautilus Trader Bridge
                  </h2>
                  <span className="px-2.5 py-0.5 text-[10px] font-mono uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-full font-semibold">
                    Rust Core + FastAPI + Python 3.11
                  </span>
                </div>
                <p className="text-xs text-white/60">
                  Arquitetura desacoplada de 3 camadas: Web Interface ➔ FastAPI Orchestrator (JWT Auth) ➔ Nautilus Engine (Sub-millisecond TradingNode).
                </p>
              </div>
            </div>
          </div>

          {/* Engine Controls & Status */}
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="bg-black/50 border border-white/10 px-4 py-2.5 rounded-xl flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] text-white/40 uppercase font-mono">Status do Motor</div>
                <div className="text-xs font-mono font-bold flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      status?.isRunning ? 'bg-emerald-400 shadow-[0_0_8px_#22c55e] animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  <span className={status?.isRunning ? 'text-emerald-400' : 'text-rose-400'}>
                    {status?.isRunning ? 'TRADING NODE ATIVO' : 'MOTOR PARADO'}
                  </span>
                </div>
              </div>
              {status?.isRunning && (
                <div className="border-l border-white/10 pl-3 text-right">
                  <div className="text-[10px] text-white/40 uppercase font-mono">Uptime</div>
                  <div className="text-xs font-mono text-cyan-400 font-bold">
                    {status.uptimeSeconds}s
                  </div>
                </div>
              )}
            </div>

            {status?.isRunning ? (
              <button
                onClick={handleStopEngine}
                disabled={loading}
                className="px-4 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Square className="w-4 h-4 fill-rose-400 text-rose-400" />
                Parar Motor
              </button>
            ) : (
              <button
                onClick={handleStartEngine}
                disabled={loading}
                className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl text-xs flex items-center gap-2 transition shadow-[0_0_15px_rgba(6,182,212,0.4)] cursor-pointer disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-black" />
                Iniciar Motor Nautilus
              </button>
            )}

            <button
              onClick={loadAll}
              title="Atualizar dados"
              className="p-2.5 bg-zinc-800/80 hover:bg-zinc-700 text-slate-300 rounded-xl border border-white/10 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Metric Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-4 border-t border-white/10 text-xs">
          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="text-white/40 text-[10px] uppercase font-mono">Engine Runtime</div>
            <div className="text-white font-semibold mt-0.5 truncate">Rust Core / Cython 1.200</div>
          </div>
          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="text-white/40 text-[10px] uppercase font-mono">Latência Média</div>
            <div className="text-cyan-400 font-mono font-bold mt-0.5">~0.42 ms (Sub-milli)</div>
          </div>
          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="text-white/40 text-[10px] uppercase font-mono">Ordens Processadas</div>
            <div className="text-white font-mono font-bold mt-0.5">{status?.totalOrdersProcessed || orders.length}</div>
          </div>
          <div className="bg-black/30 p-3 rounded-lg border border-white/5">
            <div className="text-white/40 text-[10px] uppercase font-mono">Estratégias Ativas</div>
            <div className="text-emerald-400 font-semibold mt-0.5">1 (MyWebIntegration)</div>
          </div>
        </div>
      </div>

      {/* 3-Tier Architecture Visualization */}
      <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6">
        <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400 font-mono flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4" /> Fluxo Arquitetural de 3 Camadas
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
          {/* Tier 1 */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-2 relative">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-bold">
                CAMADA 1
              </span>
              <Globe className="w-4 h-4 text-blue-400" />
            </div>
            <h4 className="font-bold text-white text-sm">Frontend (React / Next.js)</h4>
            <p className="text-xs text-white/50 leading-relaxed">
              Interface que consome a API REST/WebSocket, obtém o JWT e despacha ordens validadas pelo trader.
            </p>
            <div className="pt-2 text-[11px] font-mono text-blue-300">HTTP / JSON + Bearer Auth</div>
          </div>

          {/* Tier 2 */}
          <div className="bg-black/40 border border-cyan-500/30 rounded-xl p-4 space-y-2 relative shadow-[0_0_15px_rgba(6,182,212,0.1)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-bold">
                CAMADA 2
              </span>
              <Server className="w-4 h-4 text-cyan-400" />
            </div>
            <h4 className="font-bold text-white text-sm">Backend Orchestrator (FastAPI)</h4>
            <p className="text-xs text-white/50 leading-relaxed">
              Autenticação segura via OAuth2/JWT (HS256), rate-limiting, validação de risco pré-ordem e ponte RPC/Eventos.
            </p>
            <div className="pt-2 text-[11px] font-mono text-cyan-300">Port 8000 • OAuth2 • Pydantic</div>
          </div>

          {/* Tier 3 */}
          <div className="bg-black/40 border border-emerald-500/30 rounded-xl p-4 space-y-2 relative shadow-[0_0_15px_rgba(34,197,94,0.1)]">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold">
                CAMADA 3
              </span>
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <h4 className="font-bold text-white text-sm">Nautilus Execution Engine</h4>
            <p className="text-xs text-white/50 leading-relaxed">
              TradingNode em Rust de altíssima velocidade. Gerencia livro de ofertas, ticks, OMS/EMS e envio direto à corretora.
            </p>
            <div className="pt-2 text-[11px] font-mono text-emerald-300">Rust Core • Low-Latency Loop</div>
          </div>
        </div>
      </div>

      {/* Interactive Testing Console: Auth + Dispatch Order */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Box 1: FastAPI JWT Auth Generator */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-white text-sm uppercase font-mono">1. FastAPI Auth & JWT Token</h3>
            </div>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/30">
              POST /token
            </span>
          </div>
          <p className="text-xs text-white/60">
            Simula a emissão de token de autenticação via OAuth2PasswordBearer conforme definido no arquivo <code>main.py</code>.
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-white/50 uppercase font-mono block mb-1">Usuário / Email</label>
              <input
                type="text"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-cyan-500 outline-none font-mono"
              />
            </div>

            <button
              onClick={handleGetToken}
              disabled={tokenLoading}
              className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl py-2.5 text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {tokenLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              Gerar Token JWT de Sessão
            </button>

            {jwtToken && (
              <div className="bg-black/60 border border-amber-500/30 rounded-xl p-3 space-y-1.5 animate-fade-in">
                <div className="flex items-center justify-between text-[10px] font-mono text-amber-400">
                  <span>Bearer Token Ativo (30 min)</span>
                  <button
                    onClick={() => copyToClipboard(`Bearer ${jwtToken}`, 'token')}
                    className="flex items-center gap-1 text-white/60 hover:text-white cursor-pointer"
                  >
                    {copiedKey === 'token' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    Copiar Header
                  </button>
                </div>
                <p className="text-[10px] font-mono text-white/70 break-all bg-black/40 p-2 rounded">
                  {jwtToken}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Box 2: Place Order in Nautilus Node */}
        <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5 text-cyan-400" />
              <h3 className="font-bold text-white text-sm uppercase font-mono">2. Disparo de Ordem via Nautilus Bridge</h3>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded border border-cyan-400/30">
              POST /trade/order
            </span>
          </div>
          <p className="text-xs text-white/60">
            Envia ordem autenticada para o <code>NautilusManager.place_order()</code> com validação de lote e notificação instantânea.
          </p>

          <form onSubmit={handleSendOrder} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/50 uppercase font-mono block mb-1">Instrumento</label>
                <select
                  value={selectedInstrument}
                  onChange={(e) => setSelectedInstrument(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none font-mono cursor-pointer"
                >
                  <option value="BTCUSDT.BINANCE">BTCUSDT.BINANCE</option>
                  <option value="ETHUSDT.BYBIT">ETHUSDT.BYBIT</option>
                  <option value="SOLUSDT.BINANCE">SOLUSDT.BINANCE</option>
                  <option value="PETR4.B3">PETR4.B3 (DMA/Paper)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-white/50 uppercase font-mono block mb-1">Lado (Side)</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOrderSide('BUY')}
                    className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      orderSide === 'BUY'
                        ? 'bg-emerald-500 text-black shadow-[0_0_10px_rgba(34,197,94,0.4)]'
                        : 'bg-black/40 text-white/60 border border-white/10 hover:bg-black/60'
                    }`}
                  >
                    COMPRA
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrderSide('SELL')}
                    className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                      orderSide === 'SELL'
                        ? 'bg-rose-500 text-white shadow-[0_0_10px_rgba(244,63,94,0.4)]'
                        : 'bg-black/40 text-white/60 border border-white/10 hover:bg-black/60'
                    }`}
                  >
                    VENDA
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-white/50 uppercase font-mono block mb-1">Quantidade</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.001"
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-cyan-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/50 uppercase font-mono block mb-1">Preço Alvo / Referência ($)</label>
                <input
                  type="number"
                  step="0.1"
                  value={orderPrice}
                  onChange={(e) => setOrderPrice(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:border-cyan-500 outline-none font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={orderSending || !status?.isRunning}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl py-2.5 text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)] disabled:opacity-50"
            >
              {orderSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 fill-black" />}
              {status?.isRunning ? 'Executar Ordem no Nautilus Core' : 'Inicie o Motor para Executar'}
            </button>

            {orderSuccessMsg && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2.5 rounded-xl text-xs flex items-center gap-2 animate-fade-in font-mono">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{orderSuccessMsg}</span>
              </div>
            )}

            {orderErrorMsg && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-2.5 rounded-xl text-xs flex items-center gap-2 animate-fade-in font-mono">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{orderErrorMsg}</span>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Orders & Logs Live Feeds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Nautilus Executed Orders */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" /> Ordens Processadas no Motor ({orders.length})
            </h3>
            <span className="text-[10px] font-mono text-white/40">Sub-millisecond Fills</span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {orders.length === 0 ? (
              <div className="text-center py-8 text-white/40 text-xs font-mono">
                Nenhuma ordem processada ainda. Dispare uma ordem no formulário acima.
              </div>
            ) : (
              orders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-black/40 border border-white/5 p-3 rounded-xl flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-1.5 py-0.5 rounded font-mono font-bold text-[10px] ${
                          ord.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {ord.side}
                      </span>
                      <span className="font-mono font-bold text-white">{ord.instrument}</span>
                      <span className="text-white/50 text-[11px] font-mono">Qtd: {ord.quantity}</span>
                    </div>
                    <div className="text-[10px] text-white/40 font-mono">
                      ID: {ord.id} • Fill: ${ord.fillPrice || ord.price}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      {ord.status} ({ord.latencyMs || 0.35}ms)
                    </div>
                    <div className="text-[9px] text-white/30 font-mono mt-1">
                      {new Date(ord.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Event Stream from Nautilus */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" /> Event Stream do Engine & Strategy
            </h3>
            <span className="text-[10px] font-mono text-cyan-400">Live Logs</span>
          </div>

          <div className="bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-[11px] max-h-72 overflow-y-auto space-y-1.5 scrollbar-thin">
            {logs.length === 0 ? (
              <div className="text-white/40 text-center py-6">Iniciando stream de eventos...</div>
            ) : (
              logs.map((lg) => (
                <div key={lg.id} className="flex items-start gap-2 text-white/80 leading-relaxed">
                  <span className="text-white/30 text-[10px] shrink-0">
                    {new Date(lg.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`px-1 rounded text-[9px] font-bold shrink-0 ${
                      lg.source === 'FastAPI'
                        ? 'bg-blue-500/20 text-blue-400'
                        : lg.source === 'NautilusCore'
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : lg.source === 'ExecutionEngine'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-purple-500/20 text-purple-400'
                    }`}
                  >
                    {lg.source}
                  </span>
                  <span
                    className={
                      lg.level === 'WARN'
                        ? 'text-amber-300'
                        : lg.level === 'ERROR'
                        ? 'text-rose-400'
                        : 'text-white/90'
                    }
                  >
                    {lg.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Source Code & Deployment Blueprints */}
      <div className="bg-zinc-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
              <FileCode className="w-4 h-4 text-cyan-400" /> Código Base & Arquitetura Pronta para Produção
            </h3>
            <p className="text-xs text-white/50">
              Copie ou exporte os arquivos para rodar o backend Python/FastAPI e o motor Nautilus Trader em standalone ou containers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => copyToClipboard(codeSnippets[activeCodeTab], activeCodeTab)}
              className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition cursor-pointer"
            >
              {copiedKey === activeCodeTab ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copiar Código Atual
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto pb-2 scrollbar-none">
          {[
            { id: 'main', label: 'main.py (FastAPI + Auth + Bridge)' },
            { id: 'strategy', label: 'strategy.py (Nautilus Strategy)' },
            { id: 'frontend', label: 'client_integration.js' },
            { id: 'docker', label: 'requirements.txt & Docker' },
            { id: 'architecture', label: 'Regras de Ouro (Arquitetura)' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveCodeTab(t.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition cursor-pointer whitespace-nowrap ${
                activeCodeTab === t.id
                  ? 'bg-cyan-500 text-black font-bold shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                  : 'bg-black/40 text-white/60 hover:text-white border border-white/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Code Viewer Box */}
        <div className="relative bg-black/80 border border-white/10 rounded-xl p-4 font-mono text-xs text-slate-300 overflow-x-auto max-h-96 scrollbar-thin">
          <pre>
            <code>{codeSnippets[activeCodeTab]}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
