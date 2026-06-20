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
