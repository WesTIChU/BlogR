/**
 *  Copyright (c) 2025 taskylizard. Apache License 2.0.
 *  Modified for BlogR Directory, 2026.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import type { DefaultTheme } from 'vitepress'

// @unocss-include

export const meta = {
  name: 'BlogR Directory',
  description:
    'A directory for discovering independent blogs and personal websites.',
  hostname:
    typeof process !== 'undefined' && process.env.NODE_ENV === 'development'
      ? 'http://localhost:5173'
      : 'https://blogr.directory',
  keywords: ['blogs', 'independent blogs', 'personal websites', 'indie web']
}

export const excluded = ['readme.md', 'index.md', 'single-page.md']

// Strip the URL scheme and a leading "www." so URLs compare consistently.
export const stripSchemeAndWww = (value: string) =>
  value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '')

const TRACKING_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'mc_cid',
  'mc_eid',
  'wbraid'
])

export function normalizeSearchUrl(value: string) {
  const stripped = stripSchemeAndWww(value)
  const hashIndex = stripped.indexOf('#')
  const withoutHash = hashIndex === -1 ? stripped : stripped.slice(0, hashIndex)
  const hash = hashIndex === -1 ? '' : stripped.slice(hashIndex + 1)
  const queryIndex = withoutHash.indexOf('?')

  if (queryIndex === -1) {
    return hash ? `${withoutHash}#${hash}` : withoutHash
  }

  const hostPath = withoutHash.slice(0, queryIndex)
  const params = new URLSearchParams(withoutHash.slice(queryIndex + 1))

  for (const key of [...params.keys()]) {
    if (key.startsWith('utm_') || TRACKING_QUERY_PARAMS.has(key)) {
      params.delete(key)
    }
  }

  const query = params.toString()

  return `${hostPath}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`
}

export const footerMessage = `<span class="site-footer-message">A directory for discovering independent blogs</span>`

export const socialLinks: DefaultTheme.SocialLink[] = []

const discoverItems: DefaultTheme.NavItemWithLink[] = [
  {
    text: '<span class="i-twemoji-books"></span> All Blogs',
    link: '/blogs'
  },
  {
    text: '<span class="i-twemoji-new-button"></span> Recently Added',
    link: '/recently-added'
  },
  {
    text: '<span class="i-twemoji-writing-hand"></span> Personal Writing',
    link: '/personal-writing'
  },
  {
    text: '<span class="i-twemoji-globe-showing-europe-africa"></span> Culture & Places',
    link: '/collections/culture-and-places'
  },
  {
    text: '<span class="i-twemoji-airplane"></span> Travel & Outdoors',
    link: '/collections/travel-outdoors'
  },
  {
    text: '<span class="i-twemoji-laptop"></span> Technology',
    link: '/collections/technology'
  },
  {
    text: '<span class="i-twemoji-open-book"></span> Books & Writing',
    link: '/collections/books-and-writing'
  },
  {
    text: '<span class="i-twemoji-artist-palette"></span> Arts & Entertainment',
    link: '/collections/arts-and-entertainment'
  },
  {
    text: '<span class="i-twemoji-potted-plant"></span> Lifestyle & Hobbies',
    link: '/collections/lifestyle-and-hobbies'
  },
  {
    text: '<span class="i-twemoji-money-bag"></span> Money & Business',
    link: '/collections/money-and-business'
  },
  {
    text: '<span class="i-twemoji-microscope"></span> Science & Nature',
    link: '/collections/science-and-nature'
  },
  {
    text: '<span class="i-twemoji-globe-with-meridians"></span> Internet & Society',
    link: '/collections/internet-and-society'
  }
]

const navLabel = (item: DefaultTheme.NavItemWithLink) =>
  item.text.replace(/<[^>]*>/g, '').trim()

const sortedDiscoverItems = [
  ...discoverItems.slice(0, 2),
  ...discoverItems
    .slice(2)
    .sort((a, b) => navLabel(a).localeCompare(navLabel(b)))
]

type NavGroup = Omit<DefaultTheme.NavItemWithChildren, 'items'> & {
  items: DefaultTheme.NavItemWithLink[]
}

export const nav: NavGroup[] = [
  {
    text: '🔎 Discover',
    items: sortedDiscoverItems
  },
  {
    text: '<span class="nav-communities-icon">👥</span> Communities',
    items: [
      {
        text: '<span class="i-twemoji-speech-balloon"></span> Online Communities',
        link: '/communities/online-communities'
      }
    ]
  },
  {
    text: '🛠 Resources',
    items: [
      {
        text: '<span class="i-twemoji-memo"></span> Blogging Platforms',
        link: '/resources/blogging-platforms'
      },
      {
        text: '<span class="i-twemoji-desktop-computer"></span> Hosting',
        link: '/resources/hosting'
      },
      {
        text: '<span class="i-twemoji-house"></span> Self-Hosting',
        link: '/resources/self-hosting'
      },
      {
        text: '<span class="i-twemoji-toolbox"></span> Self-Hosting Apps',
        link: '/resources/self-hosting-apps'
      }
    ]
  },
  {
    text: 'ℹ️ About',
    items: [
      {
        text: '<span class="i-twemoji-information"></span> About',
        link: '/about'
      },
      {
        text: '<span class="i-twemoji-open-mailbox-with-raised-flag"></span> Submit a Blog',
        link: '/submit-a-blog'
      }
    ]
  }
]

export const sidebar: DefaultTheme.Sidebar = [
  {
    text: 'Discover',
    collapsed: false,
    items: nav[0].items
  },
  {
    text: 'Communities',
    collapsed: false,
    items: nav[1].items
  },
  {
    text: 'Resources',
    collapsed: false,
    items: nav[2].items
  }
]
