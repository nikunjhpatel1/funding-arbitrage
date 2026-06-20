-- 1. Demo API Keys
CREATE TABLE IF NOT EXISTS demo_exchange_api_keys (
    id UUID PRIMARY KEY,
    exchange TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    secret_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    tested_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE(exchange)
);

-- 2. Live API Keys
CREATE TABLE IF NOT EXISTS live_exchange_api_keys (
    id UUID PRIMARY KEY,
    exchange TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    secret_encrypted TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    tested_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE(exchange)
);

-- 3. Demo Positions
CREATE TABLE IF NOT EXISTS demo_positions (
    id UUID PRIMARY KEY,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    entry_price NUMERIC NOT NULL,
    current_price NUMERIC,
    unrealized_pnl NUMERIC,
    realized_pnl NUMERIC,
    status TEXT NOT NULL,
    opened_at BIGINT NOT NULL,
    closed_at BIGINT
);

-- 4. Live Positions
CREATE TABLE IF NOT EXISTS live_positions (
    id UUID PRIMARY KEY,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    entry_price NUMERIC NOT NULL,
    current_price NUMERIC,
    unrealized_pnl NUMERIC,
    realized_pnl NUMERIC,
    status TEXT NOT NULL,
    opened_at BIGINT NOT NULL,
    closed_at BIGINT
);

-- 5. Demo Trade History
CREATE TABLE IF NOT EXISTS demo_trade_history (
    id UUID PRIMARY KEY,
    position_id UUID NOT NULL,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    event_type TEXT NOT NULL,
    created_at BIGINT NOT NULL
);

-- 6. Live Trade History
CREATE TABLE IF NOT EXISTS live_trade_history (
    id UUID PRIMARY KEY,
    position_id UUID NOT NULL,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    event_type TEXT NOT NULL,
    created_at BIGINT NOT NULL
);

-- 7. Demo Execution Logs
CREATE TABLE IF NOT EXISTS demo_execution_logs (
    id UUID PRIMARY KEY,
    position_id UUID,
    log_level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at BIGINT NOT NULL
);

-- 8. Live Execution Logs
CREATE TABLE IF NOT EXISTS live_execution_logs (
    id UUID PRIMARY KEY,
    position_id UUID,
    log_level TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at BIGINT NOT NULL
);

-- Disable Row Level Security so the backend API can write to them
ALTER TABLE demo_exchange_api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE live_exchange_api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE demo_positions DISABLE ROW LEVEL SECURITY;
ALTER TABLE live_positions DISABLE ROW LEVEL SECURITY;
ALTER TABLE demo_trade_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE live_trade_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE demo_execution_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE live_execution_logs DISABLE ROW LEVEL SECURITY;
