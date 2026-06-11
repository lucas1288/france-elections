export interface TopCity {
  name: string
  inseeCode: string
  population: number
  lng: number
  lat: number
  zoom: number
}

export const TOP_CITIES: TopCity[] = [
  { name: 'Paris',                inseeCode: '75056', population: 2102650, lng:  2.3488, lat: 48.8534, zoom: 11 },
  { name: 'Marseille',            inseeCode: '13055', population:  870018, lng:  5.3698, lat: 43.2965, zoom: 11 },
  { name: 'Lyon',                 inseeCode: '69123', population:  522228, lng:  4.8344, lat: 45.7578, zoom: 12 },
  { name: 'Toulouse',             inseeCode: '31555', population:  479553, lng:  1.4442, lat: 43.6047, zoom: 12 },
  { name: 'Nice',                 inseeCode: '06088', population:  342522, lng:  7.2661, lat: 43.7102, zoom: 12 },
  { name: 'Nantes',               inseeCode: '44109', population:  320732, lng: -1.5534, lat: 47.2184, zoom: 12 },
  { name: 'Montpellier',          inseeCode: '34172', population:  285121, lng:  3.8767, lat: 43.6119, zoom: 12 },
  { name: 'Strasbourg',           inseeCode: '67482', population:  284677, lng:  7.7521, lat: 48.5734, zoom: 12 },
  { name: 'Bordeaux',             inseeCode: '33063', population:  257068, lng: -0.5792, lat: 44.8378, zoom: 12 },
  { name: 'Lille',                inseeCode: '59350', population:  233098, lng:  3.0573, lat: 50.6292, zoom: 12 },
  { name: 'Rennes',               inseeCode: '35238', population:  220488, lng: -1.6778, lat: 48.1173, zoom: 12 },
  { name: 'Reims',                inseeCode: '51454', population:  182460, lng:  4.0317, lat: 49.2583, zoom: 12 },
  { name: 'Toulon',               inseeCode: '83137', population:  176198, lng:  5.9281, lat: 43.1242, zoom: 12 },
  { name: 'Saint-Etienne',        inseeCode: '42218', population:  171924, lng:  4.3922, lat: 45.4397, zoom: 12 },
  { name: 'Le Havre',             inseeCode: '76351', population:  170147, lng:  0.1077, lat: 49.4938, zoom: 12 },
  { name: 'Grenoble',             inseeCode: '38185', population:  158454, lng:  5.7243, lat: 45.1885, zoom: 12 },
  { name: 'Dijon',                inseeCode: '21231', population:  156920, lng:  5.0415, lat: 47.3220, zoom: 12 },
  { name: 'Angers',               inseeCode: '49007', population:  155642, lng: -0.5518, lat: 47.4784, zoom: 12 },
  { name: 'Nîmes',                inseeCode: '30189', population:  151001, lng:  4.3601, lat: 43.8367, zoom: 12 },
  { name: 'Villeurbanne',         inseeCode: '69266', population:  149141, lng:  4.8908, lat: 45.7676, zoom: 13 },
  { name: 'Le Mans',              inseeCode: '72181', population:  143247, lng:  0.1966, lat: 48.0061, zoom: 12 },
  { name: 'Aix-en-Provence',      inseeCode: '13001', population:  143097, lng:  5.4474, lat: 43.5297, zoom: 12 },
  { name: 'Clermont-Ferrand',     inseeCode: '63113', population:  141365, lng:  3.0863, lat: 45.7794, zoom: 12 },
  { name: 'Brest',                inseeCode: '29019', population:  139676, lng: -4.4861, lat: 48.3905, zoom: 12 },
  { name: 'Tours',                inseeCode: '37261', population:  136565, lng:  0.6833, lat: 47.3941, zoom: 12 },
  { name: 'Amiens',               inseeCode: '80021', population:  133248, lng:  2.2957, lat: 49.8941, zoom: 12 },
  { name: 'Limoges',              inseeCode: '87085', population:  129724, lng:  1.2611, lat: 45.8336, zoom: 12 },
  { name: 'Annecy',               inseeCode: '74010', population:  126924, lng:  6.1294, lat: 45.8992, zoom: 12 },
  { name: 'Perpignan',            inseeCode: '66136', population:  121875, lng:  2.8953, lat: 42.6887, zoom: 12 },
  { name: 'Boulogne-Billancourt', inseeCode: '92012', population:  120554, lng:  2.2399, lat: 48.8352, zoom: 13 },
]

export const TOP_CITY_CODES = TOP_CITIES.map((c) => c.inseeCode)
