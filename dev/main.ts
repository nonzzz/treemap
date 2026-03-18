/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { c2m, createTreemap, sortChildrenByKey } from '../src'
import {
  presetColorPlugin,
  presetDragElementPlugin,
  presetHighlightPlugin,
  presetMenuPlugin,
  presetScalePlugin,
  presetZoomablePlugin
} from '../src/plugins'

import './live-reload'

const root = document.querySelector<HTMLDivElement>('#app')!
const treemap = createTreemap({
  plugins: [
    presetColorPlugin,
    presetZoomablePlugin,
    presetHighlightPlugin,
    presetDragElementPlugin,
    presetScalePlugin({ min: 1 }),
    presetMenuPlugin({
      style: {
        borderRadius: '5px',
        padding: '6px 3px',
        boxSizing: 'border-box',
        cursor: 'pointer',
        width: '120px',
        textAlign: 'center',
        userSelect: 'none'
      },
      render: () => [
        { html: '<p>Zoom</p>', action: 'zoom' },
        { html: '<p>Reset</p>', action: 'reset' }
      ],
      onClick(action, module) {
        switch (action) {
          case 'zoom': {
            if (module?.node.id) {
              treemap.zoom(module.node.id)
            }
            break
          }
          case 'reset':
            treemap.resize()
        }
      }
    })
  ]
})

function loadData() {
  return fetch('data.json').then((res) => res.json()).then((data: Any[]) => data)
}

function convertChildrenToGroups(item: Any[]) {
  const result: Any = { ...item }
  // @ts-expect-error fixme
  if (item.children) {
    // @ts-expect-error fixme
    result.groups = item.children.map(convertChildrenToGroups)
  }
  return result
}

async function main() {
  const data = await loadData()
  const convertedData = data.map(convertChildrenToGroups)
  const sortedData = sortChildrenByKey(
    convertedData.map((item) => c2m(item, 'value', (d) => ({ ...d, id: d.path, label: d.name }))),
    'weight'
  )
  // treemap.zoom()
  treemap.setOptions({
    data: sortedData
  })
}

treemap.init(root)

treemap.on('click', function() {
})

main().catch(console.error)

new ResizeObserver(() => treemap.resize()).observe(root)

const badge = document.createElement('div')
badge.style.position = 'fixed'
badge.style.left = '20px'
badge.style.bottom = '20px'
badge.style.padding = '10px'
badge.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'
badge.style.color = 'white'
badge.style.borderRadius = '5px'
badge.style.fontFamily = 'Arial, sans-serif'
badge.style.fontSize = '14px'
badge.textContent = 'FPS: 0'
document.body.appendChild(badge)
let lastFrameTime = 0
let frameCount = 0
let lastSecond = 0
function animate(currentTime: number) {
  if (lastFrameTime !== 0) {
    frameCount++
    if (currentTime - lastSecond >= 1000) {
      const fps = frameCount
      badge.textContent = `FPS: ${fps}`
      frameCount = 0
      lastSecond = currentTime
    }
  }
  lastFrameTime = currentTime
  requestAnimationFrame(animate)
}
requestAnimationFrame(animate)
