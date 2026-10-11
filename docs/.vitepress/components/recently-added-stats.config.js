const recentlyAddedStatistics = [
  {
    key: 'today',
    label: 'Today',
    enabled: true,
    order: 1,
    period: { type: 'calendar-day' },
    description: 'Added during the current London calendar day.'
  },
  {
    key: 'last-seven-days',
    label: 'Last 7 days',
    enabled: true,
    order: 2,
    period: { type: 'rolling-days', days: 7 },
    description: 'Added today or during the previous six calendar days.'
  },
  {
    key: 'this-month',
    label: 'This Month',
    enabled: true,
    order: 3,
    period: { type: 'calendar-month' },
    description: 'Added during the current London calendar month.'
  }
]

const allBlogStatistics = [
  {
    key: 'total-blogs',
    metric: 'total-blogs',
    label: 'Total Blogs',
    enabled: true,
    order: 1,
    description: 'Published blogs currently listed in BlogR.'
  },
  {
    key: 'known-countries',
    metric: 'known-countries',
    label: 'Known Countries',
    enabled: true,
    order: 2,
    description: 'Verified countries represented in the directory.'
  },
  {
    key: 'updated-today',
    metric: 'content-updates',
    label: 'Updated Today',
    enabled: true,
    order: 3,
    period: { type: 'calendar-day' },
    description: 'Blogs with confirmed content activity today.'
  }
]

export const RECENTLY_ADDED_STATS_CONFIG = {
  sectionHeading: '',
  statistics: recentlyAddedStatistics
}

export const ALL_BLOG_STATS_CONFIG = {
  sectionHeading: '',
  statistics: allBlogStatistics
}

export const RECENTLY_ADDED_STATISTICS = recentlyAddedStatistics
export const ALL_BLOG_STATISTICS = allBlogStatistics
