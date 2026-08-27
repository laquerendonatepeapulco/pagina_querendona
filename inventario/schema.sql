CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'Unidad',
  supplier TEXT NOT NULL DEFAULT '',
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  location TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_number TEXT NOT NULL UNIQUE,
  branch TEXT NOT NULL DEFAULT 'Tepeapulco, Hidalgo',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  party_size INTEGER NOT NULL DEFAULT 1 CHECK (party_size BETWEEN 1 AND 100),
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  celebration_type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_status ON stock_alerts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_date_time ON reservations(reservation_date, reservation_time);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status, created_at DESC);



-- =========================================================
-- LATIDOS DE MÉXICO
-- =========================================================

CREATE TABLE IF NOT EXISTS latidos_experiences (
  id TEXT PRIMARY KEY,

  name TEXT NOT NULL,

  capacity INTEGER NOT NULL
    CHECK (capacity >= 0),

  price NUMERIC(12, 2) NOT NULL
    CHECK (price >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS latidos_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  external_reference TEXT NOT NULL UNIQUE,

  mercadopago_preference_id TEXT,

  mercadopago_payment_id TEXT UNIQUE,

  experience_id TEXT NOT NULL
    REFERENCES latidos_experiences(id),

  quantity INTEGER NOT NULL
    CHECK (quantity > 0),

  unit_price NUMERIC(12, 2) NOT NULL
    CHECK (unit_price >= 0),

  total NUMERIC(12, 2) NOT NULL
    CHECK (total >= 0),

  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (
      status IN (
        'reserved',
        'approved',
        'expired',
        'cancelled',
        'refunded'
      )
    ),

  reserved_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  paid_at TIMESTAMPTZ
);


CREATE TABLE IF NOT EXISTS latidos_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL UNIQUE
    REFERENCES latidos_orders(id) ON DELETE CASCADE,

  name TEXT NOT NULL,

  origin TEXT NOT NULL,

  contact_name TEXT NOT NULL,

  age INTEGER NOT NULL
    CHECK (age BETWEEN 0 AND 120),

  email TEXT NOT NULL,

  phone TEXT NOT NULL,

  business_type TEXT NOT NULL DEFAULT '',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS latidos_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL
    REFERENCES latidos_orders(id) ON DELETE CASCADE,

  experience_id TEXT NOT NULL
    REFERENCES latidos_experiences(id),

  sequence INTEGER NOT NULL
    CHECK (sequence > 0),

  ticket_number TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'cancelled')),

  used_at TIMESTAMPTZ,

  checked_in_by UUID
    REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (order_id, sequence)
);


CREATE TABLE IF NOT EXISTS latidos_test_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  ticket_number TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used')),

  used_at TIMESTAMPTZ,

  checked_in_by UUID
    REFERENCES users(id) ON DELETE SET NULL,

  created_by UUID
    REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


ALTER TABLE latidos_tickets
  ADD COLUMN IF NOT EXISTS order_id UUID
    REFERENCES latidos_orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS experience_id TEXT
    REFERENCES latidos_experiences(id),
  ADD COLUMN IF NOT EXISTS sequence INTEGER,
  ADD COLUMN IF NOT EXISTS ticket_number TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_by UUID
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();


UPDATE latidos_tickets AS ticket
SET experience_id = orders.experience_id
FROM latidos_orders AS orders
WHERE ticket.order_id = orders.id
  AND ticket.experience_id IS NULL;


DO $$
BEGIN
  ALTER TABLE latidos_tickets
    DROP CONSTRAINT IF EXISTS latidos_tickets_status_check;

  UPDATE latidos_tickets
  SET status = CASE
    WHEN LOWER(status) IN ('used', 'redeemed') THEN 'used'
    WHEN LOWER(status) IN ('cancelled', 'canceled', 'refunded') THEN 'cancelled'
    ELSE 'active'
  END;

  ALTER TABLE latidos_tickets
    ADD CONSTRAINT latidos_tickets_status_check
    CHECK (status IN ('active', 'used', 'cancelled'));
END
$$;


WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY order_id
      ORDER BY sequence NULLS LAST, created_at NULLS LAST, id
    ) AS migrated_sequence
  FROM latidos_tickets
  WHERE order_id IS NOT NULL
)
UPDATE latidos_tickets AS ticket
SET sequence = ranked.migrated_sequence
FROM ranked
WHERE ticket.ctid = ranked.ctid
  AND ticket.sequence IS NULL;


UPDATE latidos_tickets
SET ticket_number = CONCAT(
  'LDM-M-',
  UPPER(SUBSTRING(MD5(id::text || random()::text) FROM 1 FOR 10))
)
WHERE ticket_number IS NULL;


CREATE INDEX IF NOT EXISTS
  idx_latidos_orders_experience_status
ON latidos_orders (
  experience_id,
  status
);


CREATE INDEX IF NOT EXISTS
  idx_latidos_orders_reserved_until
ON latidos_orders (
  reserved_until
);


CREATE INDEX IF NOT EXISTS
  idx_latidos_registrations_created_at
ON latidos_registrations (
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  idx_latidos_tickets_status
ON latidos_tickets (
  status,
  created_at
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_latidos_tickets_order
ON latidos_tickets (
  order_id,
  sequence
);


CREATE UNIQUE INDEX IF NOT EXISTS
  idx_latidos_tickets_number
ON latidos_tickets (
  ticket_number
);


CREATE INDEX IF NOT EXISTS
  idx_latidos_test_tickets_status
ON latidos_test_tickets (
  status,
  created_at DESC
);


INSERT INTO latidos_experiences (
  id,
  name,
  capacity,
  price
)
VALUES
  (
    'tradicional',
    'Buffet de antojitos mexicanos',
    60,
    349
  ),
  (
    'gastronomica',
    'Cena mexicana de gala',
    40,
    599
  ),
  (
    'cortesia',
    'Acceso especial de cortesia',
    0,
    0
  ),
  (
    'expositor',
    'Acceso especial de expositor',
    0,
    0
  )

ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  capacity = EXCLUDED.capacity,
  price = EXCLUDED.price,
  updated_at = now();
