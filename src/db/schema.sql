-- =================================================================
-- HisabKitab SQLite Schema — PRD v1.0.0
-- Migration scripts for Expo SQLite / local storage native engine.
-- Covers all 4 Financial Pillars: Personal, Agriculture, Business, Capital.
-- =================================================================

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- -----------------------------------------------------------------
-- 1. Multi-Context Registry
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contexts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contexts_name ON contexts(name);

-- -----------------------------------------------------------------
-- 2. Personal Contacts & Account Statements (Home & Personal Pillar)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contacts (
  person_id                      TEXT PRIMARY KEY,
  display_name                   TEXT NOT NULL,
  phone_number                   TEXT DEFAULT '',
  email                          TEXT DEFAULT '',
  person_avatar_uri              TEXT,
  is_linked_to_device_contacts   BOOLEAN DEFAULT 0,
  device_contact_identifier      TEXT,
  notes                          TEXT DEFAULT '',
  created_at                     DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at                     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(display_name);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id             TEXT PRIMARY KEY,
  person_id                  TEXT NOT NULL,
  custom_transaction_date    TEXT NOT NULL,    -- ISO date YYYY-MM-DD
  description                TEXT NOT NULL,
  given_amount               REAL DEFAULT 0 CHECK(given_amount >= 0),
  taken_amount               REAL DEFAULT 0 CHECK(taken_amount >= 0),
  created_by_device          TEXT DEFAULT '',
  client_mutation_timestamp  INTEGER NOT NULL,
  sync_status                TEXT CHECK(sync_status IN ('PENDING', 'SYNCED')) DEFAULT 'PENDING',
  FOREIGN KEY (person_id) REFERENCES contacts(person_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tx_person ON transactions(person_id);
CREATE INDEX IF NOT EXISTS idx_tx_date   ON transactions(custom_transaction_date);

-- -----------------------------------------------------------------
-- 3. Agriculture Crops & Season Inputs (Agriculture Pillar)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crop_expenses (
  crop_id     TEXT PRIMARY KEY,
  crop_name   TEXT NOT NULL,
  acreage     REAL NOT NULL CHECK(acreage > 0),
  status      TEXT CHECK(status IN ('ACTIVE', 'COMPLETED')) DEFAULT 'ACTIVE',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crop_status ON crop_expenses(status);

CREATE TABLE IF NOT EXISTS crop_records (
  record_id                  TEXT PRIMARY KEY,
  crop_id                    TEXT NOT NULL,
  date                       TEXT NOT NULL,    -- ISO date YYYY-MM-DD
  category                   TEXT CHECK(category IN ('LAND_PREP', 'SEEDS', 'WATER', 'SPRAY', 'HARVEST', 'TRANSPORT', 'REVENUE', 'OTHER')) NOT NULL,
  description                TEXT NOT NULL,
  amount                     REAL NOT NULL CHECK(amount > 0),
  type                       TEXT CHECK(type IN ('EXPENSE', 'INCOME')) NOT NULL,
  client_mutation_timestamp  INTEGER NOT NULL,
  sync_status                TEXT CHECK(sync_status IN ('PENDING', 'SYNCED')) DEFAULT 'PENDING',
  FOREIGN KEY (crop_id) REFERENCES crop_expenses(crop_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crop_rec_crop ON crop_records(crop_id);
CREATE INDEX IF NOT EXISTS idx_crop_rec_date ON crop_records(date);
CREATE INDEX IF NOT EXISTS idx_crop_rec_type ON crop_records(type);

-- -----------------------------------------------------------------
-- 4. Business Parties (Customer / Supplier Khata)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_parties (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT DEFAULT '',
  party_type  TEXT CHECK(party_type IN ('customer', 'supplier')) NOT NULL,
  balance     REAL DEFAULT 0,        -- positive = we owe them, negative = they owe us
  notes       TEXT DEFAULT '',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_parties_type ON business_parties(party_type);

-- -----------------------------------------------------------------
-- 5. Unified Business Transactions
--    Covers: income, expense, credit (udhar), debit (jama)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_transactions (
  id               TEXT PRIMARY KEY,
  party_id         TEXT,              -- NULL = cash transaction (no party)
  type             TEXT CHECK(type IN ('income', 'expense', 'credit', 'debit')) NOT NULL,
  amount           REAL NOT NULL CHECK(amount > 0),
  category         TEXT NOT NULL DEFAULT 'Other',
  description      TEXT DEFAULT '',
  transaction_date TEXT NOT NULL,    -- ISO date YYYY-MM-DD
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (party_id) REFERENCES business_parties(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_biz_tx_party      ON business_transactions(party_id);
CREATE INDEX IF NOT EXISTS idx_biz_tx_date       ON business_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_biz_tx_type       ON business_transactions(type);

-- -----------------------------------------------------------------
-- 6. Capital / Lump-Sum Project Pools
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS capital_pools (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  total_budget REAL NOT NULL CHECK(total_budget > 0),
  description  TEXT DEFAULT '',
  start_date   TEXT,                 -- ISO date YYYY-MM-DD
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------
-- 7. Capital Pool Expenses (Itemized)
--    Invariant enforced: total_cost = quantity × unit_price
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS capital_expenses (
  id             TEXT PRIMARY KEY,
  pool_id        TEXT NOT NULL,
  item_name      TEXT NOT NULL,
  quantity       REAL NOT NULL CHECK(quantity > 0),
  unit_price     REAL NOT NULL CHECK(unit_price >= 0),
  total_cost     REAL NOT NULL,      -- Computed: quantity × unit_price
  vendor_name    TEXT DEFAULT '',
  payment_method TEXT CHECK(payment_method IN ('cash', 'bank', 'credit')) DEFAULT 'cash',
  category       TEXT NOT NULL DEFAULT 'Other',
  expense_date   TEXT NOT NULL,      -- ISO date YYYY-MM-DD
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pool_id) REFERENCES capital_pools(id) ON DELETE CASCADE,
  -- Enforce invariant at DB level
  CHECK(ABS(total_cost - (quantity * unit_price)) < 0.01)
);

CREATE INDEX IF NOT EXISTS idx_cap_exp_pool ON capital_expenses(pool_id);
CREATE INDEX IF NOT EXISTS idx_cap_exp_date ON capital_expenses(expense_date);

-- =================================================================
-- Seed: Default contexts matching the 4 financial pillars
-- =================================================================
INSERT OR IGNORE INTO contexts (id, name, icon) VALUES
  ('ctx-agriculture', 'Agriculture', 'agriculture'),
  ('ctx-business',    'Business & Shop', 'store'),
  ('ctx-home',        'Home & Family',   'home'),
  ('ctx-capital',     'Capital Projects','account-balance-wallet');

