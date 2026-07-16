/*
  # Add Credentials Storage to CMDB

  ## Overview
  Adds secure credential storage fields to the cmdb_items table, allowing
  MSP technicians to store and manage access credentials for each service/device.

  ## Changes

  ### Modified Tables
  - `cmdb_items` - adds credential columns:
    - `cred_user` (text) - Primary username
    - `cred_password` (text) - Primary password (stored encrypted in production)
    - `cred_user_alt` (text) - Alternative/backup username
    - `cred_password_alt` (text) - Alternative/backup password
    - `cred_notes` (text) - Notes about credentials (e.g., MFA, reset dates)

  ### Security Notes
  - In production, passwords should be encrypted at application level
  - RLS policies ensure only authenticated users can access credentials
  - Consider adding audit logging for credential access in future

  ## Data Migration
  - Adds sample credential data to existing records for demonstration
*/

-- Add credential columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cmdb_items' AND column_name = 'cred_user') THEN
    ALTER TABLE cmdb_items ADD COLUMN cred_user text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cmdb_items' AND column_name = 'cred_password') THEN
    ALTER TABLE cmdb_items ADD COLUMN cred_password text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cmdb_items' AND column_name = 'cred_user_alt') THEN
    ALTER TABLE cmdb_items ADD COLUMN cred_user_alt text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cmdb_items' AND column_name = 'cred_password_alt') THEN
    ALTER TABLE cmdb_items ADD COLUMN cred_password_alt text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cmdb_items' AND column_name = 'cred_notes') THEN
    ALTER TABLE cmdb_items ADD COLUMN cred_notes text DEFAULT '';
  END IF;
END $$;

-- Update sample data with credentials
UPDATE cmdb_items SET
  cred_user = 'administrator@vsphere.local',
  cred_password = 'SuperSecret123',
  cred_user_alt = 'root',
  cred_password_alt = 'RootPass123'
WHERE name = 'XXSV00' AND client_id = '11111111-1111-1111-1111-111111111111';

UPDATE cmdb_items SET
  cred_user = 'root',
  cred_password = 'VMware123',
  cred_user_alt = 'support',
  cred_password_alt = 'Support123'
WHERE name = 'XXHST01' AND client_id = '11111111-1111-1111-1111-111111111111';

UPDATE cmdb_items SET
  cred_user = 'admin',
  cred_password = 'NasPassword',
  cred_user_alt = 'backup-admin',
  cred_password_alt = 'Backup123'
WHERE name = 'XXNAS01' AND client_id = '11111111-1111-1111-1111-111111111111';

UPDATE cmdb_items SET
  cred_user = 'remote-admin',
  cred_password = 'RemotePass',
  cred_user_alt = 'support',
  cred_password_alt = 'SupportPass'
WHERE name = 'XXSV01' AND category = 'Remote Access';

UPDATE cmdb_items SET
  cred_user = 'printer-admin',
  cred_password = 'PrinterPass'
WHERE category = 'OA Devices' AND item_type = 'Printer';

UPDATE cmdb_items SET
  cred_user = 'veeam-admin',
  cred_password = 'VeeamPass',
  cred_user_alt = 'veeam-support',
  cred_password_alt = 'SupportPass'
WHERE name = 'Veeam Backup';

UPDATE cmdb_items SET
  cred_user = 'lic-admin',
  cred_password = 'LicensePass'
WHERE category = 'Licenses' AND name LIKE '%Microsoft%';

UPDATE cmdb_items SET
  cred_user = 'mail-admin',
  cred_password = 'MailPass',
  cred_user_alt = 'support-mail',
  cred_password_alt = 'SupportMail123'
WHERE category = 'Services' AND item_type = 'e-mail';

UPDATE cmdb_items SET
  cred_user = 'admin',
  cred_password = 'AdminPass123',
  cred_user_alt = 'support',
  cred_password_alt = 'Support123'
WHERE category = 'Firewall';

UPDATE cmdb_items SET
  cred_user = 'domain\admin',
  cred_password = 'DomainAdmin123'
WHERE role_use LIKE '%AD%' OR role_use LIKE '%PDC%';

UPDATE cmdb_items SET
  cred_user = 'backup-admin',
  cred_password = 'BackupAdmin123'
WHERE category = 'Backup';

-- Add new comprehensive item for Empresa A with all credential fields
INSERT INTO cmdb_items (client_id, category, item_type, name, domain_version, role_use, ip, cred_user, cred_password, cred_user_alt, cred_password_alt, cred_notes, sort_order) VALUES
('11111111-1111-1111-1111-111111111111', 'Servers', 'Virtual', 'XXVM02', 'domain.com', 'SQL Server', 'XXX.XXX.XXX.102', 'sql-admin', 'SqlAdmin123', 'sa', 'SaPassword123', 'MFA enabled', 26)
ON CONFLICT DO NOTHING;
