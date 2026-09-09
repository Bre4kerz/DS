export type SectionColumnKey = 'type' | 'primaryDetail' | 'secondaryDetail' | 'identifier' | 'status' | 'process'

export const DEFAULT_SECTION_COLUMNS: Record<SectionColumnKey, boolean> = {
  type: true,
  primaryDetail: true,
  secondaryDetail: true,
  identifier: true,
  status: true,
  process: true,
}
