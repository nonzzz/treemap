import type { DOMEventMetadata } from '../dom-event'
import { DOMEvent, isWheelEvent } from '../dom-event'
import { DEFAULT_MATRIX_LOC } from '../etoile/native/matrix'
import { smoothFrame, stackMatrixTransformWithGraphAndLayer } from '../shared'
import { definePlugin } from '../shared/plugin-driver'
import type { PluginContext } from '../shared/plugin-driver'
import { getHighlightInstance } from './drag'
import { ANIMATION_DURATION } from './highlight'

interface ScaleOptions {
  scale: number
  minScale: number
  maxScale: number
  scaleFactor: number
}

interface GestureState {
  isTrackingGesture: boolean
  lastEventTime: number
  eventCount: number
  totalDeltaY: number
  totalDeltaX: number
  consecutivePinchEvents: number
  gestureType: 'unknown' | 'pan' | 'zoom'
  lockGestureType: boolean
}

interface ScaleMetadata {
  scaleOptions: ScaleOptions
  gestureState: GestureState
}

// refer https://developer.mozilla.org/en-US/docs/Web/API/Element/mousewheel_event
// we shouldn't use wheelDelta property anymore.

export interface ScalePluginOptions {
  /**
   * @default Infinity
   * @description The maximum scale factor for the treemap.
   */
  max?: number
  /**
   * @default 0.1
   * @description The minimum scale factor for the treemap.
   */
  min?: number
}

export function presetScalePlugin(options?: ScalePluginOptions) {
  return definePlugin({
    name: 'treemap:preset-scale',
    onDOMEventTriggered(_, event, module, evt) {
      if (isWheelEvent(event)) {
        onWheel(this, event, evt)
      }
    },
    meta: {
      scaleOptions: {
        scale: 1,
        minScale: options?.min || 0.1,
        maxScale: options?.max || Infinity,
        scaleFactor: 0.05
      } satisfies ScaleOptions,
      gestureState: {
        isTrackingGesture: false,
        lastEventTime: 0,
        eventCount: 0,
        totalDeltaY: 0,
        totalDeltaX: 0,
        consecutivePinchEvents: 0,
        gestureType: 'unknown',
        lockGestureType: false
      } satisfies GestureState
    },
    onResize({ matrix, stateManager: state }) {
      const meta = getScaleOptions.call(this)
      if (meta) {
        meta.scaleOptions.scale = 1
      }
      matrix.create(DEFAULT_MATRIX_LOC)
      state.reset()
    }
  })
}

export function getScaleOptions(this: PluginContext) {
  const meta = this.getPluginMetadata<ScaleMetadata>('treemap:preset-scale')
  return meta
}

function determineGestureType(event: WheelEvent, gestureState: GestureState): 'pan' | 'zoom' {
  const now = Date.now()
  const timeDiff = now - gestureState.lastEventTime

  if (timeDiff > 150) {
    Object.assign(gestureState, {
      isTrackingGesture: false,
      lastEventTime: now,
      eventCount: 1,
      totalDeltaY: Math.abs(event.deltaY),
      totalDeltaX: Math.abs(event.deltaX),
      consecutivePinchEvents: 0,
      gestureType: 'unknown',
      lockGestureType: false
    })
  } else {
    gestureState.eventCount++
    gestureState.totalDeltaY += Math.abs(event.deltaY)
    gestureState.totalDeltaX += Math.abs(event.deltaX)
    gestureState.lastEventTime = now
  }

  if (event.ctrlKey) {
    gestureState.gestureType = 'zoom'
    gestureState.lockGestureType = true
    return 'zoom'
  }

  // windows/macos mouse wheel
  // Usually the dettaY is large and deltaX maybe 0 or small number.
  const isMouseWheel = (Math.abs(event.deltaX) >= 100 && Math.abs(event.deltaX) <= 10) ||
    (
      Math.abs(event.deltaY) > 50 &&
      Math.abs(event.deltaX) < Math.abs(event.deltaY) * 0.1
    )

  if (isMouseWheel) {
    gestureState.gestureType = 'zoom'
    gestureState.lockGestureType = true
    return 'zoom'
  }

  if (gestureState.lockGestureType && gestureState.gestureType !== 'unknown') {
    return gestureState.gestureType
  }

  // Magic Trackpad or Precision Touchpad
  if (gestureState.eventCount >= 3) {
    const avgDeltaY = gestureState.totalDeltaY / gestureState.eventCount
    const avgDeltaX = gestureState.totalDeltaX / gestureState.eventCount
    const ratio = avgDeltaX / (avgDeltaY + 0.1)

    const isZoomGesture = avgDeltaY > 8 &&
      ratio < 0.3 &&
      Math.abs(event.deltaY) > 5

    if (isZoomGesture) {
      gestureState.gestureType = 'zoom'
      gestureState.lockGestureType = true
      return 'zoom'
    } else {
      gestureState.gestureType = 'pan'
      gestureState.lockGestureType = true
      return 'pan'
    }
  }

  return 'pan'
}

function onWheel(
  pluginContext: PluginContext,
  event: DOMEventMetadata<'wheel'>,
  domEvent: DOMEvent
) {
  event.native.preventDefault()
  const meta = getScaleOptions.call(pluginContext)
  if (!meta) { return }

  const gestureType = determineGestureType(event.native, meta.gestureState)

  if (gestureType === 'zoom') {
    handleZoom(pluginContext, event, domEvent)
  } else {
    handlePan(pluginContext, event, domEvent)
  }
}

function updateViewport(
  pluginContext: PluginContext,
  { stateManager: state, component, matrix }: DOMEvent,
  useAnimation: boolean = false
) {
  const highlight = getHighlightInstance.apply(pluginContext)

  const doUpdate = () => {
    if (highlight && highlight.highlight) {
      highlight.highlight.reset()
      highlight.highlight.setZIndexForHighlight()
    }
    if (highlight) {
      highlight.highlightSeq = (highlight.highlightSeq ?? 0) + 1
    }

    component.cleanup()
    const { width, height } = component.render.options
    component.layoutNodes = component.calculateLayoutNodes(
      component.data,
      { w: width * matrix.a, h: height * matrix.d, x: 0, y: 0 },
      1
    )
    component.draw(true, false)

    stackMatrixTransformWithGraphAndLayer(
      component.elements,
      matrix.e,
      matrix.f,
      1
    )
    component.update()

    if (state.canTransition('IDLE')) {
      state.transition('IDLE')
    }
  }

  if (useAnimation) {
    smoothFrame((_, cleanup) => {
      cleanup()
      doUpdate()
      return true
    }, {
      duration: ANIMATION_DURATION
    })
  } else {
    doUpdate()
  }
}

function handleZoom(
  pluginContext: PluginContext,
  event: DOMEventMetadata<'wheel'>,
  domEvent: DOMEvent
) {
  const { stateManager: state, matrix, component } = domEvent
  const meta = getScaleOptions.call(pluginContext)
  if (!meta) { return }
  const { scale, minScale, maxScale, scaleFactor } = meta.scaleOptions

  const oldMatrix = { e: matrix.e, f: matrix.f }

  const dynamicScaleFactor = Math.max(scaleFactor, scale * 0.1)

  const delta = event.native.deltaY < 0 ? dynamicScaleFactor : -dynamicScaleFactor
  const newScale = Math.max(minScale, Math.min(maxScale, scale + delta))
  if (newScale === scale) { return }

  state.transition('SCALING')
  const mouseX = event.native.offsetX
  const mouseY = event.native.offsetY

  const scaleDiff = newScale / scale

  meta.scaleOptions.scale = newScale
  matrix.scale(scaleDiff, scaleDiff)

  matrix.e = mouseX - (mouseX - matrix.e) * scaleDiff
  matrix.f = mouseY - (mouseY - matrix.f) * scaleDiff

  const newMatrix = { e: matrix.e, f: matrix.f }

  component.handleTransformCacheInvalidation(oldMatrix, newMatrix)

  updateViewport(pluginContext, domEvent, false)
}

function handlePan(
  pluginContext: PluginContext,
  event: DOMEventMetadata<'wheel'>,
  domEvent: DOMEvent
) {
  const { stateManager: state, matrix } = domEvent
  const panSpeed = 0.8
  const deltaX = event.native.deltaX * panSpeed
  const deltaY = event.native.deltaY * panSpeed

  state.transition('PANNING')

  matrix.e -= deltaX
  matrix.f -= deltaY

  updateViewport(pluginContext, domEvent, true)
}
