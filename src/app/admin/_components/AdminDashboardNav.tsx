import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Building2,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  FileUp,
  Settings,
  Sun,
  TrendingUp,
  Users,
} from 'lucide-react'

export type AdminNavCounts = {
  pendingClaims:     number
  pendingVariations: number
  pendingHolidays:   number
  pendingWorkers:    number
}

type NavItem = {
  href:        string
  icon:        LucideIcon
  label:       string
  description: string
  badge?:      number
  accent?:     boolean
}

type NavSection = {
  title: string
  items: NavItem[]
}

function buildSections(counts: AdminNavCounts): NavSection[] {
  return [
    {
      title: 'Bookings & pay',
      items: [
        {
          href:        '/admin/claims',
          icon:        ClipboardCheck,
          label:       'Booking in',
          description: 'Wages register & pay',
          badge:       counts.pendingClaims,
          accent:      counts.pendingClaims > 0,
        },
        {
          href:        '/admin/variations',
          icon:        FileUp,
          label:       'Variations',
          description: 'Review foreman valuations',
          badge:       counts.pendingVariations,
        },
        {
          href:        '/admin/production',
          icon:        TrendingUp,
          label:       'Production cost',
          description: 'Monthly wages by site',
        },
      ],
    },
    {
      title: 'Sites & work',
      items: [
        {
          href:        '/admin/sites',
          icon:        Building2,
          label:       'Manage sites',
          description: 'Price grids & Excel imports',
        },
        {
          href:        '/admin/jetwash',
          icon:        Droplets,
          label:       'Jetwash',
          description: 'Plot washing progress & pay log',
        },
        {
          href:        '/admin/qa',
          icon:        ClipboardList,
          label:       'Quality checks',
          description: 'Stage inspections by plot',
        },
      ],
    },
    {
      title: 'Team',
      items: [
        {
          href:        '/admin/workers',
          icon:        Users,
          label:       'Workers',
          description: 'Inductions, profiles & activation',
          badge:       counts.pendingWorkers,
          accent:      counts.pendingWorkers > 0,
        },
        {
          href:        '/admin/holidays',
          icon:        Sun,
          label:       'Holidays',
          description: 'Management leave tracker',
          badge:       counts.pendingHolidays,
        },
      ],
    },
    {
      title: 'System',
      items: [
        {
          href:        '/admin/settings',
          icon:        Settings,
          label:       'Settings',
          description: 'Pay cycle, fees & booking window',
        },
      ],
    },
  ]
}

function NavCard({ item }: { item: NavItem }) {
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      className={`group relative flex flex-col gap-2 rounded-2xl border p-4 transition-colors ${
        item.accent
          ? 'border-orange-200 bg-orange-50 hover:border-orange-300 hover:bg-orange-100/80'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      {item.badge != null && item.badge > 0 && (
        <span className="absolute top-3 right-3 min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
          {item.badge}
        </span>
      )}
      <div
        className={`w-9 h-9 rounded-xl flex items-center justify-center ${
          item.accent ? 'bg-orange-200 text-orange-800' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
        }`}
      >
        <Icon className="w-[18px] h-[18px]" />
      </div>
      <div className="pr-6">
        <p className={`font-semibold text-sm ${item.accent ? 'text-orange-950' : 'text-slate-900'}`}>
          {item.label}
        </p>
        <p className={`text-xs mt-0.5 leading-snug ${item.accent ? 'text-orange-800/80' : 'text-slate-500'}`}>
          {item.description}
        </p>
      </div>
    </Link>
  )
}

function ActionBanner({ counts }: { counts: AdminNavCounts }) {
  const parts: string[] = []
  if (counts.pendingClaims > 0) {
    parts.push(`${counts.pendingClaims} claim${counts.pendingClaims !== 1 ? 's' : ''}`)
  }
  if (counts.pendingVariations > 0) {
    parts.push(`${counts.pendingVariations} variation${counts.pendingVariations !== 1 ? 's' : ''}`)
  }
  if (counts.pendingHolidays > 0) {
    parts.push(`${counts.pendingHolidays} holiday request${counts.pendingHolidays !== 1 ? 's' : ''}`)
  }
  if (counts.pendingWorkers > 0) {
    parts.push(`${counts.pendingWorkers} new worker${counts.pendingWorkers !== 1 ? 's' : ''}`)
  }

  if (!parts.length) return null

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
      <p className="text-sm text-amber-900">
        <span className="font-semibold">Needs attention:</span>{' '}
        {parts.join(' · ')}
      </p>
      <div className="flex flex-wrap gap-2 shrink-0">
        {counts.pendingClaims > 0 && (
          <Link
            href="/admin/claims"
            className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Review claims
          </Link>
        )}
        {counts.pendingWorkers > 0 && (
          <Link
            href="/admin/workers"
            className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-lg border border-amber-300 transition-colors"
          >
            Review workers
          </Link>
        )}
      </div>
    </div>
  )
}

export default function AdminDashboardNav({ counts }: { counts: AdminNavCounts }) {
  const sections = buildSections(counts)

  return (
    <div className="space-y-6">
      <ActionBanner counts={counts} />

      {sections.map((section) => (
        <section key={section.title}>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            {section.title}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.items.map((item) => (
              <NavCard key={item.href} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
