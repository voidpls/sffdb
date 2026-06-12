const TEMPLATE_RE = /{{(.*?)}}/gs

function normalizeValue (value) {
  if (value === 'Y') return 'Yes'
  if (!value) return '-'
  return String(value).replace(/\n/g, ' ')
}

// Replaces {{FieldName}} placeholders with actual values from the component
function renderTemplate (template, component, { markdown = true } = {}) {
  return template.replace(TEMPLATE_RE, (match, key) => {
    let value = normalizeValue(component[key])
    if (!markdown) value = value.replace(/\*+/g, '')
    return value
  })
}

function formatComponent (component, templates) {
  const template = templates[component.category]
  if (!template) return null

  return {
    title: renderTemplate(template.title, component),
    description: renderTemplate(template.desc, component)
  }
}

function formatComponentJSON (component, templates) {
  const template = templates[component.category]
  if (!template) return null

  const data = {}
  for (const key of Object.keys(component)) {
    if (key === 'INDEX' || key === 'category') continue
    data[key] = normalizeValue(component[key])
  }

  return {
    title: renderTemplate(template.title, component, { markdown: false }),
    description: renderTemplate(template.desc, component, { markdown: false }),
    data
  }
}

module.exports = { formatComponent, formatComponentJSON }
