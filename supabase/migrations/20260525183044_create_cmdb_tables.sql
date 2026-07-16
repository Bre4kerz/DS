/*
  # Create CMDB Tables

  ## Overview
  Creates the core tables for a CMDB (Configuration Management Database) dashboard
  that tracks clients, their IT assets, licenses, and access credentials.

  ## New Tables

  ### `cmdb_clients`
  - `id` (uuid, primary key)
  - `name` (text) - Company/client name
  - `created_at` (timestamptz)

  ### `cmdb_items`
  - `id` (uuid, primary key)
  - `client_id` (uuid, FK to cmdb_clients)
  - `category` (text) - e.g., Backup, Firewall, Servidor, Licencia, VPN
  - `type` (text) - e.g., Veeam, Fortinet, Windows
  - `name` (text) - Asset/service name
  - `ip` (text) - IP address or domain
  - `serial` (text) - Serial number or license key
  - `email` (text) - Associated email/contact
  - `expiration_date` (date) - License/contract expiration
  - `notes` (text) - Additional notes
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - RLS enabled on both tables
  - Authenticated users can read and write all records (MSP internal tool)

  ## Notes
  - Seed data included for demonstration
*/

CREATE TABLE IF NOT EXISTS cmdb_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cmdb_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read clients"
  ON cmdb_clients FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert clients"
  ON cmdb_clients FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update clients"
  ON cmdb_clients FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete clients"
  ON cmdb_clients FOR DELETE
  TO authenticated
  USING (true);

-- Allow anon for demo purposes (MSP internal tool with no public auth)
CREATE POLICY "Anon can read clients"
  ON cmdb_clients FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert clients"
  ON cmdb_clients FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update clients"
  ON cmdb_clients FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can delete clients"
  ON cmdb_clients FOR DELETE
  TO anon
  USING (true);

CREATE TABLE IF NOT EXISTS cmdb_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES cmdb_clients(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  ip text DEFAULT '',
  serial text DEFAULT '',
  email text DEFAULT '',
  expiration_date date,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE cmdb_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read items"
  ON cmdb_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert items"
  ON cmdb_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update items"
  ON cmdb_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete items"
  ON cmdb_items FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read items"
  ON cmdb_items FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert items"
  ON cmdb_items FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update items"
  ON cmdb_items FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can delete items"
  ON cmdb_items FOR DELETE
  TO anon
  USING (true);

CREATE INDEX IF NOT EXISTS idx_cmdb_items_client_id ON cmdb_items(client_id);
CREATE INDEX IF NOT EXISTS idx_cmdb_items_expiration ON cmdb_items(expiration_date);
CREATE INDEX IF NOT EXISTS idx_cmdb_items_category ON cmdb_items(category);

-- Seed clients
INSERT INTO cmdb_clients (id, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Empresa A'),
  ('22222222-2222-2222-2222-222222222222', 'Empresa B'),
  ('33333333-3333-3333-3333-333333333333', 'Empresa C'),
  ('44444444-4444-4444-4444-444444444444', 'Empresa D')
ON CONFLICT (id) DO NOTHING;

-- Seed items
INSERT INTO cmdb_items (client_id, category, type, name, ip, serial, email, expiration_date, notes) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Backup', 'Veeam', 'Veeam Backup', '10.0.0.5', 'VB-2024-001', 'it@empresaa.com', '2026-06-01', 'Licencia Enterprise'),
  ('11111111-1111-1111-1111-111111111111', 'Servidor', 'Windows', 'DC-02', '10.0.0.2', 'WS-2022-XYZ', 'admin@empresaa.com', '2027-03-15', 'Controlador de dominio secundario'),
  ('22222222-2222-2222-2222-222222222222', 'Firewall', 'Fortinet', 'FortiGate 100F', '192.168.1.1', 'FG100F1234567', 'noc@empresab.com', '2027-01-01', 'UTM License'),
  ('22222222-2222-2222-2222-222222222222', 'VPN', 'Cisco', 'AnyConnect', '192.168.1.254', 'CSCO-VPN-99', 'vpn@empresab.com', '2026-09-30', '50 usuarios simultáneos'),
  ('33333333-3333-3333-3333-333333333333', 'Servidor', 'Windows', 'DC-01', '172.16.0.10', 'WS2019-ABC', 'admin@empresac.com', '2026-05-20', 'Servidor principal - VENCIDO'),
  ('33333333-3333-3333-3333-333333333333', 'Antivirus', 'ESET', 'ESET Endpoint', '172.16.0.11', 'ESET-2024-555', 'sec@empresac.com', '2026-07-10', '25 endpoints'),
  ('44444444-4444-4444-4444-444444444444', 'Backup', 'Acronis', 'Acronis Cloud', '10.10.0.5', 'ACR-CLOUD-88', 'backup@empresad.com', '2026-08-20', '2TB cloud storage'),
  ('44444444-4444-4444-4444-444444444444', 'Servidor', 'Linux', 'WEB-01', '10.10.0.20', NULL, 'devops@empresad.com', '2027-12-31', 'Ubuntu 22.04 LTS')
ON CONFLICT DO NOTHING;
