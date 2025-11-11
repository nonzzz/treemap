import type { DOMEVEntDefinition } from '../dom-event'
import { Schedule } from '../etoile'
import type { ColorDecoratorResultRGB } from '../etoile/native/runtime'
import { createRoundBlock, smoothFrame, stackMatrixTransform } from '../shared'
import { definePlugin } from '../shared/plugin-driver'

export class Highlight extends Schedule<DOMEVEntDefinition> {
  reset() {
    this.destory()
    this.update()
  }

  get canvas() {
    return this.render.canvas
  }

  setZIndexForHighlight(zIndex = '-1') {
    this.canvas.style.zIndex = zIndex
  }

  init() {
    this.setZIndexForHighlight()
    this.canvas.style.position = 'absolute'
    this.canvas.style.pointerEvents = 'none'
  }
}

export interface HighlightMeta {
  highlight: Highlight | null
  // To sync different event handlers
  highlightSeq?: number
}

export const ANIMATION_DURATION = 300

const HIGH_LIGHT_OPACITY = 0.3

const fill = <ColorDecoratorResultRGB> { desc: { r: 255, g: 255, b: 255 }, mode: 'rgb' }

export const presetHighlightPlugin = definePlugin({
  name: 'treemap:preset-highlight',
  onLoad() {
    const meta = this.getPluginMetadata<HighlightMeta>('treemap:preset-highlight')
    if (!meta) {
      return
    }
    if (!meta.highlight) {
      meta.highlight = new Highlight(this.instance.to)
    }
  },
  onDOMEventTriggered(name, _, module, { stateManager: state, matrix }) {
    if (name === 'mousemove') {
      if (state.canTransition('MOVE')) {
        const meta = this.getPluginMetadata('treemap:preset-highlight') as HighlightMeta
        if (!module) {
          meta.highlight?.reset()
          meta.highlight?.update()
          meta.highlight?.setZIndexForHighlight()
          meta.highlightSeq = (meta.highlightSeq ?? 0) + 1
          return
        }

        const [x, y, w, h] = module.layout

        const effectiveRadius = Math.min(module.config.rectRadius, w / 4, h / 4)
        meta.highlightSeq = (meta.highlightSeq ?? 0) + 1
        const thisSeq = meta.highlightSeq

        smoothFrame((_, cleanup) => {
          if (meta.highlightSeq !== thisSeq) {
            meta.highlight?.setZIndexForHighlight()
            cleanup()
            return
          }
          cleanup()
          meta.highlight?.reset()
          const mask = createRoundBlock(x, y, w, h, { fill, opacity: HIGH_LIGHT_OPACITY, radius: effectiveRadius, padding: 0 })
          meta.highlight?.add(mask)
          meta.highlight?.setZIndexForHighlight('1')
          stackMatrixTransform(mask, matrix.e, matrix.f, 1)
          meta.highlight?.update()
        }, {
          duration: ANIMATION_DURATION
        })
      }
    }
  },
  onResize() {
    const meta = this.getPluginMetadata<HighlightMeta>('treemap:preset-highlight')
    if (!meta) {
      return
    }
    meta.highlight?.render.initOptions({ ...this.instance.render.options })
    meta.highlight?.reset()
    meta.highlight?.init()
  },
  onDispose() {
    const meta = this.getPluginMetadata<HighlightMeta>('treemap:preset-highlight')
    if (meta && meta.highlight) {
      meta.highlight.destory()
      meta.highlight = null
    }
  },
  meta: {
    highlight: null,
    highlightSeq: 0
  }
})
