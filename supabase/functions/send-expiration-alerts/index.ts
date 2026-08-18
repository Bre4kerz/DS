import { createClient } from 'npm:@supabase/supabase-js@2'

type AlertSettings = {
  enabled: boolean
  thresholds: number[]
  recipients: string[]
  escalation_recipients: string[]
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
  process_updated_at: string | null
  process_stale_days: number
  cmdb_clients: { name: string } | null
}

type RenewalItem = LicenseItem & { days: number }

type QualityIssue = {
  item_id: string
  issue_code: string
  severity: 'critical' | 'error' | 'warning'
  field_name: string | null
  message: string
}

type NotificationType = 'daily_summary' | 'stalled_process' | 'critical_7_days' | 'expired'

type EmailJob = {
  type: NotificationType
  eventKey: string
  itemId: string | null
  recipient: string
  subject: string
  html: string
}

const DAY_MS = 86_400_000
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-cron-secret',
}

const jsonResponse = (body: unknown, status = 200) => {
  console.log('[cmdb-renewal-alerts]', JSON.stringify({ status, result: body }))
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function datePartsInTimeZone(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

function localDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = datePartsInTimeZone(date, timeZone)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function calendarDaysUntil(date: string, timeZone: string): number {
  const [year, month, day] = date.split('-').map(Number)
  const today = datePartsInTimeZone(new Date(), timeZone)
  return Math.round(
    (Date.UTC(year, month - 1, day) - Date.UTC(today.year, today.month - 1, today.day)) / DAY_MS,
  )
}

function elapsedDays(date: string | null): number | null {
  if (!date) return null
  const timestamp = new Date(date).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, Math.floor((Date.now() - timestamp) / DAY_MS))
}

function validateLicense(item: LicenseItem, timeZone: string): QualityIssue[] {
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
  if (item.expiration_date && calendarDaysUntil(item.expiration_date, timeZone) < 0 && !item.process?.trim()) {
    add('MISSING_RENEWAL_PROCESS', 'warning', 'process', 'Expired license has no renewal process')
  }
  return issues
}

function daysLabel(days: number): string {
  if (days < 0) return `Vencida hace ${Math.abs(days)} d&iacute;as`
  if (days === 0) return 'Vence hoy'
  return `${days} d&iacute;as restantes`
}

function emailShell(title: string, intro: string, content: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f1f3f5;padding:24px;font-family:Arial,sans-serif;color:#111827">
    <div style="max-width:920px;margin:auto;background:#fff;border:1px solid #dfe3e8;border-radius:14px;padding:24px">
      <h2 style="margin:0 0 8px">${title}</h2>
      <p style="margin:0 0 20px;color:#4b5563">${intro}</p>
      ${content}
      <p style="margin:24px 0 0;color:#6b7280;font-size:12px">Generado autom&aacute;ticamente por CMDB.</p>
    </div>
  </body></html>`
}

function renewalTable(items: RenewalItem[], includeProcess = true): string {
  const rows = items.map(item => {
    const color = item.days < 0 ? '#be123c' : item.days <= 7 ? '#c2410c' : '#a16207'
    return `<tr>
      <td>${escapeHtml(item.cmdb_clients?.name || '—')}</td>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.vendor || '—')}</td>
      <td>${escapeHtml(item.expiration_date || '—')}</td>
      ${includeProcess ? `<td>${escapeHtml(item.process || 'Sin proceso')}</td>` : ''}
      <td style="font-weight:600;color:${color}">${daysLabel(item.days)}</td>
    </tr>`
  }).join('')
  return `<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
    <thead><tr style="background:#e5e7eb;text-align:left"><th>Cliente</th><th>Licencia</th><th>Proveedor</th>
    <th>Vencimiento</th>${includeProcess ? '<th>Proceso</th>' : ''}<th>Estado</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`
}

function renderDailySummary(items: RenewalItem[], issues: QualityIssue[]): string {
  const critical = items.filter(item => item.days <= 7)
  const upcoming = items.filter(item => item.days > 7)
  const sections = [
    critical.length ? `<h3 style="color:#be123c">Cr&iacute;ticas (${critical.length})</h3>${renewalTable(critical)}` : '',
    upcoming.length ? `<h3>Pr&oacute;ximas (${upcoming.length})</h3>${renewalTable(upcoming)}` : '',
    issues.length ? `<p style="margin-top:20px;color:#6b7280">Adem&aacute;s hay <strong>${issues.length}</strong> dato(s) de calidad pendientes en el dashboard.</p>` : '',
  ].join('')
  return emailShell(
    'Resumen diario de renovaciones',
    `${items.length} licencia(s) requieren seguimiento dentro de la ventana configurada.`,
    sections,
  )
}

function renderStalledProcess(item: RenewalItem, ageDays: number): string {
  const details = `<div style="border-left:4px solid #d97706;background:#fffbeb;padding:16px">
    <p><strong>Cliente:</strong> ${escapeHtml(item.cmdb_clients?.name || '—')}</p>
    <p><strong>Licencia:</strong> ${escapeHtml(item.name)}</p>
    <p><strong>Proceso actual:</strong> ${escapeHtml(item.process)}</p>
    <p><strong>Sin seguimiento:</strong> ${ageDays} d&iacute;as (l&iacute;mite: ${item.process_stale_days})</p>
    <p><strong>Vencimiento:</strong> ${escapeHtml(item.expiration_date)} &mdash; ${daysLabel(item.days)}</p>
  </div>`
  return emailShell('Proceso de renovaci&oacute;n estancado', 'Este registro necesita una acci&oacute;n o un nuevo seguimiento.', details)
}

function renderCritical(item: RenewalItem, expired: boolean): string {
  const details = `<div style="border-left:4px solid #be123c;background:#fff1f2;padding:16px">
    <p><strong>Cliente:</strong> ${escapeHtml(item.cmdb_clients?.name || '—')}</p>
    <p><strong>Licencia:</strong> ${escapeHtml(item.name)}</p>
    <p><strong>Proveedor:</strong> ${escapeHtml(item.vendor || '—')}</p>
    <p><strong>Proceso actual:</strong> ${escapeHtml(item.process || 'Sin proceso')}</p>
    <p><strong>Vencimiento:</strong> ${escapeHtml(item.expiration_date)} &mdash; ${daysLabel(item.days)}</p>
  </div>`
  return emailShell(
    expired ? 'Escalaci&oacute;n: licencia vencida' : 'Escalaci&oacute;n: licencia a 7 d&iacute;as o menos',
    expired ? 'La licencia ya venci&oacute; y requiere atenci&oacute;n inmediata.' : 'La renovaci&oacute;n entr&oacute; en su ventana cr&iacute;tica.',
    details,
  )
}

async function sendJob(
  supabase: ReturnType<typeof createClient>,
  resendApiKey: string,
  fromEmail: string,
  job: EmailJob,
): Promise<'sent' | 'failed'> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromEmail, to: [job.recipient], subject: job.subject, html: job.html }),
    })
    const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string }
    await supabase.from('cmdb_renewal_notifications').upsert({
      notification_type: job.type,
      event_key: job.eventKey,
      item_id: job.itemId,
      recipient: job.recipient,
      status: response.ok ? 'sent' : 'failed',
      provider_message_id: responseBody.id ?? null,
      error: response.ok ? null : responseBody.message ?? `HTTP ${response.status}`,
      sent_at: new Date().toISOString(),
    }, { onConflict: 'notification_type,event_key,recipient' })
    return response.ok ? 'sent' : 'failed'
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email provider error'
    await supabase.from('cmdb_renewal_notifications').upsert({
      notification_type: job.type,
      event_key: job.eventKey,
      item_id: job.itemId,
      recipient: job.recipient,
      status: 'failed',
      error: message,
      sent_at: new Date().toISOString(),
    }, { onConflict: 'notification_type,event_key,recipient' })
    return 'failed'
  }
}

Deno.serve(async request => {
  console.log('[cmdb-renewal-alerts] Invocation received', { method: request.method, timestamp: new Date().toISOString() })
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!supabaseUrl || !serviceRoleKey || !anonKey || !resendApiKey) {
    return jsonResponse({ error: 'Missing server secrets' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const cronSecret = Deno.env.get('CRON_SECRET')
  const invokedByCron = Boolean(cronSecret && request.headers.get('x-cron-secret') === cronSecret)
  if (!invokedByCron) {
    const authorization = request.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return jsonResponse({ error: 'Unauthorized' }, 401)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: allowed, error: permissionError } = await userClient.rpc('cmdb_has_permission', { p_permission: 'alerts.configure' })
    if (permissionError || allowed !== true) return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const { data: settings, error: settingsError } = await supabase
    .from('cmdb_alert_settings').select('*').eq('id', true).single<AlertSettings>()
  if (settingsError) return jsonResponse({ error: settingsError.message }, 500)
  if (!settings.enabled) return jsonResponse({ skipped: 'Alerts disabled' })
  if (!settings.from_email || settings.recipients.length === 0) {
    return jsonResponse({ error: 'Sender and recipients must be configured' }, 422)
  }

  const timeZone = settings.timezone || 'America/Mexico_City'
  try {
    datePartsInTimeZone(new Date(), timeZone)
  } catch {
    return jsonResponse({ error: `Invalid timezone: ${timeZone}` }, 422)
  }

  const { data, error: itemsError } = await supabase.from('cmdb_items')
    .select('id,name,item_type,vendor,branch,qty,serial,expiration_date,expiration_not_required,process,process_updated_at,process_stale_days,cmdb_clients(name)')
    .eq('category', 'Licenses')
  if (itemsError) return jsonResponse({ error: itemsError.message }, 500)
  const items = (data ?? []) as unknown as LicenseItem[]

  const { data: qualityRules, error: qualityRulesError } = await supabase
    .from('cmdb_quality_rule_settings').select('issue_code,enabled,severity')
  const qualityRuleMap = new Map((qualityRules ?? []).map(rule => [rule.issue_code, rule as {
    issue_code: string
    enabled: boolean
    severity: QualityIssue['severity']
  }]))
  const detectedIssues = items.flatMap(item => validateLicense(item, timeZone))
    .filter(issue => qualityRulesError || qualityRuleMap.get(issue.issue_code)?.enabled !== false)
    .map(issue => ({ ...issue, severity: qualityRuleMap.get(issue.issue_code)?.severity ?? issue.severity }))

  const { data: openIssues } = await supabase
    .from('cmdb_data_quality_issues').select('id,item_id,issue_code').is('resolved_at', null)
  const detectedKeys = new Set(detectedIssues.map(issue => `${issue.item_id}:${issue.issue_code}`))
  const openIssueMap = new Map((openIssues ?? []).map(issue => [`${issue.item_id}:${issue.issue_code}`, issue]))
  const nowIso = new Date().toISOString()
  const resolvedIssueIds = (openIssues ?? [])
    .filter(issue => !detectedKeys.has(`${issue.item_id}:${issue.issue_code}`)).map(issue => issue.id)
  const existingIssueIds = detectedIssues
    .map(issue => openIssueMap.get(`${issue.item_id}:${issue.issue_code}`)?.id).filter((id): id is string => Boolean(id))
  const newIssues = detectedIssues.filter(issue => !openIssueMap.has(`${issue.item_id}:${issue.issue_code}`))
  if (resolvedIssueIds.length) {
    await supabase.from('cmdb_data_quality_issues')
      .update({ resolved_at: nowIso, resolution: 'Automatically resolved after record correction' }).in('id', resolvedIssueIds)
  }
  if (existingIssueIds.length) {
    await supabase.from('cmdb_data_quality_issues').update({ last_detected_at: nowIso }).in('id', existingIssueIds)
  }
  if (newIssues.length) await supabase.from('cmdb_data_quality_issues').insert(newIssues)

  const datedItems: RenewalItem[] = items
    .filter(item => item.expiration_date && !item.expiration_not_required)
    .map(item => ({ ...item, days: calendarDaysUntil(item.expiration_date!, timeZone) }))
  const summaryWindow = Math.max(...settings.thresholds.filter(Number.isFinite), 90)
  const summaryItems = datedItems.filter(item => item.days <= summaryWindow)
  const staleItems = datedItems.map(item => ({ item, ageDays: elapsedDays(item.process_updated_at) }))
    .filter(({ item, ageDays }) => item.process?.trim() && ageDays !== null && ageDays >= item.process_stale_days)
  const criticalItems = datedItems.filter(item => item.days <= 7)
  const escalationRecipients = settings.escalation_recipients?.length
    ? settings.escalation_recipients
    : settings.recipients
  const today = localDateKey(new Date(), timeZone)

  const jobs: EmailJob[] = []
  if (summaryItems.length || detectedIssues.length) {
    for (const recipient of settings.recipients) jobs.push({
      type: 'daily_summary', eventKey: today, itemId: null, recipient,
      subject: `CMDB: resumen diario de renovaciones (${summaryItems.length})`,
      html: renderDailySummary(summaryItems, detectedIssues),
    })
  }
  for (const { item, ageDays } of staleItems) {
    const followUpKey = item.process_updated_at ? new Date(item.process_updated_at).toISOString() : 'none'
    for (const recipient of settings.recipients) jobs.push({
      type: 'stalled_process',
      eventKey: `${item.id}:${item.process}:${followUpKey}`,
      itemId: item.id,
      recipient,
      subject: `CMDB: proceso estancado - ${item.cmdb_clients?.name ?? 'Sin cliente'} / ${item.name}`,
      html: renderStalledProcess(item, ageDays!),
    })
  }
  for (const item of criticalItems) {
    const expired = item.days < 0
    const type: NotificationType = expired ? 'expired' : 'critical_7_days'
    for (const recipient of escalationRecipients) jobs.push({
      type,
      eventKey: `${item.id}:${item.expiration_date}`,
      itemId: item.id,
      recipient,
      subject: `CMDB: ${expired ? 'LICENCIA VENCIDA' : 'renovación crítica'} - ${item.cmdb_clients?.name ?? 'Sin cliente'} / ${item.name}`,
      html: renderCritical(item, expired),
    })
  }

  const { data: previousNotifications, error: historyError } = jobs.length
    ? await supabase.from('cmdb_renewal_notifications')
      .select('notification_type,event_key,recipient,status')
      .in('recipient', [...new Set(jobs.map(job => job.recipient))])
      .in('event_key', [...new Set(jobs.map(job => job.eventKey))])
    : { data: [], error: null }
  if (historyError) return jsonResponse({ error: historyError.message }, 500)
  const sentKeys = new Set((previousNotifications ?? []).filter(row => row.status === 'sent')
    .map(row => `${row.notification_type}:${row.event_key}:${row.recipient}`))
  const pendingJobs = jobs.filter(job => !sentKeys.has(`${job.type}:${job.eventKey}:${job.recipient}`))

  let sent = 0
  let failed = 0
  const byType: Record<NotificationType, number> = {
    daily_summary: 0,
    stalled_process: 0,
    critical_7_days: 0,
    expired: 0,
  }
  for (const job of pendingJobs) {
    const result = await sendJob(supabase, resendApiKey, settings.from_email, job)
    if (result === 'sent') {
      sent += 1
      byType[job.type] += 1
    } else failed += 1
  }

  return jsonResponse({
    licenses: items.length,
    summary_items: summaryItems.length,
    stalled_processes: staleItems.length,
    critical_items: criticalItems.length,
    issues: detectedIssues.length,
    sent,
    failed,
    sent_by_type: byType,
  })
})
