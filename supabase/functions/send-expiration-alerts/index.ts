import { createClient } from 'npm:@supabase/supabase-js@2'

type AlertSettings = {
  enabled: boolean
  thresholds: number[]
  recipients: string[]
  from_email: string
  timezone: string
}

type LicenseItem = {
  id: string
  name: string
  item_type: string
  vendor: string
  branch: string
  qty: number
  serial: string
  expiration_date: string | null
  process: string
  cmdb_clients: { name: string } | null
}

type QualityIssue = {
  item_id: string
  issue_code: string
  severity: 'critical' | 'error' | 'warning'
  field_name: string | null
  message: string
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function calendarDaysUntil(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const now = new Date()
  return Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      / 86_400_000,
  )
}

function validateLicense(item: LicenseItem): QualityIssue[] {
  const issues: QualityIssue[] = []
  const add = (
    issue_code: string,
    severity: QualityIssue['severity'],
    field_name: string,
    message: string,
  ) => issues.push({ item_id: item.id, issue_code, severity, field_name, message })

  if (!item.name?.trim()) add('MISSING_NAME', 'critical', 'name', 'License name is required')
  if (!item.cmdb_clients?.name) add('MISSING_CLIENT', 'critical', 'client_id', 'Client is required')
  if (!item.expiration_date) add('MISSING_EXPIRATION_DATE', 'critical', 'expiration_date', 'Expiration date is required')
  if (!item.item_type?.trim()) add('MISSING_TYPE', 'error', 'item_type', 'License type is required')
  if (!item.vendor?.trim()) add('MISSING_VENDOR', 'error', 'vendor', 'Vendor is required')
  if (!Number.isInteger(item.qty) || item.qty <= 0) add('INVALID_QUANTITY', 'error', 'qty', 'Quantity must be greater than zero')
  if (!item.branch?.trim()) add('MISSING_BRANCH', 'warning', 'branch', 'Branch is missing')
  if (!item.serial?.trim()) add('MISSING_SERIAL', 'warning', 'serial', 'Serial or license identifier is missing')
  if (item.expiration_date && calendarDaysUntil(item.expiration_date) < 0 && !item.process?.trim()) {
    add('MISSING_RENEWAL_PROCESS', 'warning', 'process', 'Expired license has no renewal process')
  }
  return issues
}

function renderEmail(alerts: Array<LicenseItem & { days: number }>, issues: QualityIssue[]) {
  const alertRows = alerts.map(item => `
    <tr>
      <td>${item.cmdb_clients?.name ?? '—'}</td><td>${item.name}</td><td>${item.vendor || '—'}</td>
      <td>${item.branch || '—'}</td><td>${item.qty}</td><td>${item.expiration_date}</td>
      <td style="font-weight:600;color:${item.days < 0 ? '#e11d48' : '#d97706'}">
        ${item.days < 0 ? `Expired ${Math.abs(item.days)}d ago` : `${item.days}d`}
      </td>
    </tr>`).join('')
  const issueRows = issues.map(issue => `
    <li><strong>${issue.severity.toUpperCase()}</strong> — ${issue.message}</li>`).join('')

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a">
    <h2>CMDB expiration report</h2>
    <p>${alerts.length} license(s) require attention.</p>
    <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr style="background:#e2e8f0"><th>Client</th><th>License</th><th>Vendor</th>
      <th>Branch</th><th>QTY</th><th>Expiration</th><th>Status</th></tr></thead>
      <tbody>${alertRows}</tbody>
    </table>
    ${issues.length ? `<h3>Incomplete records</h3><ul>${issueRows}</ul>` : ''}
    <p style="margin-top:24px;color:#64748b;font-size:12px">Generated automatically by CMDB.</p>
  </body></html>`
}

Deno.serve(async request => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || request.headers.get('x-cron-secret') !== cronSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey) {
    return jsonResponse({ error: 'Missing server secrets' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: settings, error: settingsError } = await supabase
    .from('cmdb_alert_settings').select('*').eq('id', true).single<AlertSettings>()
  if (settingsError) return jsonResponse({ error: settingsError.message }, 500)
  if (!settings.enabled) return jsonResponse({ skipped: 'Alerts disabled' })
  if (!settings.from_email || settings.recipients.length === 0) {
    return jsonResponse({ error: 'Sender and recipients must be configured' }, 422)
  }

  const { data, error: itemsError } = await supabase
    .from('cmdb_items')
    .select('id,name,item_type,vendor,branch,qty,serial,expiration_date,process,cmdb_clients(name)')
    .eq('category', 'Licenses')
  if (itemsError) return jsonResponse({ error: itemsError.message }, 500)
  const items = (data ?? []) as unknown as LicenseItem[]

  const detectedIssues = items.flatMap(validateLicense)
  const { data: openIssues } = await supabase
    .from('cmdb_data_quality_issues').select('id,item_id,issue_code').is('resolved_at', null)
  const detectedKeys = new Set(detectedIssues.map(issue => `${issue.item_id}:${issue.issue_code}`))

  for (const issue of openIssues ?? []) {
    if (!detectedKeys.has(`${issue.item_id}:${issue.issue_code}`)) {
      await supabase.from('cmdb_data_quality_issues')
        .update({ resolved_at: new Date().toISOString(), resolution: 'Automatically resolved after record correction' })
        .eq('id', issue.id)
    }
  }
  for (const issue of detectedIssues) {
    const existing = (openIssues ?? []).find(row => row.item_id === issue.item_id && row.issue_code === issue.issue_code)
    if (existing) {
      await supabase.from('cmdb_data_quality_issues')
        .update({ last_detected_at: new Date().toISOString(), severity: issue.severity, message: issue.message })
        .eq('id', existing.id)
    } else {
      await supabase.from('cmdb_data_quality_issues').insert(issue)
    }
  }

  const alerts = items
    .filter(item => item.expiration_date)
    .map(item => ({ ...item, days: calendarDaysUntil(item.expiration_date!) }))
    .map(item => ({
      ...item,
      threshold: [...settings.thresholds].sort((a, b) => a - b).find(threshold => item.days <= threshold),
    }))
    .filter(item => item.threshold !== undefined)

  let sent = 0
  let failed = 0
  for (const recipient of settings.recipients) {
    const pending = []
    for (const alert of alerts) {
      const { data: existing } = await supabase.from('cmdb_expiration_notifications')
        .select('id').eq('item_id', alert.id).eq('expiration_date', alert.expiration_date!)
        .eq('threshold_days', alert.threshold!).eq('recipient', recipient).eq('status', 'sent').maybeSingle()
      if (!existing) pending.push(alert)
    }
    if (pending.length === 0 && detectedIssues.length === 0) continue

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: settings.from_email,
        to: [recipient],
        subject: `CMDB: ${pending.length} expiration alert(s), ${detectedIssues.length} data issue(s)`,
        html: renderEmail(pending, detectedIssues),
      }),
    })
    const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string }

    for (const alert of pending) {
      await supabase.from('cmdb_expiration_notifications').upsert({
        item_id: alert.id,
        expiration_date: alert.expiration_date,
        threshold_days: alert.threshold,
        recipient,
        status: response.ok ? 'sent' : 'failed',
        provider_message_id: responseBody.id ?? null,
        error: response.ok ? null : responseBody.message ?? `HTTP ${response.status}`,
        sent_at: new Date().toISOString(),
      }, { onConflict: 'item_id,expiration_date,threshold_days,recipient' })
    }
    if (response.ok) sent += pending.length
    else failed += pending.length
  }

  return jsonResponse({ licenses: items.length, issues: detectedIssues.length, sent, failed })
})
