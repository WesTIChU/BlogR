const COMPONENT_RE = /<BlogHealthLink\b([^>]*)\/>/gi
const ATTRIBUTE_RE = /\b(name|url)=(['"])(.*?)\2/gi

export function expandDirectoryComponents(markdown) {
  return markdown.replace(COMPONENT_RE, (_match, attributes) => {
    const values = {}
    for (const match of attributes.matchAll(ATTRIBUTE_RE)) {
      values[match[1]] = match[3]
    }

    if (!values.name || !values.url) return ''
    return `[${values.name}](${values.url})`
  })
}
