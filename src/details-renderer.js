import { getPanoramaUrlForRoom } from './room-utils.js'

export function renderTagChips(room, className) {
  if (room.type !== 'Room') return ''
  return `
    <span class="${className}">
      ${room.tags.map((tag) => `<span>${tag}</span>`).join('')}
    </span>
  `
}

export function renderPlanningLink(room) {
  if (!room.planningUrl) return ''

  return `
    <p class="planning-link">
      <strong>Planning:</strong>
      <a href="${room.planningUrl}" target="_blank" rel="noreferrer">${room.planningUrl}</a>
    </p>
  `
}

export function renderRoomDetails(room) {
  return `
    <div class="details-header details-header--compact">
      <div>
        <h2>${room.name}</h2>
        <p>${room.type}</p>
      </div>
      <span>${room.floor}</span>
    </div>
    ${renderTagChips(room, 'tag-list')}
    ${renderPlanningLink(room)}
  `
}

export function renderPanoramaAction(room) {
  if (!getPanoramaUrlForRoom(room)) return ''

  return `
    <button id="panorama-button" class="secondary-button panorama-action-button" type="button">
      See panorama view
    </button>
  `
}

export function renderResultItem(room) {
  return `
    <button class="result-item" type="button" role="option" data-room-id="${room.id}">
      <strong>${room.name}</strong>
      <span>${room.floor} - Sector ${room.sector || '-'} - ${room.type}</span>
      ${renderTagChips(room, 'result-tags')}
    </button>
  `
}
