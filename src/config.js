// Main configuration: bot settings, Google Sheets metadata, and display templates
module.exports = {
  bot: {
    color: 'e6e7e9',
    refreshIntervalMs: 30 * 60_000
  },

  agent: {
    enabled: true,
    provider: 'xai', // prod: grok-4.5 (reasoningEffort low); override per-process with AGENT_PROVIDER
    model: 'grok-4.5',
    thinking: true,
    maxSteps: 10,
    maxToolCalls: 10,
    cooldownMs: 30_000,
    logReasoning: process.env.AGENT_DEBUG === 'true',
    maxResults: 30,
    rejectBareChipBrowse: process.env.AGENT_REJECT_BARE_CHIP !== '0',
    timeoutMs: 75_000,
    // Fit-relevant fields returned by tools when select is omitted (pass select for full specs)
    defaultSelect: {
      Cases: [
        'Seller', 'Case', 'Volume (L)',
        'GPU Length (mm)', 'GPU Width (mm)', 'GPU Height / Thickness (mm)', 'PCIe Slot',
        'CPU Cooler Height (mm)', 'AIO / Radiator Support', 'PSU', 'Motherboard',
        'Price (USD)'
      ],
      'Graphics Cards': [
        'Brand', 'Model', 'Name',
        'Length (mm)', 'Width (mm)', 'Thickness (mm)', 'Watercooled'
      ],
      'Coolers (Air)': [
        'Brand', 'Cooler', 'Height (mm)', 'Length (mm)', 'Width (mm)',
        'RAM Clearance (mm)', 'Fans', 'Fan Size (mm)'
      ],
      'Coolers (AIO)': [
        'Brand', 'Model', 'Radiator Type',
        'Radiator Length (mm)', 'Radiator Thickness (mm)', 'Rad + Fan Total Thickness (mm)',
        'CPU Block Height (mm)', 'Fans', 'Fan Size (mm)'
      ],
      'Slim Fans': ['Brand', 'Model', 'Fan Size (mm)', 'Thickness (mm)'],
      'Mobos (ITX)': [
        'Brand', 'Name', 'CPU', 'Socket', 'Chipset',
        'RAM Slots', 'Supported RAM Capacity (GB)', 'RAM Type', 'PCIe x16 Slot'
      ]
    },
    margins: {
      gpuRiser: 15,
      gpu8pin: 30,
      gpu12vhpwr: 35,
      aioServiceMm: 8,
      coolerMarginMm: 4,
      slimFanMm: 15
    },
    status: {
      searching: '<a:loading:1515171713174994994>  Searching the database…',
      formatting: '<a:typing:1516013194777329725>  Synthesizing answer...'
    }
  },

  links: {
    description:
      '[SFF PC Masterlist](https://bit.ly/30BJn2S) - by <@453436176490037250>\n' +
      '[Compare SFF PC](https://comparesffpc.com/) - Compare SFF case sizes in 3D\n' +
      '[CaseEnd](https://caseend.com/) - User friendly SFF case database'
  },

  sheets: {
    spreadsheetId:
      process.env.SHEETS_SPREADSHEET_ID ||
      '1AddRvGWJ_f4B6UC7_IftDiVudVc8CJ8sxLUqlxVsCz4',

    tabs: {
      'SFF Case <10L': { category: 'Cases' },
      'SFF Case 10L-20L': { category: 'Cases' },
      'MFF Case >20L': { category: 'Cases' },
      'CPU Cooler <70mm': { category: 'Coolers (Air)' },
      AIO: { category: 'Coolers (AIO)' },
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
    },

    aliases: {
      Cases: {
        volume: 'Volume (L)',
        footprint: 'Footprint (cm2)',
        case_length: 'Case Length (mm)',
        case_width: 'Case Width (mm)',
        case_height: 'Case Height (mm)',
        cooler_height: 'CPU Cooler Height (mm)',
        gpu_length: 'GPU Length (mm)',
        gpu_width: 'GPU Width (mm)',
        gpu_thickness: 'GPU Height / Thickness (mm)',
        pcie_slot: 'PCIe Slot',
        psu: 'PSU',
        motherboard: 'Motherboard',
        price_usd: 'Price (USD)',
        style: 'Style'
      },
      'Graphics Cards': {
        length: 'Length (mm)',
        width: 'Width (mm)',
        thickness: 'Thickness (mm)',
        tdp: 'TDP (W)',
        memory: 'Memory'
      },
      'Coolers (AIO)': {
        radiator_type: 'Radiator Type',
        radiator_length: 'Radiator Length (mm)',
        radiator_thickness: 'Radiator Thickness (mm)',
        rad_fan_thickness: 'Rad + Fan Total Thickness (mm)',
        block_height: 'CPU Block Height (mm)',
        fans: 'Fans'
      },
      'Coolers (Air)': {
        height: 'Height (mm)',
        ram_clearance: 'RAM Clearance (mm)',
        fans: 'Fans'
      },
      'Slim Fans': {
        fan_size: 'Fan Size (mm)',
        thickness: 'Thickness (mm)'
      }
    }
  },

  api: {
    port: parseInt(process.env.API_PORT, 10) || 3000
  }
}
