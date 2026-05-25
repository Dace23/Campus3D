# Campus3D

Campus3D is an interactive 3D campus building viewer built with Vite, Three.js, and a GLB building model. It lets users explore the building, switch between floors, search rooms, apply room filters, highlight services, and open panorama views for selected spaces.

## Features

- Interactive 3D building navigation with orbit controls
- Floor selection with top-down 2D-style floor views
- Room search and category filters
- Highlight controls for services such as elevators, entrances, printers, microwaves, dining areas, and student card terminals
- Room details with planning links when available
- Panorama view support for selected rooms and spaces


## Getting Started

To try it :

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```


## Project Structure

```text
public/
  models/
    Per21.glb              # Main building model
    panoramas/             # Panorama images used in room views
src/
  main.js                  # Main Three.js scene and app logic
  rooms.json               # Room metadata used for search, filters, and model matching
  config.js                # Model, panorama, floor, and filter configuration
  style.css                # Application styles
  *.js                     # Rendering, filtering, material, floor, and panorama helpers
index.html                 # Vite entry HTML
package.json               # Scripts and dependencies
```

## Notes

Since the presentation, I've just changed the camera for an orthographic one for the 2D views. The process could be simplified by modifying the original model to remove the top faces of the corridors, allowing the internal objects on the floor to be seen; however, since the code is already written and functional, I’m sticking with my previous solution of creating slices.
