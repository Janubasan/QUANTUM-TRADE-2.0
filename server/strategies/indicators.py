"""
indicators.py - Módulo central de indicadores técnicos e sinal composto (composite_signal)
Utilizado pela SignalStrategy no Lumibot para decisão baseada em RSI, MACD e Bollinger Bands.
"""
import numpy as np
import pandas as pd


def compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-9)
    return 100 - (100 / (1 + rs))


def compute_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    exp1 = series.ewm(span=fast, adjust=False).mean()
    exp2 = series.ewm(span=slow, adjust=False).mean()
    macd = exp1 - exp2
    signal_line = macd.ewm(span=signal, adjust=False).mean()
    hist = macd - signal_line
    return macd, signal_line, hist


def compute_bollinger_bands(series: pd.Series, period: int = 20, num_std: float = 2.0):
    sma = series.rolling(window=period).mean()
    std = series.rolling(window=period).std()
    upper = sma + (std * num_std)
    lower = sma - (std * num_std)
    return upper, sma, lower


def composite_signal(df: pd.DataFrame) -> dict:
    """
    Calcula sinal composto baseado em:
    1. RSI (14) - Filtro de sobrevenda (<35) e sobrecompra (>65)
    2. MACD (12, 26, 9) - Cruzamento e aceleração de histograma
    3. Bandas de Bollinger (20, 2) - Posição relativa %B

    Retorna:
      {
        "direction": "buy" | "sell" | "neutral",
        "score": float (-100 a +100),
        "details": { "rsi": float, "macd_hist": float, "pct_b": float }
      }
    """
    if df is None or len(df) < 25:
        return {"direction": "neutral", "score": 0.0, "details": {}}

    close = df["close"]
    
    # 1. RSI
    rsi_series = compute_rsi(close, 14)
    last_rsi = float(rsi_series.iloc[-1]) if not np.isnan(rsi_series.iloc[-1]) else 50.0

    # 2. MACD
    _, _, hist_series = compute_macd(close, 12, 26, 9)
    last_hist = float(hist_series.iloc[-1]) if not np.isnan(hist_series.iloc[-1]) else 0.0
    prev_hist = float(hist_series.iloc[-2]) if len(hist_series) > 1 and not np.isnan(hist_series.iloc[-2]) else 0.0

    # 3. Bollinger
    upper, mid, lower = compute_bollinger_bands(close, 20, 2.0)
    last_upper = float(upper.iloc[-1]) if not np.isnan(upper.iloc[-1]) else close.iloc[-1] * 1.02
    last_lower = float(lower.iloc[-1]) if not np.isnan(lower.iloc[-1]) else close.iloc[-1] * 0.98
    last_close = float(close.iloc[-1])
    
    band_width = max(1e-6, last_upper - last_lower)
    pct_b = (last_close - last_lower) / band_width

    # Pontuação Composta (-100 a +100)
    score = 0.0

    # Contribuição RSI (-35 a +35)
    if last_rsi < 35:
        score += 35.0 * (1 - (last_rsi / 35.0)) # Alta pontuação de compra em sobrevenda
    elif last_rsi > 65:
        score -= 35.0 * ((last_rsi - 65.0) / 35.0) # Venda em sobrecompra

    # Contribuição MACD (-35 a +35)
    if last_hist > 0:
        score += min(35.0, 20.0 + (15.0 if last_hist > prev_hist else 0.0))
    else:
        score -= min(35.0, 20.0 + (15.0 if last_hist < prev_hist else 0.0))

    # Contribuição Bollinger (-30 a +30)
    if pct_b < 0.20:
        score += 30.0 * (1 - pct_b / 0.20)
    elif pct_b > 0.80:
        score -= 30.0 * ((pct_b - 0.80) / 0.20)

    score = float(np.clip(score, -100.0, 100.0))

    # Decisão Direcional
    if score >= 30.0:
        direction = "buy"
    elif score <= -30.0:
        direction = "sell"
    else:
        direction = "neutral"

    return {
        "direction": direction,
        "score": round(score, 2),
        "details": {
            "rsi": round(last_rsi, 2),
            "macd_hist": round(last_hist, 4),
            "pct_b": round(pct_b, 3),
        },
    }
