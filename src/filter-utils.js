import { filterGroups } from './config.js'

export function matchesRoomFilters(room, activeTypeFilters, activeOptionFilters) {
  if (activeTypeFilters.size === 0) return true

  // A room matches if it belongs to at least one selected filter group and
  // satisfies every checked option inside that group.
  return Array.from(activeTypeFilters).some((groupId) => {
    const group = filterGroups.find((item) => item.id === groupId)
    if (!group || !isRoomInFilterGroup(room, group)) return false

    const optionFilters = activeOptionFilters.get(groupId) || new Set()
    return Array.from(optionFilters).every((option) => hasTag(room, option))
  })
}

function isRoomInFilterGroup(room, group) {
  const matchTags = group.matchTags || group.options.map((option) => option.id)
  return matchTags.some((tag) => hasTag(room, tag))
}

function hasTag(room, tag) {
  return room.tags.some((roomTag) => roomTag.toLowerCase() === tag.toLowerCase())
}
