import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createD1RegistryClient,
  synchroniseWebringMembers,
  synchroniseWebringRegistry
} from '../shared/webring-registry.js'

const paths = ['data/blogs.json', 'data/websites.json', 'data/communities.json']
const catalogues = await Promise.all(
  paths.map(async (path) => JSON.parse(await readFile(resolve(path), 'utf8')))
)

const db = createD1RegistryClient({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
  apiToken: process.env.CLOUDFLARE_API_TOKEN
})
await synchroniseWebringRegistry(db, catalogues)
await synchroniseWebringMembers(db, catalogues)
