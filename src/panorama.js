import * as THREE from 'three'
import { PANORAMA_HEIGHT, PANORAMA_RADIUS } from './config.js'

export function createPanoramaMesh(imageUrl, onLoad = () => {}, onError = () => {}) {
  let mesh = null

  // The panorama is wrapped onto the inside of a cylinder, so the user can
  // rotate around from the center as if standing inside the photographed room.
  const texture = new THREE.TextureLoader().load(
    imageUrl,
    () => {
      if (mesh) mesh.userData.isLoaded = true
      onLoad()
    },
    undefined,
    () => {
      if (mesh) mesh.userData.isLoaded = false
      onError()
    },
  )
  texture.colorSpace = THREE.SRGBColorSpace
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.wrapS = THREE.RepeatWrapping
  texture.repeat.x = -1
  texture.offset.x = 1

  const radius = PANORAMA_RADIUS || 40
  const defaultHeight = PANORAMA_HEIGHT || 90
  const geometry = new THREE.CylinderGeometry(radius, radius, defaultHeight, 96, 1, true)
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide })
  mesh = new THREE.Mesh(geometry, material)
  mesh.visible = false
  mesh.userData.isLoaded = false

  try {
    // Inspect the image dimensions and resize the cylinder height so different
    // panorama aspect ratios do not look overly stretched.
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const aspect = img.width && img.height ? img.width / img.height : null
      if (aspect && aspect > 0) {
        const circumference = Math.max(0.0001, 2 * Math.PI * radius)
        const height = Math.max(12, Math.min(circumference / aspect, 512))
        try {
          mesh.geometry.dispose()
        } catch (error) {
          // Keep the existing geometry if disposal is unavailable.
        }
        mesh.geometry = new THREE.CylinderGeometry(radius, radius, height, 96, 1, true)
      }
    }
    img.onerror = () => {}
    img.src = imageUrl
  } catch (error) {
    // Keep the default geometry on image inspection errors.
  }

  return mesh
}
