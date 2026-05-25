import './style.css'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import rooms from './rooms.json'
import {
  BUILDING_MAX_POLAR_ANGLE,
  DEFAULT_CAMERA_FOV,
  MODEL_URL,
  PANORAMA_CAMERA_RADIUS,
  PANORAMA_FOV,
  PANORAMA_ROTATE_SPEED,
  filterGroups,
} from './config.js'
import { renderAppShell } from './app-template.js'
import {
  renderPanoramaAction,
  renderRoomDetails,
  renderResultItem,
} from './details-renderer.js'
import { matchesRoomFilters } from './filter-utils.js'
import {
  buildFloorSlicesForFloor as buildFloorSlices,
  clearFloorSlices as clearFloorSliceMeshes,
} from './floor-slices.js'
import {
  cloneMaterial,
  cloneTexturedHighlightMaterial,
  createFloorSliceMaterial,
  setMaterialOpacity,
  updateMaterials,
} from './material-utils.js'
import { createPanoramaMesh } from './panorama.js'
import {
  getFloorOptions,
  getObjectNameCandidates,
  getPanoramaUrlForRoom,
  isFloorVisibleInView,
} from './room-utils.js'

const roomsByObjectName = new Map(
  rooms.flatMap((room) => getObjectNameCandidates(room.objectName).map((name) => [name, room])),
)
const floorOptions = getFloorOptions(rooms)

const app = document.querySelector('#app')

app.innerHTML = renderAppShell({
  panoramaFov: PANORAMA_FOV,
  panoramaDistance: PANORAMA_CAMERA_RADIUS,
  panoramaRotateSpeed: PANORAMA_ROTATE_SPEED,
})

const canvas = document.querySelector('#scene')
const loadingOverlayEl = document.querySelector('#loading-overlay')
const filterListEl = document.querySelector('#filter-list')
const floorListEl = document.querySelector('#floor-list')
const resultListEl = document.querySelector('#result-list')
const resultsSummaryEl = document.querySelector('#results-summary')
const detailsEl = document.querySelector('#details')
const mapSelectionEl = document.querySelector('#map-selection')
const searchInput = document.querySelector('#search-input')
let panoramaButton = null
const panoramaCloseButton = document.querySelector('#panorama-close-button')
const panoramaSettingsButton = document.querySelector('#panorama-settings-button')
const panoramaSettingsPanel = document.querySelector('#panorama-settings-panel')
const panoramaFovInput = document.querySelector('#panorama-fov-input')
const panoramaDistanceInput = document.querySelector('#panorama-distance-input')
const panoramaSpeedInput = document.querySelector('#panorama-speed-input')
const panoramaFovValue = document.querySelector('#panorama-fov-value')
const panoramaDistanceValue = document.querySelector('#panorama-distance-value')
const panoramaSpeedValue = document.querySelector('#panorama-speed-value')
const panoramaResetButton = document.querySelector('#panorama-reset-button')
const layoutEl = document.querySelector('.layout')
const filtersMenuToggle = document.querySelector('#filters-menu-toggle')
const filtersMenu = document.querySelector('#filters-menu')
const resetFiltersButton = document.querySelector('#reset-filters-button')
const highlightToggle = document.querySelector('#highlight-toggle')
const highlightOptions = document.querySelector('#highlight-options')
const viewsToggle = document.querySelector('#views-toggle')
const viewOptions = document.querySelector('#view-options')
const viewButtons = document.querySelectorAll('[data-view]')
const highlightButtons = document.querySelectorAll('[data-highlight]')
const floorHighlightButtons = document.querySelectorAll('[data-floor-highlight]')

loadingOverlayEl.setAttribute('role', 'status')
loadingOverlayEl.setAttribute('aria-live', 'polite')
searchInput.setAttribute('aria-label', 'Search rooms, services, and tags')
searchInput.setAttribute('aria-controls', 'result-list')
detailsEl.setAttribute('aria-live', 'polite')
panoramaSettingsButton.setAttribute('aria-expanded', 'false')
panoramaSettingsButton.setAttribute('aria-controls', 'panorama-settings-panel')

function updatePanoramaButton(room = null) {
  panoramaButton = document.querySelector('#panorama-button')
  if (!panoramaButton) return

  const url = room ? getPanoramaUrlForRoom(room) : null
  if (url) {
    panoramaButton.hidden = false
    panoramaButton.disabled = false
    panoramaButton.textContent = inPanorama ? 'Close panorama view' : 'See panorama view'
    panoramaButton.dataset.panoramaUrl = url
    panoramaButton.setAttribute('aria-pressed', String(inPanorama))
  } else {
    panoramaButton.hidden = true
    panoramaButton.disabled = true
    delete panoramaButton.dataset.panoramaUrl
  }
}

function toggleFiltersMenu() {
  const isOpen = filtersMenu.hidden
  filtersMenu.hidden = !isOpen
  filtersMenuToggle.setAttribute('aria-expanded', String(isOpen))
  filtersMenuToggle.textContent = isOpen ? 'Hide filters' : 'Filters'

  scheduleSceneLayoutUpdate()
}

function toggleScenePanel(toggleButton, panel, closedLabel, openLabel) {
  const isOpen = panel.hidden
  panel.hidden = !isOpen
  toggleButton.setAttribute('aria-expanded', String(isOpen))
  toggleButton.textContent = isOpen ? openLabel : closedLabel
}

function updateSceneLayout() {
  resizeRenderer()

  if (inPanorama) return
  if (selectedFloor) {
    fitCameraToFloor(selectedFloor)
  } else if (activeFixedView) {
    setFixedView(activeFixedView)
  } else if (buildingRoot) {
    fitCameraToScene()
  }
}

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xeaf0f7)

const perspectiveCamera = new THREE.PerspectiveCamera(DEFAULT_CAMERA_FOV, 1, 0.1, 200)
const orthographicCamera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200)
let camera = perspectiveCamera
camera.position.set(7, 6, 8)
orthographicCamera.position.copy(camera.position)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = false
renderer.localClippingEnabled = true

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 0, 0)
controls.enableDamping = true
controls.maxPolarAngle = BUILDING_MAX_POLAR_ANGLE
const defaultMouseButtons = { ...controls.mouseButtons }
const defaultTouches = { ...controls.touches }

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

// These collections keep the Three.js scene connected to the room data.
// The app uses them for picking, filtering, restoring materials, and 2D floor views.
const clickableObjects = []
const modelMeshes = []
const roomObjects = new Map()
const originalMaterials = new Map()
const floorSliceGroup = new THREE.Group()
const floorSliceObjects = []
const floorHighlightGroup = new THREE.Group()
const floorHighlightTypes = new Set()

let selectedRoomId = null
let selectedFloor = null
let activeTypeFilters = new Set()
let activeOptionFilters = new Map()
let currentResultMatches = rooms
let activeCategoryHighlights = new Set()
let buildingRoot = null
let panoramaMesh = null
let inPanorama = false
let panoramaSettingsOpen = false
const panoramaSettings = {
  fov: PANORAMA_FOV,
  distance: PANORAMA_CAMERA_RADIUS,
  rotateSpeed: PANORAMA_ROTATE_SPEED,
}
let defaultCameraPosition = null
let defaultControlsTarget = null
let sceneCenter = new THREE.Vector3()
let sceneSize = new THREE.Vector3(10, 10, 10)
let sceneDistance = 10
let sceneRadius = 5
let activeFixedView = null
let orthographicFrustumSize = 10
let resizeFrame = null
let layoutResizeObserver = null
let enhancedLightingEnabled = true
let ambientLight = null
let hemisphereLight = null
let sunLight = null

setupLights()
setupGround()
floorSliceGroup.name = '2D floor bottom-face slices'
floorSliceGroup.visible = false
scene.add(floorSliceGroup)
floorHighlightGroup.name = 'Floor highlight overlays'
floorHighlightGroup.visible = false
scene.add(floorHighlightGroup)
renderFilters()
renderFloorControls()
updateResults()
loadBuildingModel()

window.addEventListener('resize', handleWindowResize)
if ('ResizeObserver' in window) {
  layoutResizeObserver = new ResizeObserver(scheduleSceneLayoutUpdate)
  layoutResizeObserver.observe(canvas.parentElement)
}
renderer.domElement.addEventListener('pointerdown', handlePointerDown)
searchInput.addEventListener('input', updateResults)
panoramaCloseButton.addEventListener('click', togglePanorama)
panoramaSettingsButton.addEventListener('click', togglePanoramaSettings)
panoramaSettingsPanel.addEventListener('submit', (event) => event.preventDefault())
filtersMenuToggle.addEventListener('click', toggleFiltersMenu)
resetFiltersButton.addEventListener('click', resetFilters)
highlightToggle.addEventListener('click', () => {
  toggleScenePanel(highlightToggle, highlightOptions, 'Highlight', 'Hide highlight')
})
viewsToggle.addEventListener('click', () => {
  toggleScenePanel(viewsToggle, viewOptions, 'Views', 'Hide views')
})
panoramaFovInput.addEventListener('input', handlePanoramaSettingsInput)
panoramaDistanceInput.addEventListener('input', handlePanoramaSettingsInput)
panoramaSpeedInput.addEventListener('input', handlePanoramaSettingsInput)
panoramaResetButton.addEventListener('click', resetPanoramaSettings)
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !inPanorama) return
  if (panoramaSettingsOpen) {
    setPanoramaSettingsOpen(false)
    return
  }
  togglePanorama()
})
detailsEl.addEventListener('click', (event) => {
  if (event.target.closest('a, button')) return
  if (selectedRoomId) clearSelection()
})
mapSelectionEl.addEventListener('click', (event) => {
  if (event.target.closest('#panorama-button')) {
    togglePanorama()
    return
  }

  if (event.target.closest('a')) return
  if (selectedRoomId) clearSelection()
})
viewButtons.forEach((button) => {
  button.addEventListener('click', () => setFixedView(button.dataset.view))
})
highlightButtons.forEach((button) => {
  button.addEventListener('click', () => toggleCategoryHighlight(button.dataset.highlight))
})
floorHighlightButtons.forEach((button) => {
  button.addEventListener('click', () => toggleFloorHighlight(button.dataset.floorHighlight))
})

resizeRenderer()
animate()

function setupLights() {
  ambientLight = new THREE.AmbientLight(0xffffff, 1.9)
  scene.add(ambientLight)

  hemisphereLight = new THREE.HemisphereLight(0xf9fbff, 0xd7dee8, 1.35)
  scene.add(hemisphereLight)

  sunLight = new THREE.DirectionalLight(0xffffff, 0.65)
  sunLight.position.set(20, 28, 18)
  sunLight.castShadow = false
  sunLight.shadow.mapSize.set(2048, 2048)
  sunLight.shadow.camera.near = 0.5
  sunLight.shadow.camera.far = 180
  sunLight.shadow.camera.left = -70
  sunLight.shadow.camera.right = 70
  sunLight.shadow.camera.top = 70
  sunLight.shadow.camera.bottom = -70
  scene.add(sunLight)

  applyLightingMode()
}

function applyLightingMode() {
  // Bright, shadowed lighting looks best in the full 3D view, but flatter
  // lighting keeps selected rooms and 2D floor slices easier to read.
  const useEnhancedLighting = enhancedLightingEnabled && !selectedRoomId && !selectedFloor

  renderer.shadowMap.enabled = useEnhancedLighting
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  if (ambientLight) ambientLight.intensity = useEnhancedLighting ? 0.75 : 1.9
  if (hemisphereLight) hemisphereLight.intensity = useEnhancedLighting ? 0.9 : 1.35
  if (sunLight) {
    sunLight.intensity = useEnhancedLighting ? 2.6 : 0.65
    sunLight.castShadow = useEnhancedLighting
  }

  modelMeshes.forEach((object) => {
    const isGround = object.name === 'Ground' || object.userData.roomType === 'Building base'
    object.castShadow = useEnhancedLighting && !isGround
    object.receiveShadow = useEnhancedLighting
  })
}

function setupGround() {
}

function loadBuildingModel() {
  const loader = new GLTFLoader()

  loader.load(
    MODEL_URL,
    (gltf) => {
      buildingRoot = gltf.scene
      buildingRoot.name = 'University building'

      // First register every mesh so global operations, such as lighting and
      // floor slicing, can work even before room metadata is attached.
      buildingRoot.traverse((object) => {
        if (!object.isMesh) return

        object.castShadow = false
        object.receiveShadow = false
        registerModelMesh(object)
      })
      applyLightingMode()

      // Room meshes are matched by their Blender object names. Those matches
      // make rooms clickable and allow the UI to highlight/filter the model.
      buildingRoot.traverse((object) => {
        const room = roomsByObjectName.get(object.name)
        if (room) registerRoomObject(room, object)
      })

      scene.add(buildingRoot)
      buildingRoot.updateWorldMatrix(true, true)
      buildFloorHighlights()
      applyFloorVisibility()
      resizeRenderer()
      fitCameraToScene()
      applyHighlights()
      if (roomObjects.size === 0) {
        console.info('Model loaded. Name Blender objects like room_A_101 to make them clickable.')
      }
    },
    undefined,
    (error) => {
      console.error('Model load failed:', error)
      setLoadingText('Loading failed')
    },
  )
}

function registerRoomObject(room, object) {
  // Store room metadata on the mesh and all child meshes so raycast hits can
  // be resolved back to a room no matter which part of the object is clicked.
  object.userData.roomId = room.id
  object.userData.roomType = room.type
  object.userData.tags = room.tags
  object.userData.floor = room.floor
  object.userData.isMainStairs = isMainStairsName(room.objectName)
  roomObjects.set(room.id, object)

  object.traverse((child) => {
    child.userData.roomId = room.id
    child.userData.roomType = room.type
    child.userData.tags = room.tags
    child.userData.floor = room.floor
    child.userData.isMainStairs = object.userData.isMainStairs

    if (child.isMesh && !clickableObjects.includes(child)) {
      clickableObjects.push(child)
    }
  })
}

function registerModelMesh(object) {
  modelMeshes.push(object)
  const isGround = object.name === 'Ground' || object.userData.roomType === 'Building base'
  const useEnhancedLighting = enhancedLightingEnabled && !selectedRoomId
  object.castShadow = useEnhancedLighting && !isGround
  object.receiveShadow = useEnhancedLighting

  if (object.material) {
    // Keep a clean copy so highlights and opacity changes can be reset later.
    originalMaterials.set(object.uuid, cloneMaterial(object.material))
  }
}

function isMainStairsName(name) {
  return /^Main[_\s]stairs/i.test(name)
}

function renderFilters() {
  filterListEl.innerHTML = filterGroups
    .map(
      (group) => `
        <div class="filter-group">
          <label class="filter-parent">
            <input type="checkbox" data-filter-group="${group.id}" />
            <span>${group.label}</span>
          </label>
          ${
            group.options.length > 0
              ? `<div class="filter-options">
                  ${group.options
                    .map(
                      (option) => `
                        <label class="filter-option">
                          <input type="checkbox" data-filter-option="${option.id}" data-filter-option-group="${group.id}" />
                          <span>${option.label}</span>
                        </label>
                      `,
                    )
                    .join('')}
                </div>`
              : ''
          }
        </div>
      `,
    )
    .join('')

  filterListEl.querySelectorAll('[data-filter-group]').forEach((input) => {
    input.addEventListener('change', () => updateFilterState())
  })

  filterListEl.querySelectorAll('[data-filter-option]').forEach((input) => {
    input.addEventListener('change', () => {
      const parent = filterListEl.querySelector(`[data-filter-group="${input.dataset.filterOptionGroup}"]`)
      if (input.checked && parent) parent.checked = true
      updateFilterState()
    })
  })
}

function renderFloorControls() {
  floorListEl.innerHTML = `
    ${floorOptions
      .map(
        (floor) => `
          <button class="floor-button" type="button" data-floor-view="${floor}">
            ${getFloorButtonLabel(floor)}
          </button>
        `,
      )
      .join('')}
  `

  floorListEl.querySelectorAll('[data-floor-view]').forEach((button) => {
    button.addEventListener('click', () => selectFloorView(button.dataset.floorView))
  })
}

function getFloorButtonLabel(floor) {
  return floor.replace(/^Level\s+/i, '')
}

function selectFloorView(floor) {
  if (inPanorama) return

  // Selecting the active floor again returns to the full-building view.
  selectedFloor = floor === 'all' || selectedFloor === floor ? null : floor
  activeFixedView = null

  updateFloorButtons()
  applyFloorVisibility()

  if (selectedRoomId) {
    const selectedRoom = rooms.find((room) => room.id === selectedRoomId)
    if (selectedFloor && !isFloorVisibleInView(selectedRoom?.floor, selectedFloor)) clearSelection()
  }

  if (selectedFloor) {
    fitCameraToFloor(selectedFloor)
  } else {
    controls.enableRotate = true
    restoreBuildingControls()
    applyLightingMode()
    if (buildingRoot) fitCameraToScene()
  }

  applyHighlights()
}

function updateFloorButtons() {
  floorListEl.querySelectorAll('[data-floor-view]').forEach((button) => {
    const floor = button.dataset.floorView
    button.classList.toggle(
      'is-active',
      selectedFloor ? floor === selectedFloor : floor === 'all',
    )
  })
}

function applyFloorVisibility() {
  // The 2D floor view is built from generated bottom-face slices, while the
  // full 3D view shows the original model meshes.
  if (selectedFloor) {
    buildFloorSlicesForFloor(selectedFloor)
  } else {
    clearFloorSlices()
  }

  modelMeshes.forEach((object) => {
    object.visible = !selectedFloor
  })

  const showFloorPlan = Boolean(selectedFloor && !inPanorama)

  floorSliceGroup.visible = showFloorPlan
  floorSliceObjects.forEach((object) => {
    object.visible = showFloorPlan && isFloorVisibleInView(object.userData.floor, selectedFloor)
  })

  floorHighlightGroup.visible = floorHighlightTypes.size > 0 && !inPanorama
  floorHighlightGroup.children.forEach((floor) => {
    const matchesFloor = !selectedFloor || isFloorVisibleInView(floor.userData.floor, selectedFloor)
    floor.visible = !inPanorama && matchesFloor && floorHighlightTypes.has(floor.userData.highlightTag)
  })

  applyShadowVisibility()
}

function applyShadowVisibility() {
  if (selectedFloor) {
    renderer.shadowMap.enabled = false
    modelMeshes.forEach((object) => {
      object.castShadow = false
      object.receiveShadow = false
    })
    floorSliceObjects.forEach((object) => {
      object.castShadow = false
      object.receiveShadow = false
    })
    return
  }

  applyLightingMode()
}

function updateResults() {
  const query = searchInput.value.trim().toLowerCase()
  const tokens = query.split(/\s+/).filter(Boolean)

  // Each search word must appear somewhere in the room metadata, then the
  // checkbox filters are applied on top of that text search.
  const matches = rooms.filter((room) => {
    if (room.type !== 'Room') return false

    const haystack = `${room.id} ${room.name} ${room.objectName} ${room.type} ${room.floor} ${room.tags.join(' ')}`.toLowerCase()
    const matchesQuery = tokens.length === 0 || tokens.every((token) => haystack.includes(token))
    return matchesQuery && matchesRoomFilters(room, activeTypeFilters, activeOptionFilters)
  })

  currentResultMatches = matches
  renderResults(matches)
  applyHighlights(matches)
}

function updateFilterState() {
  activeTypeFilters = new Set(
    Array.from(filterListEl.querySelectorAll('[data-filter-group]:checked')).map(
      (input) => input.dataset.filterGroup,
    ),
  )
  activeOptionFilters = new Map()

  filterGroups.forEach((group) => {
    activeOptionFilters.set(
      group.id,
      new Set(
        Array.from(
          filterListEl.querySelectorAll(`[data-filter-option-group="${group.id}"]:checked`),
        ).map((input) => input.dataset.filterOption),
      ),
    )
  })

  updateResults()
}

function resetFilters() {
  filterListEl.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = false
  })
  updateFilterState()
}

function renderResults(matches) {
  if (matches.length === 0) {
    resultsSummaryEl.textContent = 'No matching rooms found.'
    resultListEl.innerHTML = '<p class="muted">No matching rooms yet.</p>'
    return
  }

  resultsSummaryEl.textContent = `${matches.length} ${matches.length === 1 ? 'room' : 'rooms'} found`
  resultListEl.innerHTML = matches.map(renderResultItem).join('')

  resultListEl.querySelectorAll('[data-room-id]').forEach((button) => {
    button.addEventListener('click', () => selectRoom(button.dataset.roomId))
  })
}

function handlePointerDown(event) {
  if (inPanorama) return

  // Convert the browser pointer position into normalized device coordinates
  // so Three.js can raycast from the camera into the scene.
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(pointer, camera)
  const hits = raycaster.intersectObjects(clickableObjects, true)
  const hit = getBestSelectableHit(hits)

  if (hit) selectRoom(hit.object.userData.roomId)
}

function getBestSelectableHit(hits) {
  const selectableHits = hits.filter((item) => isSelectableHit(item.object))
  if (!selectedFloor) return selectableHits[0]

  // In 2D floor mode, smaller slices should win clicks over larger background
  // spaces when their triangles overlap.
  return selectableHits.sort((first, second) => {
    const firstArea = first.object.userData.footprintArea ?? Infinity
    const secondArea = second.object.userData.footprintArea ?? Infinity
    return firstArea - secondArea
  })[0]
}

function isSelectableHit(object) {
  const roomId = object.userData.roomId
  if (!roomId || !isObjectVisibleInScene(object)) return false

  if (!selectedFloor) return true

  const room = rooms.find((item) => item.id === roomId)
  return isFloorVisibleInView(room?.floor, selectedFloor)
}

function isObjectVisibleInScene(object) {
  let current = object

  while (current) {
    if (!current.visible) return false
    current = current.parent
  }

  return true
}

function selectRoom(roomId) {
  if (selectedRoomId === roomId) {
    clearSelection()
    return
  }

  if (inPanorama) togglePanorama()

  selectedRoomId = roomId
  const room = rooms.find((item) => item.id === roomId)
  if (!room) return

  const roomDetails = renderRoomDetails(room)
  const panoramaAction = renderPanoramaAction(room)
  detailsEl.innerHTML = roomDetails
  mapSelectionEl.innerHTML = `${roomDetails}${panoramaAction}<span class="map-selection-hint">Click to deselect</span>`
  mapSelectionEl.classList.remove('is-hidden')
  updatePanoramaButton(room)

  applyLightingMode()
  applyHighlights()
}

function clearSelection() {
  selectedRoomId = null
  detailsEl.innerHTML = '<span class="muted">Select a room or result to inspect it.</span>'
  mapSelectionEl.innerHTML = ''
  mapSelectionEl.classList.add('is-hidden')
  updatePanoramaButton(null)
  applyLightingMode()
  applyHighlights()
}

function toggleCategoryHighlight(category) {
  if (activeCategoryHighlights.has(category)) {
    activeCategoryHighlights.delete(category)
  } else {
    activeCategoryHighlights.add(category)
  }

  highlightButtons.forEach((button) => {
    button.classList.toggle('is-active', activeCategoryHighlights.has(button.dataset.highlight))
  })

  applyFloorVisibility()
  applyHighlights()
}

function toggleFloorHighlight(type) {
  if (floorHighlightTypes.has(type)) {
    floorHighlightTypes.delete(type)
  } else {
    floorHighlightTypes.add(type)
  }

  floorHighlightGroup.visible = floorHighlightTypes.size > 0 && !inPanorama
  floorHighlightButtons.forEach((button) => {
    button.classList.toggle('is-active', floorHighlightTypes.has(button.dataset.floorHighlight))
  })

  floorHighlightGroup.children.forEach((floor) => {
    const matchesFloor = !selectedFloor || isFloorVisibleInView(floor.userData.floor, selectedFloor)
    floor.visible = !inPanorama && matchesFloor && floorHighlightTypes.has(floor.userData.highlightTag)
  })
}

function buildFloorSlicesForFloor(floor) {
  buildFloorSlices({
    floor,
    modelMeshes,
    floorSliceGroup,
    floorSliceObjects,
    clickableObjects,
    originalMaterials,
  })
}

function clearFloorSlices() {
  clearFloorSliceMeshes({
    floorSliceGroup,
    floorSliceObjects,
    clickableObjects,
    originalMaterials,
  })
}

function buildFloorHighlights() {
  floorHighlightGroup.clear()

  // Hall highlights are simple translucent planes over hall footprints, which
  // keeps circulation areas visible even when the original 3D meshes are hidden.
  modelMeshes.forEach((object) => {
    const isGround = object.name === 'Ground' || object.userData.roomType === 'Building base'
    if (isGround) return
    if (!hasObjectTag(object, 'hall')) return

    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    if (size.x <= 0.05 || size.z <= 0.05) return

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x, size.z),
      new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    floor.name = `Floor highlight ${object.name || object.uuid}`
    floor.rotation.x = -Math.PI / 2
    floor.position.set(center.x, box.min.y + 0.035, center.z)
    floor.renderOrder = 3
    floor.userData.roomId = object.userData.roomId
    floor.userData.roomType = object.userData.roomType
    floor.userData.highlightTag = 'hall'
    floor.userData.floor = object.userData.floor
    floor.visible = floorHighlightTypes.has(floor.userData.highlightTag)
    floorHighlightGroup.add(floor)
  })
}

function applyHighlights(matches = currentResultMatches) {
  // Rebuild visual state from the original materials each time so selected
  // rooms, search matches, category highlights, and dimmed rooms do not stack.
  const matchIds = matches ? new Set(matches.map((room) => room.id)) : null
  const hasActiveSearch = Boolean(searchInput.value.trim()) || activeTypeFilters.size > 0
  const hasActiveCategoryHighlight = activeCategoryHighlights.size > 0
  const selectedObject = selectedRoomId ? roomObjects.get(selectedRoomId) : null
  const objectsToUpdate = selectedFloor && floorSliceObjects.length > 0
    ? floorSliceObjects
    : modelMeshes.length > 0
      ? modelMeshes
      : Array.from(roomObjects.values())

  objectsToUpdate.forEach((object) => {
    const originalMaterial = originalMaterials.get(object.uuid)
    if (originalMaterial) object.material = cloneMaterial(originalMaterial)
    if (selectedFloor) {
      object.material = createFloorSliceMaterial(object)
    }

    const roomId = object.userData.roomId
    const isSelected = roomId === selectedRoomId
    const isSelectedChild = selectedObject && isDescendantOf(object, selectedObject)
    const isMatch = roomId ? !matchIds || matchIds.has(roomId) : false
    const activeHighlightTag = getActiveHighlightTag(object)
    const isCategoryMatch = Boolean(activeHighlightTag)
    const shouldKeepCategoryHighlight = isCategoryMatch
    const hasSelectedRoom = Boolean(selectedRoomId)
    const isGround = object.name === 'Ground' || object.userData.roomType === 'Building base'

    if (isGround && !isSelected) return

    if (selectedFloor) {
      if (shouldKeepCategoryHighlight) {
        object.material = cloneTexturedHighlightMaterial(object, getHighlightColor(activeHighlightTag), originalMaterials)
      } else if (isSelected || isSelectedChild) {
        object.material = cloneTexturedHighlightMaterial(
          object,
          object.userData.isMainStairs ? 0x38bdf8 : 0xffd54f,
          originalMaterials,
        )
      } else if (hasSelectedRoom) {
        object.material = createFloorSliceMaterial(object)
        setMaterialOpacity(object.material, 0.2)
      } else if (hasActiveCategoryHighlight && !isCategoryMatch && !isGround) {
        object.material = createFloorSliceMaterial(object)
        setMaterialOpacity(object.material, 0.2)
      } else if (hasActiveSearch && isMatch) {
        object.material = cloneTexturedHighlightMaterial(object, 0x59c18c, originalMaterials)
      } else if (hasActiveSearch && !isMatch && roomId) {
        object.material = createFloorSliceMaterial(object)
        setMaterialOpacity(object.material, 0.2)
      }
  return
}

    if (shouldKeepCategoryHighlight) {
      object.material = cloneMaterial(object.material)
      updateMaterials(object.material, (material) => {
        if (selectedFloor) material.side = THREE.DoubleSide
        material.transparent = false
        material.opacity = 1
        material.depthWrite = true
        const color = getHighlightColor(activeHighlightTag)
        material.color?.lerp(new THREE.Color(color), 0.55)
        material.emissive = new THREE.Color(getHighlightEmissiveColor(activeHighlightTag))
        material.emissiveIntensity = 0.32
        material.needsUpdate = true
      })
    } else if (isSelected || isSelectedChild) {
      object.material = cloneMaterial(object.material)
      updateMaterials(object.material, (material) => {
        if (selectedFloor) material.side = THREE.DoubleSide
        material.transparent = false
        material.opacity = 1
        material.depthWrite = true
        const highlightColor = object.userData.isMainStairs ? 0x38bdf8 : 0xffd54f
        material.color?.lerp(new THREE.Color(highlightColor), 0.55)
        material.emissive = new THREE.Color(object.userData.isMainStairs ? 0x075985 : 0x5c4300)
        material.emissiveIntensity = object.userData.isMainStairs ? 0.32 : 0.22
        material.needsUpdate = true
      })
    } else if (hasSelectedRoom) {
      object.material = cloneMaterial(object.material)
      updateMaterials(object.material, (material) => {
        if (selectedFloor) material.side = THREE.DoubleSide
        material.transparent = true
        material.opacity = 0.2
        material.depthWrite = false
        material.needsUpdate = true
      })
    } else if (hasActiveCategoryHighlight && !isCategoryMatch && !isGround) {
      object.material = cloneMaterial(object.material)
      updateMaterials(object.material, (material) => {
        if (selectedFloor) material.side = THREE.DoubleSide
        material.transparent = true
        material.opacity = 0.2
        material.depthWrite = false
        material.needsUpdate = true
      })
    } else if (hasActiveSearch && isMatch) {
      object.material = cloneMaterial(object.material)
      updateMaterials(object.material, (material) => {
        if (selectedFloor) material.side = THREE.DoubleSide
        material.color?.lerp(new THREE.Color(0x59c18c), 0.35)
        material.emissive = new THREE.Color(0x174d33)
        material.emissiveIntensity = 0.18
        material.needsUpdate = true
      })
    } else if (hasActiveSearch && !isMatch && roomId) {
      object.material = cloneMaterial(object.material)
      updateMaterials(object.material, (material) => {
        if (selectedFloor) material.side = THREE.DoubleSide
        material.transparent = true
        material.opacity = 0.2
        material.depthWrite = false
        material.needsUpdate = true
      })
    }
  })
}

function getActiveHighlightTag(object) {
  return Array.from(activeCategoryHighlights).find((tag) => hasObjectTag(object, tag)) || null
}

function hasObjectTag(object, tag) {
  return object.userData.tags?.some((objectTag) => objectTag.toLowerCase() === tag.toLowerCase()) || false
}

function getHighlightColor(tag) {
  if (tag === 'elevator') return 0xf97316
  if (tag === 'entrance') return 0xa855f7
  if (tag === 'Dining Table') return 0x8b5cf6
  if (tag === 'Microwaves') return 0xf59e0b
  if (tag === 'Printer') return 0x10b981
  if (tag === 'Student card terminal') return 0xec4899
  return 0x38bdf8
}

function getHighlightEmissiveColor(tag) {
  if (tag === 'elevator') return 0x7c2d12
  if (tag === 'entrance') return 0x4c1d95
  if (tag === 'Dining Table') return 0x6d28d9
  if (tag === 'Microwaves') return 0xb45309
  if (tag === 'Printer') return 0x047857
  if (tag === 'Student card terminal') return 0xbe185d
  return 0x075985
}

function isDescendantOf(object, ancestor) {
  let current = object

  while (current) {
    if (current === ancestor) return true
    current = current.parent
  }

  return false
}

function usePerspectiveCamera() {
  if (camera === perspectiveCamera) return

  perspectiveCamera.position.copy(camera.position)
  perspectiveCamera.quaternion.copy(camera.quaternion)
  perspectiveCamera.up.copy(camera.up)
  perspectiveCamera.near = camera.near
  perspectiveCamera.far = camera.far
  camera = perspectiveCamera
  controls.object = camera
}

function useOrthographicCamera() {
  if (camera === orthographicCamera) return

  orthographicCamera.position.copy(camera.position)
  orthographicCamera.quaternion.copy(camera.quaternion)
  orthographicCamera.up.copy(camera.up)
  orthographicCamera.near = camera.near
  orthographicCamera.far = camera.far
  camera = orthographicCamera
  controls.object = camera
}

function updateOrthographicProjection(frustumSize = orthographicFrustumSize) {
  orthographicFrustumSize = Math.max(frustumSize, 1)
  const aspect = Math.max(perspectiveCamera.aspect || 1, 0.001)
  const viewWidth = orthographicFrustumSize * aspect

  orthographicCamera.left = -viewWidth / 2
  orthographicCamera.right = viewWidth / 2
  orthographicCamera.top = orthographicFrustumSize / 2
  orthographicCamera.bottom = -orthographicFrustumSize / 2
  orthographicCamera.updateProjectionMatrix()
}

function getTopDownFrustumSize(width, height, padding = 1.12) {
  const aspect = Math.max(perspectiveCamera.aspect || 1, 0.001)
  return Math.max(height, width / aspect) * padding
}

function fitCameraToScene() {
  usePerspectiveCamera()

  const box = new THREE.Box3()

  // Measure the visible building bounds and place the camera far enough away
  // that the whole model fits inside the current canvas aspect ratio.
  if (buildingRoot) {
    buildingRoot.traverse((object) => {
      if (object.isMesh && object.name !== 'Ground') {
        box.expandByObject(object)
      }
    })
  } else {
    roomObjects.forEach((object) => {
      if (object.userData.roomType !== 'Building base') {
        box.expandByObject(object)
      }
    })
  }

  if (box.isEmpty()) return

  const sizeVector = box.getSize(new THREE.Vector3())
  const size = sizeVector.length()
  const center = box.getCenter(new THREE.Vector3())
  const distance = getDistanceForSize(Math.max(sizeVector.x, sizeVector.y, sizeVector.z), 0.9)
  sceneCenter = center.clone()
  sceneSize = sizeVector.clone()
  sceneRadius = Math.max(size * 0.5, 1)
  sceneDistance = distance
  controls.minDistance = Math.max(sceneRadius * 0.15, 2)
  controls.maxDistance = Math.max(sceneRadius * 2.2, distance * 1.25)

  controls.target.copy(center)
  camera.fov = DEFAULT_CAMERA_FOV
  camera.up.set(0, 1, 0)
  camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.55, distance))
  camera.near = 0.1
  camera.far = Math.max(distance * 6, size * 8, 100)
  camera.updateProjectionMatrix()
  controls.update()

  defaultCameraPosition = camera.position.clone()
  defaultControlsTarget = controls.target.clone()
  activeFixedView = null
}

function fitCameraToFloor(floor) {
  const box = new THREE.Box3()

  // Floor mode uses a real top-down orthographic camera so the selected level
  // reads like a flat plan instead of receding with perspective.
  modelMeshes.forEach((object) => {
    if (isFloorVisibleInView(object.userData.floor, floor)) box.expandByObject(object)
  })

  if (box.isEmpty()) {
    setFixedView('above')
    return
  }

  const sizeVector = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const floorWidth = Math.max(sizeVector.z, 1)
  const floorHeight = Math.max(sizeVector.x, 1)
  const floorSize = Math.max(floorWidth, floorHeight)
  const distance = Math.max(floorSize + sizeVector.y, floorSize * 1.6, 10)

  useOrthographicCamera()
  sceneCenter = center.clone()
  sceneSize = sizeVector.clone()
  sceneRadius = Math.max(floorSize * 0.5, 1)
  sceneDistance = distance
  updateOrthographicProjection(getTopDownFrustumSize(floorWidth, floorHeight))
  applyLightingMode()

  controls.enableRotate = false
  controls.enablePan = false
  controls.enableZoom = true
  controls.mouseButtons = { ...defaultMouseButtons }
  controls.touches = { ...defaultTouches }
  controls.target.copy(center)
  camera.position.copy(center).add(new THREE.Vector3(0, distance, 0.001))
  camera.up.set(-1, 0, 0)
  camera.zoom = 1
  camera.near = Math.max(distance / 1000, 0.1)
  camera.far = Math.max(distance * 10, 100)
  camera.updateProjectionMatrix()
  controls.update()
}

function setFixedView(view) {
  if (inPanorama) return

  if (selectedFloor) {
    selectedFloor = null
    updateFloorButtons()
    applyFloorVisibility()
    applyLightingMode()
  }

  activeFixedView = view
  controls.enableRotate = true
  controls.mouseButtons = { ...defaultMouseButtons }
  controls.touches = { ...defaultTouches }

  if (view === 'above') {
    useOrthographicCamera()
    const topDownWidth = Math.max(sceneSize.z, sceneRadius * 2, 1)
    const topDownHeight = Math.max(sceneSize.x, sceneRadius * 2, 1)
    const viewDistance = Math.max(sceneSize.y + Math.max(topDownWidth, topDownHeight), sceneRadius * 2, 10)

    controls.target.copy(sceneCenter)
    controls.enableRotate = false
    controls.mouseButtons.LEFT = THREE.MOUSE.PAN
    controls.touches.ONE = THREE.TOUCH.PAN
    camera.position.copy(sceneCenter).add(new THREE.Vector3(0, viewDistance, 0.001))
    camera.up.set(-1, 0, 0)
    camera.zoom = 1
    camera.near = Math.max(viewDistance / 1000, 0.1)
    camera.far = Math.max(viewDistance * 10, 100)
    updateOrthographicProjection(getTopDownFrustumSize(topDownWidth, topDownHeight, 1.18))
    applyHighlights()
    controls.update()
    return
  }

  usePerspectiveCamera()
  const viewDistance = getFramedCameraDistance(1.8) / 2
  const directions = {
    front: new THREE.Vector3(viewDistance, viewDistance * 0.18, 0),
    back: new THREE.Vector3(-viewDistance, viewDistance * 0.18, 0),
    left: new THREE.Vector3(0, viewDistance * 0.18, viewDistance),
    right: new THREE.Vector3(0, viewDistance * 0.18, -viewDistance),
  }
  const direction = directions[view]
  if (!direction) return

  controls.target.copy(sceneCenter)
  camera.position.copy(sceneCenter).add(direction)
  camera.up.set(0, 1, 0)
  camera.near = Math.max(viewDistance / 1000, 0.1)
  camera.far = Math.max(viewDistance * 10, 100)
  camera.updateProjectionMatrix()
  applyHighlights()
  controls.update()
}

function getFramedCameraDistance(padding = 1.4) {
  return getDistanceForSize(sceneRadius * 2, padding)
}

function getDistanceForSize(size, padding = 1.4) {
  const verticalFov = THREE.MathUtils.degToRad(perspectiveCamera.fov || DEFAULT_CAMERA_FOV)
  const aspect = Math.max(perspectiveCamera.aspect || 1, 0.001)
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect)
  const limitingFov = Math.min(verticalFov, horizontalFov)
  return (size * 0.5 / Math.tan(limitingFov / 2)) * padding
}

function configurePanoramaCamera() {
  usePerspectiveCamera()
  resizeRenderer()

  controls.target.set(0, 0, 0)
  controls.enableRotate = true
  controls.enablePan = false
  controls.enableZoom = false
  controls.mouseButtons = { ...defaultMouseButtons }
  controls.touches = { ...defaultTouches }
  controls.minPolarAngle = Math.PI / 2
  controls.maxPolarAngle = Math.PI / 2

  camera.up.set(0, 1, 0)
  camera.zoom = 1
  camera.near = 0.1
  camera.far = Math.max(PANORAMA_CAMERA_RADIUS * 12, 100)
  applyPanoramaSettings()
}

function togglePanorama() {
  const room = rooms.find((item) => item.id === selectedRoomId)
  const panoramaUrl = room ? getPanoramaUrlForRoom(room) : null
  if (!panoramaUrl) return

  // Panorama mode swaps the building model for an inward-facing image cylinder
  // and locks the controls to rotate around the center of that cylinder.
  inPanorama = !inPanorama
  layoutEl.classList.toggle('panorama-fullscreen', inPanorama)
  panoramaCloseButton.hidden = !inPanorama
  panoramaSettingsButton.hidden = !inPanorama
  setPanoramaSettingsOpen(inPanorama && panoramaSettingsOpen)

  if (inPanorama) {
    configurePanoramaCamera()
    applyFloorVisibility()
    if (!panoramaMesh || panoramaMesh.userData.panoramaUrl !== panoramaUrl) {
      setLoadingText('Loading...')
      if (panoramaMesh) {
        scene.remove(panoramaMesh)
        panoramaMesh.geometry.dispose()
        if (panoramaMesh.material.map) panoramaMesh.material.map.dispose()
        panoramaMesh.material.dispose()
      }
      panoramaMesh = createPanoramaMesh(
        panoramaUrl,
        () => {
          if (inPanorama && panoramaMesh?.userData.panoramaUrl === panoramaUrl) {
            panoramaMesh.visible = true
            setLoadingText('')
          }
        },
        () => {
          if (inPanorama && panoramaMesh?.userData.panoramaUrl === panoramaUrl) {
            setLoadingText('Loading failed')
          }
        },
      )
      panoramaMesh.userData.panoramaUrl = panoramaUrl
      scene.add(panoramaMesh)
    } else if (panoramaMesh.userData.isLoaded) {
      setLoadingText('')
    } else {
      setLoadingText('Loading...')
    }

    panoramaMesh.visible = Boolean(panoramaMesh.userData.isLoaded)
    if (buildingRoot) buildingRoot.visible = false
    panoramaButton.textContent = 'Close panorama view'
    panoramaButton.setAttribute('aria-pressed', 'true')
  } else {
    setPanoramaSettingsOpen(false)
    setLoadingText('')
    if (panoramaMesh) panoramaMesh.visible = false
    if (buildingRoot) buildingRoot.visible = true
    usePerspectiveCamera()
    restoreBuildingControls()
    camera.fov = DEFAULT_CAMERA_FOV
    camera.zoom = 1
    camera.updateProjectionMatrix()
    applyFloorVisibility()
    if (selectedFloor) {
      fitCameraToFloor(selectedFloor)
    } else if (activeFixedView) {
      setFixedView(activeFixedView)
    } else if (defaultCameraPosition && defaultControlsTarget) {
      controls.enableRotate = true
      camera.position.copy(defaultCameraPosition)
      controls.target.copy(defaultControlsTarget)
      controls.update()
    } else {
      fitCameraToScene()
    }
    panoramaButton.textContent = 'See panorama view'
    panoramaButton.setAttribute('aria-pressed', 'false')
  }

  resizeRenderer()
  controls.update()
}

function togglePanoramaSettings() {
  setPanoramaSettingsOpen(!panoramaSettingsOpen)
}

function setPanoramaSettingsOpen(isOpen) {
  panoramaSettingsOpen = Boolean(isOpen && inPanorama)
  panoramaSettingsPanel.hidden = !panoramaSettingsOpen
  panoramaSettingsButton.setAttribute('aria-expanded', String(panoramaSettingsOpen))
  panoramaSettingsButton.textContent = panoramaSettingsOpen ? 'Close settings' : 'Settings'
}

function handlePanoramaSettingsInput() {
  panoramaSettings.fov = Number(panoramaFovInput.value)
  panoramaSettings.distance = Number(panoramaDistanceInput.value)
  panoramaSettings.rotateSpeed = Number(panoramaSpeedInput.value)
  applyPanoramaSettings()
}

function resetPanoramaSettings() {
  panoramaSettings.fov = PANORAMA_FOV
  panoramaSettings.distance = PANORAMA_CAMERA_RADIUS
  panoramaSettings.rotateSpeed = PANORAMA_ROTATE_SPEED
  syncPanoramaSettingsInputs()
  applyPanoramaSettings()
}

function syncPanoramaSettingsInputs() {
  panoramaFovInput.value = String(panoramaSettings.fov)
  panoramaDistanceInput.value = String(panoramaSettings.distance)
  panoramaSpeedInput.value = String(panoramaSettings.rotateSpeed)
  panoramaFovValue.textContent = formatPanoramaValue(panoramaSettings.fov)
  panoramaDistanceValue.textContent = formatPanoramaValue(panoramaSettings.distance)
  panoramaSpeedValue.textContent = formatPanoramaValue(panoramaSettings.rotateSpeed)
}

function applyPanoramaSettings() {
  if (!inPanorama) return
  syncPanoramaSettingsInputs()

  // Keep the camera on a fixed-radius orbit so changing panorama settings does
  // not accidentally zoom through or outside the image cylinder.
  camera.fov = panoramaSettings.fov
  camera.updateProjectionMatrix()
  controls.rotateSpeed = panoramaSettings.rotateSpeed
  controls.minDistance = panoramaSettings.distance
  controls.maxDistance = panoramaSettings.distance

  const direction = camera.position.clone().sub(controls.target)
  direction.y = 0
  if (direction.lengthSq() === 0) direction.set(1, 0, 0)
  direction.setLength(panoramaSettings.distance)
  camera.position.copy(controls.target).add(direction)
  controls.update()
}

function restoreBuildingControls() {
  controls.enablePan = true
  controls.enableZoom = true
  controls.enableRotate = true
  controls.mouseButtons = { ...defaultMouseButtons }
  controls.touches = { ...defaultTouches }
  controls.rotateSpeed = 1
  controls.minPolarAngle = 0
  controls.maxPolarAngle = BUILDING_MAX_POLAR_ANGLE
  controls.minDistance = Math.max(sceneRadius * 0.15, 2)
  controls.maxDistance = Math.max(sceneRadius * 2.2, sceneDistance * 1.25, 20)
  camera.up.set(0, 1, 0)
}

function formatPanoramaValue(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function setLoadingText(message) {
  loadingOverlayEl.textContent = message || ''
  loadingOverlayEl.hidden = !message
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = canvas.parentElement
  if (!clientWidth || !clientHeight) return
  renderer.setSize(clientWidth, clientHeight, false)
  perspectiveCamera.aspect = clientWidth / clientHeight
  perspectiveCamera.updateProjectionMatrix()
  updateOrthographicProjection()
}

function scheduleSceneLayoutUpdate() {
  if (resizeFrame) cancelAnimationFrame(resizeFrame)

  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null
    updateSceneLayout()
  })
}

function handleWindowResize() {
  scheduleSceneLayoutUpdate()
}

function animate() {
  controls.update()
  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
