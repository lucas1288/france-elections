export interface TopCity {
  name: string
  inseeCode: string
  population: number
  lng: number
  lat: number
  zoom: number
}

// Source: INSEE recensement de la population, populations légales au 1er janvier 2023
// (publication décembre 2025 — https://www.insee.fr/fr/statistiques/8681011)
export const TOP_CITIES: TopCity[] = [
  { name: 'Paris',                      inseeCode: '75056', population: 2103778, lng:  2.3488, lat: 48.8534, zoom: 11 },
  { name: 'Marseille',                  inseeCode: '13055', population:  886040, lng:  5.3698, lat: 43.2965, zoom: 11 },
  { name: 'Lyon',                       inseeCode: '69123', population:  519127, lng:  4.8344, lat: 45.7578, zoom: 12 },
  { name: 'Toulouse',                   inseeCode: '31555', population:  514819, lng:  1.4442, lat: 43.6047, zoom: 12 },
  { name: 'Nice',                       inseeCode: '06088', population:  357737, lng:  7.2661, lat: 43.7102, zoom: 12 },
  { name: 'Nantes',                     inseeCode: '44109', population:  327734, lng: -1.5534, lat: 47.2184, zoom: 12 },
  { name: 'Montpellier',                inseeCode: '34172', population:  310240, lng:  3.8767, lat: 43.6119, zoom: 12 },
  { name: 'Strasbourg',                 inseeCode: '67482', population:  293771, lng:  7.7521, lat: 48.5734, zoom: 12 },
  { name: 'Bordeaux',                   inseeCode: '33063', population:  267991, lng: -0.5792, lat: 44.8378, zoom: 12 },
  { name: 'Lille',                      inseeCode: '59350', population:  238246, lng:  3.0573, lat: 50.6292, zoom: 12 },
  { name: 'Rennes',                     inseeCode: '35238', population:  230890, lng: -1.6778, lat: 48.1173, zoom: 12 },
  { name: 'Toulon',                     inseeCode: '83137', population:  179116, lng:  5.9281, lat: 43.1242, zoom: 12 },
  { name: 'Reims',                      inseeCode: '51454', population:  177674, lng:  4.0317, lat: 49.2583, zoom: 12 },
  { name: 'Saint-Etienne',              inseeCode: '42218', population:  173136, lng:  4.3922, lat: 45.4397, zoom: 12 },
  { name: 'Le Havre',                   inseeCode: '76351', population:  166687, lng:  0.1077, lat: 49.4938, zoom: 12 },
  { name: 'Villeurbanne',               inseeCode: '69266', population:  163684, lng:  4.8908, lat: 45.7676, zoom: 13 },
  { name: 'Dijon',                      inseeCode: '21231', population:  161830, lng:  5.0415, lat: 47.3220, zoom: 12 },
  { name: 'Angers',                     inseeCode: '49007', population:  159022, lng: -0.5518, lat: 47.4784, zoom: 12 },
  { name: 'Grenoble',                   inseeCode: '38185', population:  156140, lng:  5.7243, lat: 45.1885, zoom: 12 },
  { name: 'Saint-Denis (La Réunion)',   inseeCode: '97411', population:  155634, lng: 55.4578, lat: -20.8789, zoom: 12 },
  { name: 'Nîmes',                      inseeCode: '30189', population:  151839, lng:  4.3601, lat: 43.8367, zoom: 12 },
  { name: 'Aix-en-Provence',            inseeCode: '13001', population:  149695, lng:  5.4474, lat: 43.5297, zoom: 12 },
  { name: 'Saint-Denis',                inseeCode: '93066', population:  149077, lng:  2.3577, lat: 48.9360, zoom: 13 },
  { name: 'Clermont-Ferrand',           inseeCode: '63113', population:  146351, lng:  3.0863, lat: 45.7794, zoom: 12 },
  { name: 'Le Mans',                    inseeCode: '72181', population:  146249, lng:  0.1966, lat: 48.0061, zoom: 12 },
  { name: 'Brest',                      inseeCode: '29019', population:  142346, lng: -4.4861, lat: 48.3905, zoom: 12 },
  { name: 'Tours',                      inseeCode: '37261', population:  139259, lng:  0.6833, lat: 47.3941, zoom: 12 },
  { name: 'Amiens',                     inseeCode: '80021', population:  136449, lng:  2.2957, lat: 49.8941, zoom: 12 },
  { name: 'Annecy',                     inseeCode: '74010', population:  132117, lng:  6.1294, lat: 45.8992, zoom: 12 },
  { name: 'Limoges',                    inseeCode: '87085', population:  129937, lng:  1.2611, lat: 45.8336, zoom: 12 },
]

export const TOP_CITY_CODES = TOP_CITIES.map((c) => c.inseeCode)
