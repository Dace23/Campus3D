export const MODEL_URL = '/models/Per21.glb'
export const ALL_LEVELS_FLOOR = 'All levels'
export const PANORAMA_RADIUS = 26
export const PANORAMA_HEIGHT = 90
export const PANORAMA_FOV = 40
export const PANORAMA_CAMERA_RADIUS = 9
export const PANORAMA_ROTATE_SPEED = 1
export const DEFAULT_CAMERA_FOV = 55
export const BUILDING_MAX_POLAR_ANGLE = Math.PI * 0.495

export const selectableFloorNames = ['Level 0', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5']

export const panoramaImagesByKey = new Map([
  ['mainhall', '/models/panoramas/Main_Hall.jpg'],
  ['learninglab', '/models/panoramas/Anonymized_LearningLab.jpg'],
  ['hall1a', '/models/panoramas/Anonymized_Hall1A.jpg'],
  ['f205', '/models/panoramas/Classroom_F205.jpg'],
  ['groupworkroom1e', '/models/panoramas/Anonymized_Group_study_room.jpg'],
  ['cafeteria', '/models/panoramas/Anonymized_Cafeteria.jpg'],
  ['b130', '/models/panoramas/Classroom.jpg'],
  ['hall2a-g', '/models/panoramas/Hall2.jpg'],
  ['g120', '/models/panoramas/auditorium.jpg'],
])

export const filterGroups = [
  {
    id: 'study',
    label: 'Study places',
    matchTags: ['Study room'],
    options: [
      { id: 'Can talk', label: 'Can talk' },
      { id: 'Quiet', label: 'Quiet' },
      { id: 'Computer', label: 'Available computer' },
    ],
  },
  {
    id: 'teaching',
    label: 'Teaching rooms',
    matchTags: ['Auditorium', 'Class room'],
    options: [
      { id: 'Auditorium', label: 'Auditorium' },
      { id: 'Class room', label: 'Class room' },
      { id: 'Computer', label: 'Available computer' },
    ],
  },
  {
    id: 'toilet',
    label: 'Toilets',
    matchTags: ['Toilets'],
    options: [
      { id: 'Women', label: 'Women' },
      { id: 'Men', label: 'Men' },
      { id: 'Disabled', label: 'Disabled' },
    ],
  },
  {
    id: 'departments',
    label: 'Departments / Institutes',
    options: [
      {
        id: 'Dean’s Office – Management, Economics and Social Sciences',
        label: 'Dean’s Office – Management, Economics and Social Sciences',
      },
      { id: 'Department of Computer Science', label: 'Department of Computer Science' },
      { id: 'IT Services Department', label: 'IT Services Department' },
      {
        id: 'Institute for Association and Cooperative Management -VIMI',
        label: 'Institute for Association and Cooperative Management -VIMI',
      },
      {
        id: 'International Institute for Telecommunications Management - iimt',
        label: 'International Institute for Telecommunications Management - iimt',
      },
    ],
  },
  {
    id: 'administration',
    label: 'Offices / Administration',
    options: [
      { id: 'AGEF Office', label: 'AGEF Office' },
      { id: 'Archives', label: 'Archives' },
      { id: 'Concierge office', label: 'Concierge office' },
      { id: 'Faculty room', label: 'Faculty room' },
      { id: 'Support Center', label: 'Support Center' },
    ],
  },
  {
    id: 'services',
    label: 'Services / Facilities',
    options: [
      { id: 'Cafeteria', label: 'Cafeteria' },
      { id: 'Infirmary', label: 'Infirmary' },
      { id: 'Lactation room', label: 'Lactation room' },
      { id: 'University Sports Service', label: 'University Sports Service' },
    ],
  },
  {
    id: 'meeting-work',
    label: 'Meeting / Work rooms',
    options: [
      { id: 'Meeting room', label: 'Meeting room' },
      { id: 'Micromus', label: 'Micromus' },
    ],
  },
]
