import * as THREE from 'three'

export function cloneMaterial(material) {
  return Array.isArray(material)
    ? material.map((item) => item.clone())
    : material.clone()
}

export function disposeMaterial(material) {
  const materials = Array.isArray(material) ? material : [material]
  materials.forEach((item) => item?.dispose?.())
}

export function updateMaterials(material, updater) {
  const materials = Array.isArray(material) ? material : [material]
  materials.forEach(updater)
}

export function setMaterialOpacity(material, opacity) {
  updateMaterials(material, (item) => {
    item.transparent = opacity < 1
    item.opacity = opacity
    item.depthWrite = opacity >= 1
    item.needsUpdate = true
  })
}

export function createFloorSliceMaterial(object) {
  const shade = getObjectGrayShade(object)
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(shade, shade, shade),
    side: THREE.DoubleSide,
  })
}

export function cloneTexturedHighlightMaterial(object, color, originalMaterials) {
  // Start from the saved material whenever possible so repeated highlighting
  // does not permanently tint or fade the original model material.
  const originalMaterial = originalMaterials.get(object.uuid)
  const material = originalMaterial ? cloneMaterial(originalMaterial) : cloneMaterial(object.material)
  updateMaterials(material, (item) => {
    item.side = THREE.DoubleSide
    item.transparent = false
    item.opacity = 1
    item.depthWrite = true
    item.color?.lerp(new THREE.Color(color), 0.45)
    if ('emissive' in item) {
      item.emissive = new THREE.Color(color)
      item.emissiveIntensity = 0.18
    }
    item.needsUpdate = true
  })
  return material
}

function getObjectGrayShade(object) {
  const key = object.userData.roomId || object.name || object.uuid
  let hash = 0

  // Derive a stable gray from the room key so floor slices are visually
  // distinct without needing extra color data in rooms.json.
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0
  }
  return 0.38 + (Math.abs(hash) % 52) / 100
}
