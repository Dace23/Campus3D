import * as THREE from 'three'
import { isFloorVisibleInView } from './room-utils.js'
import {
  cloneMaterial,
  createFloorSliceMaterial,
  disposeMaterial,
} from './material-utils.js'

export function buildFloorSlicesForFloor({
  floor,
  modelMeshes,
  floorSliceGroup,
  floorSliceObjects,
  clickableObjects,
  originalMaterials,
}) {
  const floorBaseY = getFloorBaseY(floor, modelMeshes)
  clearFloorSlices({
    floorSliceGroup,
    floorSliceObjects,
    clickableObjects,
    originalMaterials,
  })

  modelMeshes.forEach((object) => {
    if (!object.isMesh || !object.userData.roomId) return
    if (!isFloorVisibleInView(object.userData.floor, floor)) return

    // Turn each room mesh into a flat footprint so the same room data can be
    // clicked and highlighted in a 2D floor-plan view.
    const sliceGeometry = createBottomFaceGeometry(object, floorBaseY)
    if (!sliceGeometry) return

    const slice = new THREE.Mesh(sliceGeometry, createFloorSliceMaterial(object))
    slice.name = `2D slice ${object.name || object.uuid}`
    slice.userData.roomId = object.userData.roomId
    slice.userData.roomType = object.userData.roomType
    slice.userData.tags = object.userData.tags
    slice.userData.floor = object.userData.floor
    slice.userData.isMainStairs = object.userData.isMainStairs
    slice.userData.footprintArea = getFootprintArea(sliceGeometry)
    slice.visible = false

    floorSliceGroup.add(slice)
    floorSliceObjects.push(slice)
    clickableObjects.push(slice)
    originalMaterials.set(slice.uuid, cloneMaterial(slice.material))
  })

  prioritizeFloorSliceDisplay(floorSliceObjects)
}

export function clearFloorSlices({
  floorSliceGroup,
  floorSliceObjects,
  clickableObjects,
  originalMaterials,
}) {
  floorSliceObjects.forEach((object) => {
    const clickableIndex = clickableObjects.indexOf(object)
    if (clickableIndex >= 0) clickableObjects.splice(clickableIndex, 1)
    object.geometry.dispose()
    disposeMaterial(object.material)
    originalMaterials.delete(object.uuid)
  })
  floorSliceGroup.clear()
  floorSliceObjects.length = 0
  floorSliceGroup.visible = false
}

function getFloorBaseY(floor, modelMeshes) {
  const box = new THREE.Box3()
  modelMeshes.forEach((object) => {
    if (!object.isMesh || object.userData.floor !== floor) return
    box.expandByObject(object)
  })
  if (!box.isEmpty()) return box.min.y

  const fallbackBox = new THREE.Box3()
  modelMeshes.forEach((object) => {
    if (!object.isMesh || !isFloorVisibleInView(object.userData.floor, floor)) return
    fallbackBox.expandByObject(object)
  })
  return fallbackBox.isEmpty() ? 0 : fallbackBox.min.y
}

function prioritizeFloorSliceDisplay(floorSliceObjects) {
  const orderedSlices = [...floorSliceObjects].sort((first, second) => (
    (second.userData.footprintArea ?? 0) - (first.userData.footprintArea ?? 0)
  ))
  const maxLift = 0.08
  const denominator = Math.max(orderedSlices.length - 1, 1)

  // Keep smaller overlapping footprints just above larger ones in 2D mode.
  orderedSlices.forEach((slice, index) => {
    const lift = (index / denominator) * maxLift
    slice.geometry.translate(0, lift, 0)
    slice.renderOrder = index
  })
}

function createBottomFaceGeometry(object, floorBaseY = null) {
  const geometry = object.geometry
  if (!geometry?.attributes?.position) return null

  // Work in world space so exported Blender transforms do not affect the
  // bottom-face test.
  object.updateWorldMatrix(true, false)
  const source = geometry.index ? geometry.toNonIndexed() : geometry
  const positions = source.attributes.position
  const uvs = source.attributes.uv
  const worldNormalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld)
  const normal = new THREE.Vector3()
  const localPosition = new THREE.Vector3()
  const worldPosition = new THREE.Vector3()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const vertices = []
  const uvValues = []
  let minY = Infinity
  let maxY = -Infinity

  for (let index = 0; index < positions.count; index += 1) {
    localPosition.fromBufferAttribute(positions, index)
    worldPosition.copy(localPosition).applyMatrix4(object.matrixWorld)
    minY = Math.min(minY, worldPosition.y)
    maxY = Math.max(maxY, worldPosition.y)
  }

  if (!Number.isFinite(minY)) return null

  const referenceY = Number.isFinite(floorBaseY) ? floorBaseY : minY
  const bottomTolerance = Math.max((maxY - minY) * 0.015, 0.025)

  // Keep only horizontal triangles that sit on the bottom of the mesh. Those
  // triangles become the room footprint used in the 2D floor plan.
  for (let index = 0; index < positions.count; index += 3) {
    a.fromBufferAttribute(positions, index)
    b.fromBufferAttribute(positions, index + 1)
    c.fromBufferAttribute(positions, index + 2)
    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize()
    normal.applyMatrix3(worldNormalMatrix).normalize()

    const triangleWorldPositions = [a, b, c].map((position) => (
      position.clone().applyMatrix4(object.matrixWorld)
    ))
    const isFloorFace = triangleWorldPositions.every((position) => (
      Math.abs(position.y - referenceY) <= bottomTolerance
    ))
    const isHorizontalFace = Math.abs(normal.y) >= 0.72

    if (!isFloorFace || !isHorizontalFace) continue

    for (let offset = 0; offset < 3; offset += 1) {
      worldPosition.copy(triangleWorldPositions[offset])
      vertices.push(worldPosition.x, worldPosition.y + 0.01, worldPosition.z)
      if (uvs) uvValues.push(uvs.getX(index + offset), uvs.getY(index + offset))
    }
  }

  const floorGeometry = vertices.length > 0
    ? createGeometryFromBottomTriangles(vertices, uvValues)
    : createFootprintFallbackGeometry(object, referenceY)

  if (source !== geometry) source.dispose()
  return floorGeometry
}

function createGeometryFromBottomTriangles(vertices, uvValues) {
  const floorGeometry = new THREE.BufferGeometry()
  floorGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  if (uvValues.length > 0) {
    floorGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvValues, 2))
  }
  floorGeometry.computeVertexNormals()
  return floorGeometry
}

function getFootprintArea(geometry) {
  geometry.computeBoundingBox()
  const size = geometry.boundingBox.getSize(new THREE.Vector3())
  return Math.max(size.x, 0.001) * Math.max(size.z, 0.001)
}

function createFootprintFallbackGeometry(object, referenceY) {
  // Some meshes may not expose clean bottom triangles, so a bounding-box
  // rectangle gives the room a usable footprint instead of dropping it.
  const box = new THREE.Box3().setFromObject(object)
  const y = referenceY + 0.01
  const vertices = [
    box.min.x, y, box.min.z,
    box.max.x, y, box.min.z,
    box.max.x, y, box.max.z,
    box.min.x, y, box.min.z,
    box.max.x, y, box.max.z,
    box.min.x, y, box.max.z,
  ]
  const uvs = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]
  return createGeometryFromBottomTriangles(vertices, uvs)
}
