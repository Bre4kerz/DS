export default function StatusPill({ status }: { status: string }) {
  const label: Record<string, string> = {
    'OK': 'OK',
    'Expiring': 'Expiring',
    'Expired': 'Expired',
    'No date': 'No date',
    'Not required': 'Not required',
  }
  const styles: Record<string, string> = {
    'OK': 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    'Expiring': 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    'Expired': 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    'No date': 'bg-slate-700 text-slate-300 border-slate-600',
    'Not required': 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  }
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${styles[status] || styles['No date']}`}>
      {label[status] || status}
    </span>
  )
}
