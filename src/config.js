// Main configuration: bot settings, Google Sheets metadata, and display templates
module.exports = {
  bot: {
    color: 'e6e7e9',
    refreshIntervalMs: 30 * 60_000
  },

  links: {
    description:
      '[SFF PC Masterlist](https://bit.ly/30BJn2S) - by <@453436176490037250>\n' +
      '[Compare SFF PC](https://comparesffpc.com/) - Compare SFF case sizes in 3D\n' +
      '[CaseEnd](https://caseend.com/) - User friendly SFF case database'
  },

  sheets: {
    spreadsheetId: process.env.SHEETS_SPREADSHEET_ID || '1AddRvGWJ_f4B6UC7_IftDiVudVc8CJ8sxLUqlxVsCz4',

    tabs: {
      'SFF Case <10L': { category: 'Cases' },
      'SFF Case 10L-20L': { category: 'Cases' },
      'MFF Case >20L': { category: 'Cases' },
      'CPU Cooler <70mm': { category: 'Coolers (Air)' },
      'AIO': { category: 'Coolers (AIO)' },
      'Slim Fan': { category: 'Slim Fans' },
      'mITX Boards': { category: 'Mobos (ITX)' },
      'SFF GPU <215mm': { category: 'Graphics Cards' },
      'GPU >215mm': { category: 'Graphics Cards' }
    },

    formatting: {
      Cases: {
        title: '{{Seller}} {{Case}}',
        desc:
          '**Volume**: {{Volume (L)}}L [{{Case Length (mm)}} × {{Case Width (mm)}} × {{Case Height (mm)}}mm]\n' +
          '**Style**: {{Style}}\n' +
          '**Motherboard**: {{Motherboard}}\n' +
          '**CPU Cooler**:\n' +
          '<:blank:858431977011281921> Clearance: {{CPU Cooler Height (mm)}}mm\n' +
          '<:blank:858431977011281921> AIO Support: {{AIO / Radiator Support}}\n' +
          '**GPU Support**:\n' +
          '<:blank:858431977011281921> L×W×H: {{GPU Length (mm)}} × {{GPU Width (mm)}} × {{GPU Height / Thickness (mm)}}mm \n' +
          '<:blank:858431977011281921> PCIe Slots: {{PCIe Slot}} slot(s)\n' +
          '**PSU Support**: {{PSU}}\n' +
          '**Price (USD)**: ${{Price (USD)}}'
      },
      'Coolers (AIO)': {
        title: '{{Brand}} {{Model}}',
        desc:
          '**Type**: {{Radiator Type}}mm\n' +
          '**Radiator**:\n' +
          '<:blank:858431977011281921> L×W×H: {{Radiator Length (mm)}} × {{Radiator Width (mm)}} × {{Radiator Thickness (mm)}}mm\n' +
          '<:blank:858431977011281921> Material: {{Radiator Material}}\n' +
          '**Fans**:\n' +
          '<:blank:858431977011281921> Count: {{Fans}} fan(s)\n' +
          '<:blank:858431977011281921> Size: {{Fan Size (mm)}}mm\n' +
          '<:blank:858431977011281921> Max Noise: {{Fan Noise (dB(A))}} dB(A)\n' +
          '**CPU Block**:\n' +
          '<:blank:858431977011281921> L×W×H: {{CPU Block Length (mm)}} × {{CPU Block Width (mm)}} × {{CPU Block Height (mm)}}mm\n' +
          '<:blank:858431977011281921> Pump Speed: {{Pump Speed (rpm)}} RPM'
      },
      'Coolers (Air)': {
        title: '{{Brand}} {{Cooler}}',
        desc:
          '**Height**: {{Height (mm)}}mm\n' +
          '**L × W**: {{Length (mm)}} × {{Width (mm)}}mm\n' +
          '**Fans**:\n' +
          '<:blank:858431977011281921> Count: {{Fans}} fan(s)\n' +
          '<:blank:858431977011281921> Size: {{Fan Size (mm)}}mm\n' +
          '<:blank:858431977011281921> Speed: {{Max Fan Speed (RPM)}} RPM\n' +
          '<:blank:858431977011281921> Airflow/SP: {{Max Air Flow (CFM)}} CFM / {{Max Static Pressure (mmH2O)}} mmH2O\n' +
          '<:blank:858431977011281921> Max Noise: {{Max Noise (dB(A))}} dB(A)\n' +
          '**Heatsink**:\n' +
          '<:blank:858431977011281921> Material: {{Heatsink Material}}\n' +
          '<:blank:858431977011281921> Heatpipes: {{Heatpipes}}\n' +
          '**RAM Clearance**: {{RAM Clearance (mm)}} (mm)'
      },
      'Slim Fans': {
        title: '{{Brand}} {{Model}}',
        desc:
          '**Size**: {{Fan Size (mm)}}x{{Thickness (mm)}}mm\n' +
          '**Max Speed**: {{Max Fan Speed (rpm)}} RPM\n' +
          '**Airflow/SP**: {{Max Air Flow (CFM)}} CFM / {{Max Static Pressure (mmH2O)}} mmH2O\n' +
          '**Max Noise**: {{Max Noise (dB(A))}} dB(A)\n' +
          '**PWM / DC**: {{PWM / DC}}'
      },
      'Mobos (ITX)': {
        title: '{{Brand}} {{Name}}',
        desc:
          '**Socket/Chipset**: {{CPU}} {{Socket}} - {{Chipset}}\n' +
          '**OC Support (CPU/RAM)**: {{CPU Overclock}} / {{RAM Overclock}}\n' +
          '**RAM Support**: {{RAM Slots}} Slots - {{Supported RAM Capacity (GB)}}GB {{RAM Type}} - {{Supported Memory Speed (Mbps)}} MHz\n' +
          '**VRM Phases (VCore)**: {{VCore Total VRM Phases}}\n' +
          '**Connectivity**:\n' +
          '<:blank:858431977011281921> USB Ports: {{Total USB Ports}}\n' +
          '<:blank:858431977011281921> USB-C Header: {{USB-C Header}}\n' +
          '<:blank:858431977011281921> LAN: {{LAN Speed (Gbps)}}G {{LAN Controller}}\n' +
          '<:blank:858431977011281921> Wi-Fi: {{Wi-Fi Module}}\n' +
          '<:blank:858431977011281921> Bluetooth: {{Bluetooth}}\n' +
          '<:blank:858431977011281921> M.2 SSD Slots: {{M.2 (Key-M) NVMe/SATA SSD Slot\\nGreen=Front\\nRed=Back}}\n' +
          '<:blank:858431977011281921> SATA Ports: {{SATA 3.0 Ports}}\n' +
          '**PCIe Slots**: {{PCIe x16 Slot}}\n' +
          '**BIOS Flashback**: {{BIOS Flashback}}\n' +
          '**Bifurcation**: {{PCIe Bifurcation Support}}\n' +
          '**Notes**: {{Remarks}}'
      },
      'Graphics Cards': {
        title: '{{Brand}} {{Model}} - {{Name}}',
        desc:
          '**Boost Clock**: {{Boost Clock (MHz)}} Mhz\n' +
          '**VRAM**: {{Memory}} ({{Memory Speed (Gbps)}} Gbps)\n' +
          '**TDP**: {{TDP (W)}}W\n' +
          '**L × W**: {{Length (mm)}} × {{Width (mm)}}mm\n' +
          '**Thickness (Height)**: {{Thickness (mm)}}mm\n' +
          '**GPU Fans**: {{Fans}}\n' +
          '**Watercooled**: {{Watercooled}}'
      }
    }
  },

  api: {
    port: parseInt(process.env.API_PORT, 10) || 3000
  }
}
