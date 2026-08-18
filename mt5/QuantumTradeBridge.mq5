//+------------------------------------------------------------------+
//|                                        QuantumTradeBridge.mq5    |
//|  Ponte auditada JANUTRADE <-> MetaTrader 5                       |
//|  Demo e live usam o mesmo código. Live só se o servidor permitir.|
//+------------------------------------------------------------------+
#property copyright "JANUTRADE / QUANTUM-TRADE-2.0"
#property version   "2.00"
#property strict

#include <Trade/Trade.mqh>

input string InpBaseUrl     = "http://127.0.0.1:3000";
input string InpAccountId   = "acc-mt5-demo";
input string InpBridgeToken = "";
input int    InpPollSeconds = 2;
input int    InpMagic       = 20260818;
input int    InpSlippage    = 30;
input bool   InpSendQuotes  = true;

CTrade trade;

string JsonEscape(const string s)
  {
   string o = s;
   StringReplace(o, "\\", "\\\\");
   StringReplace(o, "\"", "\\\"");
   return o;
  }

string JsonGet(const string json, const string key)
  {
   string needle = "\"" + key + "\"";
   int k = StringFind(json, needle);
   if(k < 0)
      return "";
   int colon = StringFind(json, ":", k + StringLen(needle));
   if(colon < 0)
      return "";
   int i = colon + 1;
   while(i < StringLen(json) && (StringGetCharacter(json, i) == ' ' || StringGetCharacter(json, i) == '\n' || StringGetCharacter(json, i) == '\t'))
      i++;
   if(i >= StringLen(json))
      return "";
   if(StringGetCharacter(json, i) == '"')
     {
      int start = i + 1;
      int end = StringFind(json, "\"", start);
      if(end < 0)
         return "";
      return StringSubstr(json, start, end - start);
     }
   int end = i;
   while(end < StringLen(json))
     {
      int ch = StringGetCharacter(json, end);
      if(ch == ',' || ch == '}' || ch == ']' || ch == ' ' || ch == '\n')
         break;
      end++;
     }
   return StringSubstr(json, i, end - i);
  }

bool Http(const string method, const string path, const string body, string &out)
  {
   string url = InpBaseUrl + path;
   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + InpBridgeToken + "\r\nX-Account-Id: " + InpAccountId + "\r\n";
   char data[];
   char result[];
   string result_headers;
   int timeout = 8000;
   if(StringLen(body) > 0)
      StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   ResetLastError();
   int code = WebRequest(method, url, headers, timeout, data, result, result_headers);
   if(code == -1)
     {
      int err = GetLastError();
      Print("WebRequest falhou. Adicione a URL em Ferramentas > Opções > Expert Advisors. err=", err, " url=", InpBaseUrl);
      out = "";
      return false;
     }
   out = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   return (code >= 200 && code < 300);
  }

string PositionsJson()
  {
   string json = "[";
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0)
         continue;
      if(i > 0)
         json += ",";
      string dir = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "LONG" : "SHORT";
      json += StringFormat(
                 "{\"ticket\":\"%I64u\",\"symbol\":\"%s\",\"direction\":\"%s\",\"volume\":%.4f,\"priceOpen\":%.5f,\"priceCurrent\":%.5f,\"sl\":%.5f,\"tp\":%.5f,\"profit\":%.2f,\"comment\":\"%s\"}",
                 ticket,
                 PositionGetString(POSITION_SYMBOL),
                 dir,
                 PositionGetDouble(POSITION_VOLUME),
                 PositionGetDouble(POSITION_PRICE_OPEN),
                 PositionGetDouble(POSITION_PRICE_CURRENT),
                 PositionGetDouble(POSITION_SL),
                 PositionGetDouble(POSITION_TP),
                 PositionGetDouble(POSITION_PROFIT),
                 JsonEscape(PositionGetString(POSITION_COMMENT))
              );
     }
   json += "]";
   return json;
  }

string QuotesJson()
  {
   if(!InpSendQuotes)
      return "{}";
   string json = "{";
   int n = 0;
   string watch[] = {"EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "ETHUSD"};
   for(int i = 0; i < ArraySize(watch); i++)
     {
      double bid = SymbolInfoDouble(watch[i], SYMBOL_BID);
      if(bid <= 0)
         continue;
      if(n > 0)
         json += ",";
      json += StringFormat("\"%s\":%.5f", watch[i], bid);
      n++;
     }
   double chartBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(chartBid > 0)
     {
      if(n > 0)
         json += ",";
      json += StringFormat("\"%s\":%.5f", _Symbol, chartBid);
     }
   json += "}";
   return json;
  }

void SendHeartbeat()
  {
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   string payload = StringFormat(
                       "{\"accountId\":\"%s\",\"login\":\"%I64d\",\"server\":\"%s\",\"company\":\"%s\",\"tradeMode\":\"%s\",\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"freeMargin\":%.2f,\"currency\":\"%s\",\"leverage\":%d,\"terminalBuild\":\"%d\",\"agentVersion\":\"2.0.0\",\"positions\":%s,\"quotes\":%s}",
                       InpAccountId,
                       login,
                       JsonEscape(AccountInfoString(ACCOUNT_SERVER)),
                       JsonEscape(AccountInfoString(ACCOUNT_COMPANY)),
                       (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO ? "demo" : "real"),
                       AccountInfoDouble(ACCOUNT_BALANCE),
                       AccountInfoDouble(ACCOUNT_EQUITY),
                       AccountInfoDouble(ACCOUNT_MARGIN),
                       AccountInfoDouble(ACCOUNT_MARGIN_FREE),
                       AccountInfoString(ACCOUNT_CURRENCY),
                       (int)AccountInfoInteger(ACCOUNT_LEVERAGE),
                       (int)TerminalInfoInteger(TERMINAL_BUILD),
                       PositionsJson(),
                       QuotesJson()
                    );
   string out;
   if(!Http("POST", "/api/mt5/bridge/heartbeat", payload, out))
      Print("Heartbeat falhou");
  }

void Report(const string commandId, const string status, const ulong ticket, const uint retcode, const double price, const double volume, const string comment)
  {
   string payload = StringFormat(
                       "{\"commandId\":\"%s\",\"accountId\":\"%s\",\"status\":\"%s\",\"ticket\":\"%I64u\",\"retcode\":\"%u\",\"price\":%.5f,\"volume\":%.4f,\"comment\":\"%s\",\"symbol\":\"%s\"}",
                       commandId,
                       InpAccountId,
                       status,
                       ticket,
                       retcode,
                       price,
                       volume,
                       JsonEscape(comment),
                       _Symbol
                    );
   string out;
   Http("POST", "/api/mt5/bridge/report", payload, out);
  }

bool EnsureSymbol(const string symbol)
  {
   if(!SymbolSelect(symbol, true))
      return false;
   if(!SymbolInfoInteger(symbol, SYMBOL_TRADE_MODE))
      return false;
   return true;
  }

double NormalizeVol(const string symbol, double volume)
  {
   double minv = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MIN);
   double maxv = SymbolInfoDouble(symbol, SYMBOL_VOLUME_MAX);
   double step = SymbolInfoDouble(symbol, SYMBOL_VOLUME_STEP);
   if(step <= 0)
      step = 0.01;
   if(volume < minv)
      volume = minv;
   if(volume > maxv)
      volume = maxv;
   volume = MathFloor(volume / step) * step;
   return NormalizeDouble(volume, 2);
  }

void ExecuteOpen(const string commandId, const string symbol, const string direction, double volume, double sl, double tp, const string comment)
  {
   if(!EnsureSymbol(symbol))
     {
      Report(commandId, "rejected", 0, 10030, 0, volume, "symbol unavailable");
      return;
     }
   volume = NormalizeVol(symbol, volume);
   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpSlippage);
   trade.SetTypeFillingBySymbol(symbol);
   bool ok = false;
   if(direction == "SHORT")
      ok = trade.Sell(volume, symbol, 0, sl, tp, comment);
   else
      ok = trade.Buy(volume, symbol, 0, sl, tp, comment);
   uint ret = trade.ResultRetcode();
   ulong ticket = trade.ResultOrder();
   double price = trade.ResultPrice();
   if(ok && (ret == TRADE_RETCODE_DONE || ret == TRADE_RETCODE_PLACED || ret == TRADE_RETCODE_DONE_PARTIAL))
      Report(commandId, "filled", ticket, ret, price, volume, trade.ResultComment());
   else
      Report(commandId, "rejected", ticket, ret, price, volume, trade.ResultComment());
  }

void ExecuteClose(const string commandId, const string ticketStr, const string symbol)
  {
   ulong ticket = (ulong)StringToInteger(ticketStr);
   bool ok = false;
   if(ticket > 0)
      ok = trade.PositionClose(ticket);
   else
     {
      for(int i = PositionsTotal() - 1; i >= 0; i--)
        {
         ulong t = PositionGetTicket(i);
         if(PositionGetString(POSITION_SYMBOL) == symbol)
            ok = trade.PositionClose(t) || ok;
        }
     }
   uint ret = trade.ResultRetcode();
   if(ok)
      Report(commandId, "filled", ticket, ret, trade.ResultPrice(), trade.ResultVolume(), trade.ResultComment());
   else
      Report(commandId, "rejected", ticket, ret, 0, 0, trade.ResultComment());
  }

void PullAndExecute()
  {
   string body = StringFormat("{\"accountId\":\"%s\"}", InpAccountId);
   string out;
   if(!Http("POST", "/api/mt5/bridge/commands", body, out))
      return;
   int guard = 0;
   int pos = 0;
   while(guard++ < 20)
     {
      int idPos = StringFind(out, "\"id\"", pos);
      if(idPos < 0)
         break;
      string chunk = StringSubstr(out, idPos, 800);
      string id = JsonGet(chunk, "id");
      string action = JsonGet(chunk, "action");
      string symbol = JsonGet(chunk, "symbol");
      string direction = JsonGet(chunk, "direction");
      string ticket = JsonGet(chunk, "ticket");
      double volume = StringToDouble(JsonGet(chunk, "volume"));
      double sl = StringToDouble(JsonGet(chunk, "sl"));
      double tp = StringToDouble(JsonGet(chunk, "tp"));
      string comment = JsonGet(chunk, "comment");
      if(StringLen(id) == 0)
        {
         pos = idPos + 4;
         continue;
        }
      if(action == "open")
         ExecuteOpen(id, symbol, direction, volume, sl, tp, comment);
      else if(action == "close" || action == "cancel")
         ExecuteClose(id, ticket, symbol);
      else if(action == "ping")
         Report(id, "filled", 0, 0, 0, 0, "pong");
      pos = idPos + 4;
     }
  }

int OnInit()
  {
   if(StringLen(InpBridgeToken) < 8)
     {
      Print("Defina InpBridgeToken com o token emitido em Contas > Bridge Token.");
      return INIT_PARAMETERS_INCORRECT;
     }
   trade.SetExpertMagicNumber(InpMagic);
   EventSetTimer(MathMax(1, InpPollSeconds));
   SendHeartbeat();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   SendHeartbeat();
   PullAndExecute();
  }

void OnTick()
  {
  }
//+------------------------------------------------------------------+
