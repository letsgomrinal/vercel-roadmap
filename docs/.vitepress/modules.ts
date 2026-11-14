export const modules = [
  { phase: 'Phase 1 · Foundations', items: [
    ['01', 'Mental model', '/modules/01-mental-model'],
    ['02', 'First deploys', '/modules/02-first-deploys'],
  ]},
  { phase: 'Phase 2 · Building real apps', items: [
    ['03', 'Compute', '/modules/03-compute'],
    ['04', 'Storage', '/modules/04-storage'],
    ['05', 'Async work', '/modules/05-async-work'],
    ['06', 'Services & containers', '/modules/06-services-and-containers'],
  ]},
  { phase: 'Phase 3 · Production & governance', items: [
    ['07', 'Security & access', '/modules/07-security-and-access'],
    ['08', 'Observe & release', '/modules/08-observability-and-release'],
  ]},
  { phase: 'Phase 4 · Platform engineering', items: [
    ['09', 'Programmatic deploys', '/modules/09-programmatic-deploys'],
    ['10', 'Paved road (MCP)', '/modules/10-paved-road-mcp'],
    ['11', 'Capstone', '/modules/11-capstone'],
  ]},
  { phase: 'Reference', items: [
    ['12', 'Cheat sheet', '/modules/12-cheat-sheet'],
    ['13', "What's next: agents", '/modules/13-whats-next-agents'],
  ]},
] as const;
