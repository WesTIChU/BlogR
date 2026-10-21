import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const readJson = async (path) =>
  JSON.parse(await readFile(resolve(path), 'utf8'))

const render = (exports) =>
  `${exports
    .map(
      ({ name, value }) =>
        `/* prettier-ignore */\nexport const ${name} = ${JSON.stringify(value)}`
    )
    .join('\n\n')}\n`

export async function generateFunctionData({ check = false } = {}) {
  const data = {
    blogs: await readJson('data/blogs.json'),
    blogTaxonomy: await readJson('data/blog-taxonomy.json'),
    communities: await readJson('data/communities.json'),
    websites: await readJson('data/websites.json'),
    communityTaxonomy: await readJson('data/community-taxonomy.json'),
    independentWebTaxonomy: await readJson('data/independent-web-taxonomy.json')
  }
  const files = {
    'shared/blogr-function-data.js': render([
      { name: 'blogs', value: data.blogs },
      { name: 'taxonomy', value: data.blogTaxonomy }
    ]),
    'shared/cloudflare-function-data.js': render([
      { name: 'communities', value: data.communities },
      { name: 'websites', value: data.websites },
      { name: 'communityTaxonomy', value: data.communityTaxonomy },
      {
        name: 'independentWebTaxonomy',
        value: data.independentWebTaxonomy
      }
    ])
  }

  for (const [path, content] of Object.entries(files)) {
    const target = resolve(path)
    if (check) {
      const current = await readFile(target, 'utf8')
      if (current !== content) throw new Error(`${path} is out of date`)
    } else {
      await writeFile(target, content)
    }
  }
}

if (process.argv[1]?.endsWith('/scripts/generate-function-data.js')) {
  await generateFunctionData({ check: process.argv.includes('--check') })
}
