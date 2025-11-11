import { isBox, isRoundRect, isText, traverse } from '../etoile'
import { DEFAULT_MATRIX_LOC } from '../etoile/native/matrix'
import { isScrollWheelOrRightButtonOnMouseupAndDown, smoothFrame, stackMatrixTransform } from '../shared'
import { definePlugin } from '../shared/plugin-driver'
import type { PluginContext } from '../shared/plugin-driver'
import { ANIMATION_DURATION } from './highlight'
import type { HighlightMeta } from './highlight'

interface DragOptions {
  x: number
  y: number
  lastX: number
  lastY: number
}

interface DragMetadata {
  dragOptions: DragOptions
}

export const presetDragElementPlugin = definePlugin({
  name: 'treemap:preset-drag-element',
  onDOMEventTriggered(name, event, module, domEvent) {
    const { stateManager: state, matrix, component } = domEvent
    switch (name) {
      case 'mousemove': {
        if (state.isInState('DRAGGING')) {
          domEvent.silent('click')
        } else {
          domEvent.active('click')
        }

        const meta = getDragOptions.call(this)
        if (!meta) {
          return
        }

        if (meta.dragOptions.x === 0 && meta.dragOptions.y === 0) {
          state.transition('IDLE')
          return
        }

        state.transition('DRAGGING')
        if (state.isInState('DRAGGING')) {
          const highlight = getHighlightInstance.call(this)
          smoothFrame((_, cleanup) => {
            cleanup()
            const { offsetX, offsetY } = event.native
            const drawX = offsetX - meta.dragOptions.x
            const drawY = offsetY - meta.dragOptions.y
            const lastX = meta.dragOptions.x
            const lastY = meta.dragOptions.y
            if (highlight?.highlight) {
              highlight.highlight.reset()
              highlight.highlight.setZIndexForHighlight()
            }
            matrix.translation(drawX, drawY)
            meta.dragOptions.x = offsetX
            meta.dragOptions.y = offsetY
            meta.dragOptions.lastX = lastX
            meta.dragOptions.lastY = lastY

            const cloned = component.elements.map((el) => isBox(el) ? el.clone() : el)
            component.cleanup()
            component.add(...cloned)
            traverse(component.elements, (graph) => {
              if (isText(graph)) {
                const { textX, textY } = (graph.__widget__) as { textX: number, textY: number }
                graph.x = textX
                graph.y = textY
              }
              if (isRoundRect(graph)) {
                const { x, y, w, h } = (graph.__widget__) as { x: number, y: number, w: number, h: number }
                graph.x = x
                graph.y = y
                graph.width = w
                graph.height = h
              }
              stackMatrixTransform(graph, matrix.e, matrix.f, 1)
            })
            component.update()
            return true
          }, {
            duration: ANIMATION_DURATION,
            deps: [() => state.isInState('IDLE')]
          })
        }

        break
      }
      case 'mouseup': {
        if (state.isInState('PRESSED')) {
          const meta = getDragOptions.call(this)
          if (meta && meta.dragOptions) {
            if (meta.dragOptions.x === meta.dragOptions.lastX && meta.dragOptions.y === meta.dragOptions.lastY) {
              state.transition('IDLE')
              return
            }
          }
        }
        if (state.isInState('DRAGGING') && state.canTransition('IDLE')) {
          const highlight = getHighlightInstance.call(this)
          if (highlight && highlight.highlight) {
            highlight.highlight.reset()
            highlight.highlight.setZIndexForHighlight()
          }
          const meta = getDragOptions.call(this)
          if (meta && meta.dragOptions) {
            meta.dragOptions.x = 0
            meta.dragOptions.y = 0
            meta.dragOptions.lastX = 0
            meta.dragOptions.lastY = 0
            state.transition('IDLE')
          }
        }

        break
      }
      case 'mousedown': {
        if (isScrollWheelOrRightButtonOnMouseupAndDown(event.native)) {
          return
        }
        const meta = getDragOptions.call(this)
        if (!meta) {
          return
        }
        meta.dragOptions.x = event.native.offsetX
        meta.dragOptions.y = event.native.offsetY
        meta.dragOptions.lastX = event.native.offsetX
        meta.dragOptions.lastY = event.native.offsetY
        state.transition('PRESSED')
        break
      }
    }
  },
  meta: {
    dragOptions: {
      x: 0,
      y: 0,
      lastX: 0,
      lastY: 0
    } satisfies DragOptions
  },
  onResize({ matrix, stateManager: state }) {
    matrix.create(DEFAULT_MATRIX_LOC)
    state.reset()
  }
})

export function getHighlightInstance(this: PluginContext) {
  return this.getPluginMetadata<HighlightMeta>('treemap:preset-highlight')
}

export function getDragOptions(this: PluginContext) {
  const meta = this.getPluginMetadata<DragMetadata>('treemap:preset-drag-element')
  return meta
}
