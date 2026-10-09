// Bursa Malaysia universe grouped by sector. Verify codes against Bursa before trading.
const STOCKS = {
  Banking: [
    ['1155', 'MAYBANK', 'Malayan Banking'], ['1295', 'PBBANK', 'Public Bank'],
    ['1023', 'CIMB', 'CIMB Group'], ['5819', 'HLBANK', 'Hong Leong Bank'],
    ['1066', 'RHBBANK', 'RHB Bank'],
  ],
  Utilities: [
    ['5347', 'TENAGA', 'Tenaga Nasional'], ['6742', 'YTLPOWR', 'YTL Power'],
    ['4677', 'YTL', 'YTL Corporation'], ['5264', 'MALAKOF', 'Malakoff Corp'],
  ],
  Construction: [
    ['5398', 'GAMUDA', 'Gamuda'], ['5263', 'SUNCON', 'Sunway Construction'],
    ['5148', 'UEMS', 'UEM Sunrise'],
  ],
  Technology: [
    ['0166', 'INARI', 'Inari Amertron'], ['0270', 'NATGATE', 'Nationgate Holdings'],
    ['0097', 'VITROX', 'ViTrox'], ['0128', 'FRONTKN', 'Frontken'],
    ['0138', 'MYEG', 'MyEG Services'], ['0208', 'GREATEC', 'Greatech'],
    ['5292', 'UWC', 'UWC Berhad'], ['4456', 'DNEX', 'Dagang NeXchange'],
  ],
  Telecommunications: [
    ['4863', 'TM', 'Telekom Malaysia'], ['6012', 'MAXIS', 'Maxis'],
    ['6888', 'AXIATA', 'Axiata Group'],
  ],
  Consumer: [
    ['5326', '99SMART', '99 Speed Mart'], ['5296', 'MRDIY', 'MR D.I.Y. Group'],
    ['4707', 'NESTLE', 'Nestle Malaysia'], ['4065', 'PPB', 'PPB Group'],
    ['7084', 'QL', 'QL Resources'],
  ],
  Plantation: [
    ['2445', 'KLK', 'Kuala Lumpur Kepong'], ['1961', 'IOICORP', 'IOI Corporation'],
    ['5285', 'SDPLANT', 'Sime Darby Plantation'],
  ],
  'Energy & Petrochemical': [
    ['5183', 'PCHEM', 'Petronas Chemicals'], ['5681', 'PETDAG', 'Petronas Dagangan'],
    ['3816', 'MISC', 'MISC Berhad'], ['7277', 'DIALOG', 'Dialog Group'],
  ],
  Healthcare: [
    ['5225', 'IHH', 'IHH Healthcare'], ['5878', 'KPJ', 'KPJ Healthcare'],
    ['5168', 'HARTA', 'Hartalega'], ['7106', 'SUPERMX', 'Supermax'],
  ],
  Conglomerate: [
    ['4197', 'SIME', 'Sime Darby'], ['3182', 'GENTING', 'Genting'],
    ['4715', 'GENM', 'Genting Malaysia'],
  ],
  REIT: [['5227', 'IGBREIT', 'IGB REIT']],
  'ACE Market': [['0463', 'ECKEM', 'Eckem Holdings']],
};

const flat = () =>
  Object.entries(STOCKS).flatMap(([sector, rows]) =>
    rows.map(([code, ticker, name]) => ({ code, ticker, name, sector })));

exports.flat = flat;
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sectors: Object.keys(STOCKS), stocks: flat() }),
});
