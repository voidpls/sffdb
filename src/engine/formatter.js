const TEMPLATE_RE = /{{(.*?)}}/gs

// Replaces {{FieldName}} placeholders with actual values from the component
function renderTemplate (template, component, { markdown = true } = {}) {
  return template.replace(TEMPLATE_RE, (match, key) => {
    let value = component[key]
    if (value === 'Y') value = 'Yes'
    if (!value) value = '-'
    value = String(value).replace(/\n/g, ' ')
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
    let value = component[key]
    if (value === 'Y') value = 'Yes'
    if (!value) value = '-'
    data[key] = String(value).replace(/\n/g, ' ')
  }

  return {
    title: renderTemplate(template.title, component, { markdown: false }),
    description: renderTemplate(template.desc, component, { markdown: false }),
    data
  }
}

module.exports = { formatComponent, formatComponentJSON }
