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

export const INDEPENDENT_WEB_STATS_CONFIG = {
  sectionHeading: '',
  statistics: allBlogStatistics.map((statistic) => ({
    ...statistic,
    label:
      statistic.label === 'Total Blogs' ? 'Total Websites' : statistic.label,
    description:
      statistic.metric === 'total-blogs'
        ? 'Published independent websites currently listed in BlogR.'
        : statistic.metric === 'known-countries'
          ? 'Verified countries represented in the Independent Web directory.'
          : 'Independent websites with confirmed content activity today.'
  }))
}

const recentlyUpdatedStatistics = [
  {
    key: 'updated-today',
    metric: 'content-updates',
    label: 'Updated Today',
    enabled: true,
    order: 1,
    period: { type: 'calendar-day' },
    description: 'Blogs updated during the current London calendar day.'
  },
  {
    key: 'updated-last-seven-days',
    metric: 'content-updates',
    label: 'Last 7 Days',
    enabled: true,
    order: 2,
    period: { type: 'rolling-days', days: 7 },
    description: 'Blogs updated today or during the previous six calendar days.'
  },
  {
    key: 'updated-this-month',
    metric: 'content-updates',
    label: 'This Month',
    enabled: true,
    order: 3,
    period: { type: 'calendar-month' },
    description: 'Blogs updated during the current London calendar month.'
  }
]

export const RECENTLY_ADDED_STATISTICS = recentlyAddedStatistics
export const ALL_BLOG_STATISTICS = allBlogStatistics
export const RECENTLY_UPDATED_STATS_CONFIG = {
  sectionHeading: '',
  statistics: recentlyUpdatedStatistics
}
export const RECENTLY_UPDATED_STATISTICS = recentlyUpdatedStatistics
