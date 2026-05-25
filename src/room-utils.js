import { ALL_LEVELS_FLOOR, panoramaImagesByKey, selectableFloorNames } from './config.js'

export function getObjectNameCandidates(objectName) {
  const trimmed = objectName.trim()

  // Blender object names and JSON room names are not always formatted the same
  // way, so try both spaced and underscore versions when matching meshes.
  return Array.from(
    new Set([
      objectName,
      trimmed,
      trimmed.replace(/\s+/g, '_'),
      objectName.replace(/\s+/g, '_'),
    ]),
  )
}

export function getFloorOptions(roomList) {
  const availableFloors = new Set(roomList.map((room) => room.floor).filter(Boolean))
  return selectableFloorNames.filter((floor) => availableFloors.has(floor))
}

export function getPanoramaUrlForRoom(room) {
  if (!room) return null

  // A panorama can be linked by object name, room id, or display name; all are
  // normalized so minor punctuation differences do not break the lookup.
  const keys = [room.objectName, room.id, room.name].map(normalizePanoramaKey)
  return keys.map((key) => panoramaImagesByKey.get(key)).find(Boolean) || null
}

export function isFloorVisibleInView(objectFloor, viewFloor) {
  return objectFloor === viewFloor || objectFloor === ALL_LEVELS_FLOOR
}

function normalizePanoramaKey(value) {
  return String(value || '').toLowerCase().replace(/[\s_\-\(\)\[\]]+/g, '')
}
