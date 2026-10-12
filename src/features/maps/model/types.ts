export interface MapStation { id: string; name: string }
/** A site map known to the system. Stations belong to the map, so a fleet can only group materials at its own map's stations. */
export interface FleetMap { id: string; name: string; version: number; tag: string; /** Preview image URL. */ thumbnail: string; stations: MapStation[] }
