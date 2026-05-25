export function renderAppShell({ panoramaFov, panoramaDistance, panoramaRotateSpeed }) {
  return `
    <main class="layout">
      <div class="filters-menu-bar">
        <button id="filters-menu-toggle" class="filters-menu-toggle" type="button" aria-expanded="false" aria-controls="filters-menu">
          Filters
        </button>
        <button id="reset-filters-button" class="reset-filters-button" type="button">Reset filters</button>
      </div>
      <nav id="filters-menu" class="top-menu" aria-label="Filters and map controls" hidden>
        <section class="top-menu-section top-menu-section--filters">
          <div class="filter-section-header">
            <h2>Filters</h2>
          </div>
          <div id="filter-list" class="filter-list"></div>
        </section>

      </nav>

      <aside class="sidebar">
        <div class="brand">
          <div>
            <h1>Campus 3D</h1>
            <p>Find rooms, services, and study places.</p>
          </div>
        </div>

        <label class="field">
          <span>Search</span>
          <input id="search-input" type="search" placeholder="Room, service, tag..." />
        </label>

        <section>
          <h2>Results</h2>
          <div id="results-summary" class="results-summary" aria-live="polite"></div>
          <div id="result-list" class="result-list" role="listbox" aria-label="Search results"></div>
        </section>

        <section class="details" id="details" aria-live="polite">
          <span class="muted">Select a room or result to inspect it.</span>
        </section>
      </aside>

      <section class="viewer-shell">
        <div id="loading-overlay" class="loading-overlay" hidden>Loading...</div>
        <div class="highlight-panel" aria-label="Highlight controls">
          <button id="highlight-toggle" class="scene-panel-toggle" type="button" aria-expanded="false" aria-controls="highlight-options">
            Highlight
          </button>
          <div id="highlight-options" class="highlight-options" hidden>
            <span class="control-title">Highlight</span>
            <div class="highlight-controls">
            <button type="button" data-highlight="stairs">Stairs</button>
            <button type="button" data-floor-highlight="hall">Halls</button>
            <button type="button" data-highlight="elevator">Elevators</button>
            <button type="button" data-highlight="entrance">Entrances</button>
            <button type="button" data-highlight="Dining Table">Dining table</button>
            <button type="button" data-highlight="Microwaves">Microwaves</button>
            <button type="button" data-highlight="Printer">Printers</button>
            <button type="button" data-highlight="Student card terminal">Student card terminal</button>
            </div>
          </div>
        </div>
        <div class="view-controls" aria-label="Camera views">
          <button id="views-toggle" class="scene-panel-toggle" type="button" aria-expanded="false" aria-controls="view-options">
            Views
          </button>
          <div id="view-options" class="view-options" hidden>
            <div class="view-control-group">
              <span class="control-title">3D Views</span>
              <button type="button" data-view="front">Front</button>
              <button type="button" data-view="back">Back</button>
              <button type="button" data-view="left">Left</button>
              <button type="button" data-view="right">Right</button>
              <button type="button" data-view="above">Above</button>
            </div>
            <div class="view-control-group">
              <span class="control-title">2D Levels</span>
              <div id="floor-list" class="floor-list" aria-label="Select a floor"></div>
            </div>
          </div>
        </div>
        <button id="panorama-close-button" class="secondary-button close-button" type="button" hidden>
          Close panorama
        </button>
        <button id="panorama-settings-button" class="panorama-settings-button" type="button" hidden>
          Settings
        </button>
        <form id="panorama-settings-panel" class="panorama-settings-panel" hidden>
          <h2>Panorama settings</h2>
          <label>
            <span class="panorama-setting-label">
              <span>Field of view</span>
              <output id="panorama-fov-value">${panoramaFov}</output>
            </span>
            <input id="panorama-fov-input" type="range" min="20" max="70" step="1" value="${panoramaFov}" />
          </label>
          <label>
            <span class="panorama-setting-label">
              <span>Distance from center</span>
              <output id="panorama-distance-value">${panoramaDistance}</output>
            </span>
            <input id="panorama-distance-input" type="range" min="4" max="24" step="1" value="${panoramaDistance}" />
          </label>
          <label>
            <span class="panorama-setting-label">
              <span>Turn speed</span>
              <output id="panorama-speed-value">${panoramaRotateSpeed}</output>
            </span>
            <input id="panorama-speed-input" type="range" min="0.4" max="2" step="0.1" value="${panoramaRotateSpeed}" />
          </label>
          <button type="button" id="panorama-reset-button">Reset</button>
        </form>
        <canvas id="scene"></canvas>
        <section class="map-selection is-hidden" id="map-selection"></section>
      </section>
    </main>
  `
}
