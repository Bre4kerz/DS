/*
  # Restructure CMDB for hierarchical client-centric view

  ## Overview
  Migrates from a flat item list to a client-centric structure that groups
  items by category/section within each client - matching Excel workbook format.

  ## Changes

  ### Modified Tables
  - `cmdb_items` - adds new columns: `item_type`, `domain_version`, `role_use`, `sort_order`

  ### Data Migration
  - Updates existing records with appropriate values for new columns
  - Adds new sample data demonstrating the hierarchical structure

  ## Notes
  - Categories now map to sections: Servers, NAS/Storage, Remote Access, OA Devices, 
    Managed services, Licenses, Services, Firewall, VPN, Antivirus, Backup, etc.
  - `item_type` replaces the old meaning of `type` (now it's a subcategory)
  - `domain_version` holds domain name, version number, or N/A
  - `role_use` describes the role or use case
*/

-- Add new columns to cmdb_items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cmdb_items' AND column_name = 'item_type') THEN
    ALTER TABLE cmdb_items ADD COLUMN item_type text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cmdb_items' AND column_name = 'domain_version') THEN
    ALTER TABLE cmdb_items ADD COLUMN domain_version text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cmdb_items' AND column_name = 'role_use') THEN
    ALTER TABLE cmdb_items ADD COLUMN role_use text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cmdb_items' AND column_name = 'sort_order') THEN
    ALTER TABLE cmdb_items ADD COLUMN sort_order integer DEFAULT 0;
  END IF;
END $$;

-- Update existing records to use new column structure
UPDATE cmdb_items SET 
  item_type = type,
  domain_version = COALESCE(ip, ''),
  role_use = COALESCE(notes, ''),
  type = category
WHERE item_type = '';

-- Clear and reseed with proper hierarchical data
DELETE FROM cmdb_items;

-- Client: Full client name - Example
INSERT INTO cmdb_items (client_id, category, item_type, name, domain_version, role_use, ip, serial, email, expiration_date, notes, sort_order) VALUES
-- Servers
('11111111-1111-1111-1111-111111111111', 'Servers', 'Virtual', 'XXSV00', 'domain.com', 'vCenter console', 'XXX.XXX.XXX.XXX', '', '', NULL, '', 1),
('11111111-1111-1111-1111-111111111111', 'Servers', 'Host', 'XXHST01', 'domain.com', 'ESXi', 'XXX.XXX.XXX.XXX', '', '', NULL, '', 2),
('11111111-1111-1111-1111-111111111111', 'Servers', 'Physical', 'XXSV01', 'domain.com', 'PDC / ADP / ADS / FS / EDI / ESET', 'XXX.XXX.XXX.XXX', '', '', NULL, '', 3),
('11111111-1111-1111-1111-111111111111', 'Servers', 'Virtual', 'XXVM01', 'WORKGROUP', 'PDC / ADP / ADS / FS / EDI / ESET', 'XXX.XXX.XXX.XXX', '', '', NULL, '', 4),
-- NAS/Storage
('11111111-1111-1111-1111-111111111111', 'NAS/Storage', 'Physical', 'XXNAS01', 'domain.com', 'Backup', 'XXX.XXX.XXX.XXX', '', '', NULL, '', 5),
-- Remote Access
('11111111-1111-1111-1111-111111111111', 'Remote Access', 'TeamViewer', 'XXSV01', 'domain.com', 'ESXi', 'XXX.XXX.XXX.XXX', '', '', NULL, '', 6),
('11111111-1111-1111-1111-111111111111', 'Remote Access', 'AnyDesk', 'XXSV01', 'domain.com', 'AD/FS/EDI/ESET', 'XXX.XXX.XXX.XXX', '', '', NULL, '', 7),
('11111111-1111-1111-1111-111111111111', 'Remote Access', 'iDrac', 'XXSV01 - iDrac', 'WORKGROUP', '', 'XXX.XXX.XXX.XXX', '', '', NULL, '', 8),
-- OA Devices
('11111111-1111-1111-1111-111111111111', 'OA Devices', 'Printer', '', '', 'Production Printer', '', '', '', NULL, '', 9),
('11111111-1111-1111-1111-111111111111', 'OA Devices', 'Scanner', '', '', 'Office Scanner', '', '', '', NULL, '', 10),
('11111111-1111-1111-1111-111111111111', 'OA Devices', 'Label printer', '', '', 'Production Printer', 'XXX.XXX.XXX.XXX', '', '', NULL, '', 11),
-- Managed services
('11111111-1111-1111-1111-111111111111', 'Managed services', 'vCenter console', 'vCenter appliance', '6.7', 'vCenter', 'https://xxsv00.domain.com/ui', '', '', NULL, '', 12),
('11111111-1111-1111-1111-111111111111', 'Managed services', 'Backup', 'Veeam Backup', '10.0', 'Full Backup', 'XXX.XXX.XXX.XXX', '', '', '2026-02-15', '', 13),
('11111111-1111-1111-1111-111111111111', 'Managed services', 'Antivirus', 'ESET Protect', '8.0', 'Console', 'XXX.XXX.XXX.XXX', '', '', '2026-12-01', '', 14),
('11111111-1111-1111-1111-111111111111', 'Managed services', 'Antivirus', 'ESET Business Account', 'WEB', 'Console', '', '', '', '2025-06-20', '', 15),
-- Licenses
('11111111-1111-1111-1111-111111111111', 'Licenses', 'Antivirus', 'ESET Endpoint Protection Standard', 'Console', '', 'XXX - XXX', '', '', '2026-12-01', '', 16),
('11111111-1111-1111-1111-111111111111', 'Licenses', 'Office', 'Microsoft Office 2019 Standard', 'N/A', 'Software', '', '', '', '2027-01-01', '', 17),
('11111111-1111-1111-1111-111111111111', 'Licenses', 'Office', 'Microsoft 365 Apps for Business', 'CSP / Open', 'Software', '', '', '', '2026-08-15', '', 18),
('11111111-1111-1111-1111-111111111111', 'Licenses', 'VMWare', 'vCenter 6.7 / ESXi 6.7', '6.7', 'Managed services', 'Contract number', '', '', '2026-11-30', '', 19),
('11111111-1111-1111-1111-111111111111', 'Licenses', 'Backup', 'Veeam Backup / Veritas', '11.0', 'Backup', 'Contract number', '', '', '2026-02-15', '', 20),
-- Services
('11111111-1111-1111-1111-111111111111', 'Services', 'Domain', 'Akky / GoDaddy', 'domain.com', 'WebPage/email', '', '', '', '2027-03-01', '', 21),
('11111111-1111-1111-1111-111111111111', 'Services', 'DNS', 'Akky / GoDaddy', 'domain.com', 'e-mail service', '', '', '', NULL, '', 22),
('11111111-1111-1111-1111-111111111111', 'Services', 'Hosting', 'Akky / GoDaddy', 'domain.com', 'WebPage/email', '', '', '', NULL, '', 23),
('11111111-1111-1111-1111-111111111111', 'Services', 'e-mail', 'Intercloud / Exchange Online', 'domain.com', 'email service', '', '', '', '2026-10-01', '', 24),
('11111111-1111-1111-1111-111111111111', 'Services', 'e-mail', 'Microsoft 365 Business Basic', 'N/A', 'email/OneDrive/Teams', '', '', '', '2026-08-15', '', 25);

-- Client B - Demo
INSERT INTO cmdb_items (client_id, category, item_type, name, domain_version, role_use, ip, serial, email, expiration_date, notes, sort_order) VALUES
-- Servers
('22222222-2222-2222-2222-222222222222', 'Servers', 'Virtual', 'SRV-APP01', 'demo.local', 'App Server', '10.10.10.21', '', '', NULL, '', 1),
('22222222-2222-2222-2222-222222222222', 'Servers', 'Physical', 'SRV-DC01', 'demo.local', 'AD / DNS / DHCP', '10.10.10.10', '', '', NULL, '', 2),
-- Firewall
('22222222-2222-2222-2222-222222222222', 'Firewall', 'Fortinet', 'FortiGate 60F', 'demo.local', 'Perimeter security', '10.10.10.1', 'FG60F-ABC123', '', '2026-09-15', 'UTM License', 3),
-- Services
('22222222-2222-2222-2222-222222222222', 'Services', 'e-mail', 'Microsoft 365 Business Standard', 'N/A', 'email/Teams/OneDrive', '', '', '', '2026-12-01', '', 4),
('22222222-2222-2222-2222-222222222222', 'Services', 'Hosting', 'Cloudflare', 'demo.com', 'DNS / CDN', '', '', '', NULL, '', 5);

-- Client C - Empresa C
INSERT INTO cmdb_items (client_id, category, item_type, name, domain_version, role_use, ip, serial, email, expiration_date, notes, sort_order) VALUES
-- Servers
('33333333-3333-3333-3333-333333333333', 'Servers', 'Physical', 'DC-01', 'empresac.local', 'PDC / DNS / DHCP', '172.16.0.10', 'WS2019-ABC', 'admin@empresac.com', '2026-05-20', 'Servidor principal', 1),
-- Backup
('33333333-3333-3333-3333-333333333333', 'Backup', 'Veeam', 'Veeam Backup', '172.16.0.5', 'Backup principal', '172.16.0.5', 'VB-2024-001', 'backup@empresac.com', '2026-06-01', 'Licencia Enterprise', 2),
-- Antivirus
('33333333-3333-3333-3333-333333333333', 'Antivirus', 'ESET', 'ESET Endpoint', '172.16.0.11', '25 endpoints', '172.16.0.11', 'ESET-2024-555', 'sec@empresac.com', '2026-07-10', '', 3);

-- Client D - Empresa D
INSERT INTO cmdb_items (client_id, category, item_type, name, domain_version, role_use, ip, serial, email, expiration_date, notes, sort_order) VALUES
-- Servers
('44444444-4444-4444-4444-444444444444', 'Servers', 'Virtual', 'WEB-01', '10.10.0.0/24', 'Web Server', '10.10.0.20', '', 'devops@empresad.com', '2027-12-31', 'Ubuntu 22.04 LTS', 1),
-- Backup
('44444444-4444-4444-4444-444444444444', 'Backup', 'Acronis', 'Acronis Cloud', '10.10.0.5', '2TB cloud storage', '10.10.0.5', 'ACR-CLOUD-88', 'backup@empresad.com', '2026-08-20', '', 2),
-- VPN
('44444444-4444-4444-4444-444444444444', 'VPN', 'Cisco', 'AnyConnect', '10.10.0.254', '50 usuarios simultáneos', '10.10.0.254', 'CSCO-VPN-99', 'vpn@empresad.com', '2026-09-30', '', 3);

-- Add new clients
INSERT INTO cmdb_clients (id, name) VALUES
  ('55555555-5555-5555-5555-555555555555', 'Cliente E - Manufacturing')
ON CONFLICT (id) DO NOTHING;

-- New client items
INSERT INTO cmdb_items (client_id, category, item_type, name, domain_version, role_use, ip, serial, email, expiration_date, notes, sort_order) VALUES
('55555555-5555-5555-5555-555555555555', 'Servers', 'Physical', 'ERP-PROD', 'manuf.local', 'SAP / ERP', '192.168.100.10', '', '', '2027-06-30', 'Servidor principal ERP', 1),
('55555555-5555-5555-5555-555555555555', 'OA Devices', 'Printer', 'HP LaserJet Pro', 'manuf.local', 'Production Printer', '192.168.100.50', '', '', NULL, '', 2),
('55555555-5555-5555-5555-555555555555', 'Servers', 'Host', 'ESXi-01', 'manuf.local', 'VMware Host', '192.168.100.5', '', '', '2026-04-15', '', 3);

-- Add index for category ordering
CREATE INDEX IF NOT EXISTS idx_cmdb_items_category_sort ON cmdb_items(client_id, category, sort_order);
