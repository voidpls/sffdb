const { google } = require('googleapis')

class SheetsFetcher {
  constructor (spreadsheetId, credentials) {
    this.spreadsheetId = spreadsheetId
    this.sheets = google.sheets({
      version: 'v4',
      auth: new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
      })
    })
  }

  // Fetch all tabs in one API call, returns { tabName: [{col: val, ...}, ...] }
  async fetch (tabs) {
    const tabNames = Object.keys(tabs)
    const start = Date.now()

    const res = await this.sheets.spreadsheets.values.batchGet({
      spreadsheetId: this.spreadsheetId,
      ranges: tabNames
    })

    const data = {}
    const values = res.data.valueRanges || []

    // Each valueRange has headers as row[0], data rows after
    for (let i = 0; i < tabNames.length; i++) {
      const rows = values[i]?.values
      if (!rows || rows.length < 2) continue

      const headers = rows[0]
      data[tabNames[i]] = rows.slice(1).map(row => {
        const obj = {}
        for (let j = 0; j < headers.length; j++) {
          obj[headers[j]] = row[j] ?? ''
        }
        return obj
      })
    }

    const elapsed = Date.now() - start
    const totalRows = Object.values(data).reduce((sum, arr) => sum + arr.length, 0)
    console.info(`[sheets] Fetched ${tabNames.length} tabs (${totalRows} rows) in ${elapsed}ms`)

    return data
  }
}

module.exports = SheetsFetcher
