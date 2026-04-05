import { type RoundRect, asserts } from '../etoile'
import type { ColorDecoratorResultRGB } from '../etoile/native/runtime'
import type { DirtyRect } from '../etoile/schedule'
import type { LayoutModule } from '../primitives/squarify'
import { createRoundBlock } from '../shared'
import { definePlugin } from '../shared/plugin-driver'

export interface HighlightMeta {
  overlayGraphic: RoundRect | null
  lastDirtyRect: DirtyRect | null
}

export const ANIMATION_DURATION = 300

const HIGH_LIGHT_OPACITY = 0.3

const fill = <ColorDecoratorResultRGB> { desc: { r: 255, g: 255, b: 255 }, mode: 'rgb' }

export const presetHighlightPlugin = definePlugin({
  name: 'treemap:preset-highlight',
  onDOMEventTriggered(name, _, graphic, { stateManager: state, matrix, component }) {
    // Any interaction that isn't a pure hover must reset the overlay so we never
    // show a stale highlight after zoom / drag / pan transitions.
    if (name !== 'mousemove') {
      const meta = this.getPluginMetadata<HighlightMeta>('treemap:preset-highlight')
      if (meta && meta.lastDirtyRect) {
        component.clearOverlay()
        meta.overlayGraphic = null
        meta.lastDirtyRect = null
      }
      return
    }

    if (name === 'mousemove') {
      if (state.canTransition('MOVE')) {
        const meta = this.getPluginMetadata<HighlightMeta>('treemap:preset-highlight')
        if (!meta) { return }

        const oldDirtyRect = meta.lastDirtyRect

        if (!graphic) {
          if (oldDirtyRect) {
            component.clearOverlay()
            component.updateDirty([oldDirtyRect])
            meta.overlayGraphic = null
            meta.lastDirtyRect = null
          }
          return
        }

        const module = graphic.__widget__ as LayoutModule
        const [x, y, w, h] = module.layout

        const rect = graphic.elements[0]

        if (!rect || !asserts.isRoundRect(rect)) { return }
        const effectiveRadius = rect.style.radius

        // Layout coordinates are already in visual (zoomed) space; matrix.e/f
        // is the pan translation that gets added to every element position.
        const visualX = x + matrix.e
        const visualY = y + matrix.f

        // Expand dirty rect by 1 CSS px on each side to cover anti-aliased edges.
        const pad = 1
        const newDirtyRect: DirtyRect = {
          x: visualX - pad,
          y: visualY - pad,
          width: w + pad * 2,
          height: h + pad * 2
        }

        const mask = createRoundBlock(visualX, visualY, w, h, {
          fill,
          opacity: HIGH_LIGHT_OPACITY,
          radius: effectiveRadius,
          padding: 0
        })

        component.clearOverlay()
        component.addOverlay(mask)
        meta.overlayGraphic = mask
        meta.lastDirtyRect = newDirtyRect

        const dirtyRects: DirtyRect[] = oldDirtyRect
          ? [newDirtyRect, oldDirtyRect]
          : [newDirtyRect]
        component.updateDirty(dirtyRects)
      } else {
        // State changed away from hoverable (e.g. dragging / zooming) — clear overlay.
        const meta = this.getPluginMetadata<HighlightMeta>('treemap:preset-highlight')
        if (meta && meta.lastDirtyRect) {
          component.clearOverlay()
          meta.overlayGraphic = null
          meta.lastDirtyRect = null
        }
      }
    }
  },
  onResize() {
    const meta = this.getPluginMetadata<HighlightMeta>('treemap:preset-highlight')
    if (!meta) { return }
    this.instance.clearOverlay()
    meta.overlayGraphic = null
    meta.lastDirtyRect = null
  },
  onDispose() {
    const meta = this.getPluginMetadata<HighlightMeta>('treemap:preset-highlight')
    if (meta) {
      this.instance.clearOverlay()
      meta.overlayGraphic = null
      meta.lastDirtyRect = null
    }
  },
  meta: {
    overlayGraphic: null,
    lastDirtyRect: null
  } satisfies HighlightMeta
})
