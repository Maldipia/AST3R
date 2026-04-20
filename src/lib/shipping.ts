// src/lib/shipping.ts
// Centralized shipping config — edit rates here

export const REGIONS = [
  {
    id:       'metro_manila',
    label:    'Metro Manila (NCR)',
    fee:      100,
    days:     '3–5 business days',
    couriers: ['J&T Express', 'LBC', 'Ninja Van', 'GrabExpress'],
  },
  {
    id:       'luzon',
    label:    'Luzon (Outside NCR)',
    fee:      150,
    days:     '7–10 working days',
    couriers: ['J&T Express', 'LBC', 'Ninja Van', 'JRS Express'],
  },
  {
    id:       'visayas',
    label:    'Visayas',
    fee:      200,
    days:     '7–10 working days',
    couriers: ['J&T Express', 'LBC', 'JRS Express'],
  },
  {
    id:       'mindanao',
    label:    'Mindanao',
    fee:      250,
    days:     '7–10 working days',
    couriers: ['J&T Express', 'LBC', 'JRS Express'],
  },
  {
    id:       'international',
    label:    'International / Worldwide',
    fee:      800,
    days:     '7–21 business days',
    couriers: ['LBC International', 'DHL', 'FedEx'],
  },
];

export type RegionId = 'metro_manila' | 'luzon' | 'visayas' | 'mindanao' | 'international';

export function getRegion(id: RegionId) {
  return REGIONS.find(r => r.id === id);
}

export function getShippingFee(regionId: RegionId): number {
  return getRegion(regionId)?.fee ?? 0;
}

// Philippine provinces grouped by region (for auto-detect from address)
export const PROVINCE_REGION_MAP: Record<string, RegionId> = {
  // Metro Manila
  'manila': 'metro_manila', 'quezon city': 'metro_manila', 'makati': 'metro_manila',
  'pasig': 'metro_manila', 'taguig': 'metro_manila', 'marikina': 'metro_manila',
  'pasay': 'metro_manila', 'caloocan': 'metro_manila', 'malabon': 'metro_manila',
  'navotas': 'metro_manila', 'valenzuela': 'metro_manila', 'parañaque': 'metro_manila',
  'paranaque': 'metro_manila', 'las piñas': 'metro_manila', 'las pinas': 'metro_manila',
  'muntinlupa': 'metro_manila', 'san juan': 'metro_manila', 'mandaluyong': 'metro_manila',
  'pateros': 'metro_manila', 'ncr': 'metro_manila',

  // Luzon
  'cavite': 'luzon', 'tagaytay': 'luzon', 'laguna': 'luzon', 'batangas': 'luzon',
  'rizal': 'luzon', 'bulacan': 'luzon', 'pampanga': 'luzon', 'tarlac': 'luzon',
  'nueva ecija': 'luzon', 'pangasinan': 'luzon', 'la union': 'luzon',
  'ilocos': 'luzon', 'bataan': 'luzon', 'zambales': 'luzon', 'aurora': 'luzon',
  'quezon': 'luzon', 'camarines': 'luzon', 'albay': 'luzon', 'sorsogon': 'luzon',
  'masbate': 'luzon', 'romblon': 'luzon', 'marinduque': 'luzon', 'palawan': 'luzon',
  'mindoro': 'luzon', 'batanes': 'luzon', 'cagayan': 'luzon', 'isabela': 'luzon',
  'ifugao': 'luzon', 'benguet': 'luzon', 'baguio': 'luzon', 'kalinga': 'luzon',
  'mountain province': 'luzon', 'apayao': 'luzon', 'abra': 'luzon',

  // Visayas
  'cebu': 'visayas', 'bohol': 'visayas', 'negros': 'visayas', 'iloilo': 'visayas',
  'capiz': 'visayas', 'aklan': 'visayas', 'antique': 'visayas', 'guimaras': 'visayas',
  'leyte': 'visayas', 'samar': 'visayas', 'biliran': 'visayas', 'boracay': 'visayas',
  'siquijor': 'visayas',

  // Mindanao
  'davao': 'mindanao', 'zamboanga': 'mindanao', 'cagayan de oro': 'mindanao',
  'cotabato': 'mindanao', 'bukidnon': 'mindanao', 'misamis': 'mindanao',
  'lanao': 'mindanao', 'maguindanao': 'mindanao', 'sultan kudarat': 'mindanao',
  'south cotabato': 'mindanao', 'sarangani': 'mindanao', 'compostela': 'mindanao',
  'agusan': 'mindanao', 'surigao': 'mindanao', 'camiguin': 'mindanao',
  'basilan': 'mindanao', 'sulu': 'mindanao', 'tawi-tawi': 'mindanao',
  'general santos': 'mindanao', 'gensan': 'mindanao',
};

export function guessRegionFromAddress(address: string): RegionId | null {
  const lower = address.toLowerCase();
  for (const [keyword, region] of Object.entries(PROVINCE_REGION_MAP)) {
    if (lower.includes(keyword)) return region;
  }
  return null;
}
