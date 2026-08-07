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
  expiration_not_required: boolean
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret',
}

const jsonResponse = (body: unknown, status = 200) => {
  console.log('[cmdb-expiration-alerts]', JSON.stringify({ status, result: body }))
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

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
  if (!item.expiration_date && !item.expiration_not_required) {
    add('MISSING_EXPIRATION_DATE', 'critical', 'expiration_date', 'Expiration date is required')
  }
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
      <td>${item.cmdb_clients?.name ?? '&mdash;'}</td><td>${item.name}</td><td>${item.vendor || '&mdash;'}</td>
      <td>${item.branch || '&mdash;'}</td><td>${item.qty}</td><td>${item.expiration_date}</td>
      <td style="font-weight:600;color:${item.days < 0 ? '#e11d48' : '#d97706'}">
        ${item.days < 0 ? `Venci&oacute; hace ${Math.abs(item.days)} d&iacute;as` : `${item.days} d&iacute;as`}
      </td>
    </tr>`).join('')
  const issueSummary = new Map<string, {
    severity: QualityIssue['severity']
    message: string
    count: number
  }>()
  for (const issue of issues) {
    const key = `${issue.severity}:${issue.issue_code}`
    const current = issueSummary.get(key)
    if (current) current.count += 1
    else issueSummary.set(key, { severity: issue.severity, message: issue.message, count: 1 })
  }
  const issueRows = [...issueSummary.values()]
    .sort((a, b) => b.count - a.count)
    .map(issue => `
    <li><strong>${issue.severity.toUpperCase()}</strong> &mdash; ${issue.message}
    <strong>(${issue.count} registros)</strong></li>`).join('')

  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a">
    <h2>Reporte de vencimiento de licencias</h2>
    <p>${alerts.length} licencia(s) requieren atenci&oacute;n.</p>
    <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr style="background:#e2e8f0"><th>Cliente</th><th>Licencia</th><th>Proveedor</th>
      <th>Sucursal</th><th>Cantidad</th><th>Vencimiento</th><th>Estado</th></tr></thead>
      <tbody>${alertRows}</tbody>
    </table>
    ${issues.length ? `
      <h3>Resumen de registros incompletos</h3>
      <p>Se detectaron ${issues.length} campos que requieren revisi&oacute;n:</p>
      <ul>${issueRows}</ul>
      <p style="color:#64748b;font-size:12px">
        Consulta &ldquo;Data Quality Issues&rdquo; en el dashboard para ver y corregir cada registro.
      </p>` : ''}
    <p style="margin-top:24px;color:#64748b;font-size:12px">Generado autom&aacute;ticamente por CMDB.</p>
  </body></html>`
}

Deno.serve(async request => {
  console.log('[cmdb-expiration-alerts] Invocation received', {
    method: request.method,
    timestamp: new Date().toISOString(),
  })
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey || !resendApiKey) {
    return jsonResponse({ error: 'Missing server secrets' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const cronSecret = Deno.env.get('CRON_SECRET')
  const invokedByCron = Boolean(cronSecret && request.headers.get('x-cron-secret') === cronSecret)
  if (!invokedByCron) {
    const authorization = request.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: allowed, error: permissionError } = await userClient.rpc('cmdb_has_permission', {
      p_permission: 'alerts.configure',
    })
    if (permissionError || allowed !== true) return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const { data: settings, error: settingsError } = await supabase
    .from('cmdb_alert_settings').select('*').eq('id', true).single<AlertSettings>()
  if (settingsError) return jsonResponse({ error: settingsError.message }, 500)
  if (!settings.enabled) return jsonResponse({ skipped: 'Alerts disabled' })
  if (!settings.from_email || settings.recipients.length === 0) {
    return jsonResponse({ error: 'Sender and recipients must be configured' }, 422)
  }

  const { data, error: itemsError } = await supabase
    .from('cmdb_items')
    .select('id,name,item_type,vendor,branch,qty,serial,expiration_date,expiration_not_required,process,cmdb_clients(name)')
    .eq('category', 'Licenses')
  if (itemsError) return jsonResponse({ error: itemsError.message }, 500)
  const items = (data ?? []) as unknown as LicenseItem[]

  const { data: qualityRules, error: qualityRulesError } = await supabase
    .from('cmdb_quality_rule_settings')
    .select('issue_code,enabled,severity')
  const qualityRuleMap = new Map(
    (qualityRules ?? []).map(rule => [rule.issue_code, rule as {
      issue_code: string
      enabled: boolean
      severity: QualityIssue['severity']
    }]),
  )
  const detectedIssues = items.flatMap(validateLicense)
    .filter(issue => qualityRulesError || qualityRuleMap.get(issue.issue_code)?.enabled !== false)
    .map(issue => ({
      ...issue,
      severity: qualityRuleMap.get(issue.issue_code)?.severity ?? issue.severity,
    }))
  const { data: openIssues } = await supabase
    .from('cmdb_data_quality_issues').select('id,item_id,issue_code').is('resolved_at', null)
  const detectedKeys = new Set(detectedIssues.map(issue => `${issue.item_id}:${issue.issue_code}`))
  const openIssueMap = new Map(
    (openIssues ?? []).map(issue => [`${issue.item_id}:${issue.issue_code}`, issue]),
  )
  const nowIso = new Date().toISOString()
  const resolvedIssueIds = (openIssues ?? [])
    .filter(issue => !detectedKeys.has(`${issue.item_id}:${issue.issue_code}`))
    .map(issue => issue.id)
  const existingIssueIds = detectedIssues
    .map(issue => openIssueMap.get(`${issue.item_id}:${issue.issue_code}`)?.id)
    .filter((id): id is string => Boolean(id))
  const newIssues = detectedIssues.filter(
    issue => !openIssueMap.has(`${issue.item_id}:${issue.issue_code}`),
  )

  if (resolvedIssueIds.length > 0) {
    await supabase.from('cmdb_data_quality_issues')
      .update({ resolved_at: nowIso, resolution: 'Automatically resolved after record correction' })
      .in('id', resolvedIssueIds)
  }
  if (existingIssueIds.length > 0) {
    await supabase.from('cmdb_data_quality_issues')
      .update({ last_detected_at: nowIso })
      .in('id', existingIssueIds)
  }
  if (newIssues.length > 0) {
    await supabase.from('cmdb_data_quality_issues').insert(newIssues)
  }

  const alerts = items
    .filter(item => item.expiration_date)
    .map(item => ({ ...item, days: calendarDaysUntil(item.expiration_date!) }))
    .map(item => ({
      ...item,
      threshold: [...settings.thresholds].sort((a, b) => a - b).find(threshold => item.days <= threshold),
    }))
    .filter(item => item.threshold !== undefined)

  const { data: previousNotifications } = alerts.length > 0
    ? await supabase
      .from('cmdb_expiration_notifications')
      .select('item_id,expiration_date,threshold_days,recipient,status')
      .in('item_id', alerts.map(alert => alert.id))
      .in('recipient', settings.recipients)
    : { data: [] }
  const sentNotificationKeys = new Set(
    (previousNotifications ?? [])
      .filter(notification => notification.status === 'sent')
      .map(notification =>
        `${notification.item_id}:${notification.expiration_date}:${notification.threshold_days}:${notification.recipient}`,
      ),
  )

  let sent = 0
  let failed = 0
  for (const recipient of settings.recipients) {
    const pending = alerts.filter(alert => !sentNotificationKeys.has(
      `${alert.id}:${alert.expiration_date}:${alert.threshold}:${recipient}`,
    ))
    // Quality issues are included with new expiration alerts, but do not trigger
    // a duplicate standalone email on every scheduled or manual invocation.
    if (pending.length === 0) continue

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: settings.from_email,
        to: [recipient],
        subject: `CMDB: ${pending.length} alerta(s) de vencimiento y ${detectedIssues.length} dato(s) por revisar`,
        html: renderEmail(pending, detectedIssues),
      }),
    })
    const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string }

    if (pending.length > 0) {
      await supabase.from('cmdb_expiration_notifications').upsert(pending.map(alert => ({
        item_id: alert.id,
        expiration_date: alert.expiration_date,
        threshold_days: alert.threshold,
        recipient,
        status: response.ok ? 'sent' : 'failed',
        provider_message_id: responseBody.id ?? null,
        error: response.ok ? null : responseBody.message ?? `HTTP ${response.status}`,
        sent_at: new Date().toISOString(),
      })), { onConflict: 'item_id,expiration_date,threshold_days,recipient' })
    }
    if (response.ok) sent += pending.length
    else failed += pending.length
  }

  return jsonResponse({ licenses: items.length, issues: detectedIssues.length, sent, failed })
})
