import blogs from '../../../data/blogs.json'
import communities from '../../../data/communities.json'
import { normalizeBlogHealthUrl } from '../../../shared/blog-health-url.js'

const buildCatalogueMap = (entries) =>
  new Map(
    entries.flatMap((entry) => {
      try {
        return [[normalizeBlogHealthUrl(entry.url).toString(), entry]]
      } catch {
        return []
      }
    })
  )

const catalogueMaps = new Map([
  [false, buildCatalogueMap(blogs)],
  [true, buildCatalogueMap(communities)]
])

export function getCatalogueEntry(community, url) {
  return catalogueMaps.get(community)?.get(url)
}
