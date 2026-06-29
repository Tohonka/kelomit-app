import type {MapStyleElement} from 'react-native-maps';

/**
 * Flatter, less-busy Google map: drops business POI pins/labels and transit,
 * keeps roads, road labels and base geography. A `customMapStyle` JSON the
 * Google provider applies on Android. Expand from snazzymaps.com if you want
 * a fuller theme later.
 */
export const flatMapStyle: MapStyleElement[] = [
  {featureType: 'poi', stylers: [{visibility: 'off'}]},
  {featureType: 'transit', stylers: [{visibility: 'off'}]},
];
