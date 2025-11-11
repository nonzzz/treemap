import { DEFAULT_MATRIX_LOC } from 'src/etoile/native/matrix'
import { easing } from '../etoile'
import { mixin, smoothFrame, stackMatrixTransformWithGraphAndLayer } from '../shared'
import { definePlugin } from '../shared/plugin-driver'
import { getDragOptions, getHighlightInstance } from './drag'
import { ANIMATION_DURATION } from './highlight'
import { getScaleOptions } from './wheel'

interface ZoomableMetadata {
  isZooming: boolean
  previousMatrixState?: {
    e: number,
    f: number,
    a: number,
    d: number
  }
}

const MAX_SCALE_MULTIPLIER = 2.0
const ZOOM_PADDING_RATIO = 0.85

export const presetZoomablePlugin = definePlugin({
  name: 'treemap:preset-zoomable',
  onLoad(treemap, { stateManager: state, matrix }) {
    return mixin(treemap, [
      {
        name: 'zoom',
        fn: () => (id: string) => {
          const meta = this.getPluginMetadata<ZoomableMetadata>('treemap:preset-zoomable')
          if (!meta || state.isInState('ZOOMING')) { return }

          const targetModule = this.resolveModuleById(id)
          if (!targetModule) { return }

          const oldMatrix = { e: matrix.e, f: matrix.f, a: matrix.a }

          meta.previousMatrixState = {
            e: matrix.e,
            f: matrix.f,
            a: matrix.a,
            d: matrix.d
          }

          const component = this.instance
          state.transition('ZOOMING')

          const [nodeX, nodeY, nodeW, nodeH] = targetModule.layout
          const { width, height } = component.render.options

          const currentScale = matrix.a

          // To prevent unlimited scale factor growth.
          const scaleX = (width * ZOOM_PADDING_RATIO) / nodeW
          const scaleY = (height * ZOOM_PADDING_RATIO) / nodeH
          const idleScale = Math.min(scaleX, scaleY)
          const maxAllowedScale = currentScale * MAX_SCALE_MULTIPLIER
          const targetScale = Math.max(currentScale, Math.min(idleScale, maxAllowedScale))

          // Real world args
          const viewportCenterX = width / 2
          const viewportCenterY = height / 2

          const originalNodeCenterX = (nodeX + nodeW / 2) / currentScale
          const originalNodeCenterY = (nodeY + nodeH / 2) / currentScale

          const targetE = viewportCenterX - originalNodeCenterX * targetScale
          const targetF = viewportCenterY - originalNodeCenterY * targetScale

          const scaleMeta = getScaleOptions.call(this)
          if (scaleMeta) {
            scaleMeta.scaleOptions.scale = targetScale
          }

          const highlight = getHighlightInstance.call(this)
          const dragMeta = getDragOptions.call(this)

          if (dragMeta) {
            Object.assign(dragMeta.dragOptions, {
              x: 0,
              y: 0,
              lastX: 0,
              lastY: 0
            })
          }

          const startMatrix = {
            e: matrix.e,
            f: matrix.f,
            a: matrix.a,
            d: matrix.d
          }

          const finalMatrix = { e: targetE, f: targetF }

          component.handleTransformCacheInvalidation(oldMatrix, finalMatrix)

          smoothFrame((progress) => {
            const easedProgress = easing.cubicInOut(progress)

            matrix.create(DEFAULT_MATRIX_LOC)
            matrix.e = startMatrix.e + (targetE - startMatrix.e) * easedProgress
            matrix.f = startMatrix.f + (targetF - startMatrix.f) * easedProgress
            matrix.a = startMatrix.a + (targetScale - startMatrix.a) * easedProgress
            matrix.d = startMatrix.d + (targetScale - startMatrix.d) * easedProgress
            if (highlight?.highlight) {
              highlight.highlight.reset()
              highlight.highlight.setZIndexForHighlight()
            }
            if (highlight) {
              highlight.highlightSeq = (highlight.highlightSeq ?? 0) + 1
            }

            component.cleanup()
            component.layoutNodes = component.calculateLayoutNodes(
              component.data,
              { w: width * matrix.a, h: height * matrix.d, x: 0, y: 0 },
              1
            )

            component.draw(true, false)
            stackMatrixTransformWithGraphAndLayer(component.elements, matrix.e, matrix.f, 1)
            component.update()
          }, {
            duration: ANIMATION_DURATION,
            onStop: () => {
              state.reset()
            }
          })
        }
      }
    ])
  },
  meta: {
    isZooming: false
  } as ZoomableMetadata
})
