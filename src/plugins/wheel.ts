import type { DOMEventMetadata } from '../dom-event'
import { DOMEvent, isWheelEvent } from '../dom-event'
import { DEFAULT_MATRIX_LOC } from '../etoile/native/matrix'
import { smoothFrame, stackMatrixTransformWithGraphAndLayer } from '../shared'
import { definePlugin } from '../shared/plugin-driver'
import type { PluginContext } from '../shared/plugin-driver'
import { ANIMATION_DURATION } from './highlight'

interface ScaleOptions {
  // visible scale (what rendering uses)
  scale: number
  // a virtual scale used for accumulation beyond bounds (no resistance)
  virtualScale?: number

  minScale: number
  maxScale: number
  scaleFactor: number

  // spring / bounce configuration (exposed but simple)
  springStiffness?: number
  springDamping?: number
  overshootResistance?: number

  // how far below min (or above max) user can temporarily pull as factor
  // of min/max. e.g., 0.05 means visible minimum during overscroll: min * 0.05.
  overshootLimitFactor?: number

  // runtime fields
  lastAnchorX?: number
  lastAnchorY?: number
  springRafId?: number | null

  // toggle animation globally for bounce-back
  animationsEnabled?: boolean

  // wheel debounce configurable (ms)
  wheelDebounce?: number
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

  // wheel-end debounce id
  wheelEndTimeoutId?: number | null
}

interface ScaleMetadata {
  scaleOptions: ScaleOptions
  gestureState: GestureState
}

// refer https://developer.mozilla.org/en-US/docs/Web/API/Element/mousewheel_event
// we shouldn't use wheelDelta property anymore.

export function getScaleOptions(this: PluginContext): ScaleMetadata {
  const meta = this.getPluginMetadata<ScaleMetadata>('treemap:preset-scale')
  if (!meta) {
    throw new Error('treemap:preset-scale metadata missing; ensure presetScalePlugin is registered')
  }
  return meta
}

export interface ScalePluginOptions {
  /**
   * @default Infinity
   */
  max?: number
  /**
   * @default 0.1
   */
  min?: number

  // optional simple tuning
  springStiffness?: number
  springDamping?: number
  overshootResistance?: number
  overshootLimitFactor?: number
  // wheel end debounce (ms). Higher is more tolerant to trackpad small continuous deltas.
  wheelDebounce?: number

  // whether bounce-back animation is enabled (default true)
  animationsEnabled?: boolean
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
        virtualScale: 1,
        minScale: options?.min ?? 0.1,
        maxScale: options?.max ?? Infinity,
        scaleFactor: 0.05,

        springStiffness: options?.springStiffness ?? 300,
        springDamping: options?.springDamping ?? 35,
        overshootResistance: options?.overshootResistance ?? 0.35,
        overshootLimitFactor: options?.overshootLimitFactor ?? 0.05,

        lastAnchorX: undefined,
        lastAnchorY: undefined,
        springRafId: null,

        animationsEnabled: options?.animationsEnabled ?? true,
        wheelDebounce: options?.wheelDebounce ?? 200
      } satisfies ScaleOptions,
      gestureState: {
        isTrackingGesture: false,
        lastEventTime: 0,
        eventCount: 0,
        totalDeltaY: 0,
        totalDeltaX: 0,
        consecutivePinchEvents: 0,
        gestureType: 'unknown',
        lockGestureType: false,
        wheelEndTimeoutId: null
      } satisfies GestureState
    },
    onResize({ matrix, stateManager: state }) {
      const meta = getScaleOptions.call(this)
      meta.scaleOptions.scale = 1
      meta.scaleOptions.virtualScale = 1
      matrix.create(DEFAULT_MATRIX_LOC)
      state.reset()
    }
  })
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
  // Usually the deltaY is large and deltaX maybe 0 or small number.
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
  const doUpdate = () => {
    component.clearOverlay()

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

function cancelSpringAnimationIfAny(meta: ScaleMetadata) {
  const rafId = meta.scaleOptions.springRafId
  if (typeof rafId === 'number' && rafId !== null) {
    cancelAnimationFrame(rafId)
    meta.scaleOptions.springRafId = null
  }
}

function springAnimateToScale(
  pluginContext: PluginContext,
  domEvent: DOMEvent,
  targetScale: number,
  anchorX: number,
  anchorY: number
) {
  const meta = getScaleOptions.call(pluginContext)
  const { matrix, component } = domEvent

  // if animations disabled, snap immediately and return
  if (!meta.scaleOptions.animationsEnabled) {
    const oldMatrix = { e: matrix.e, f: matrix.f }
    const finalScaleDiff = targetScale / meta.scaleOptions.scale
    if (isFinite(finalScaleDiff) && finalScaleDiff > 0 && Math.abs(finalScaleDiff - 1) > 1e-12) {
      matrix.scale(finalScaleDiff, finalScaleDiff)
      matrix.e = anchorX - (anchorX - matrix.e) * finalScaleDiff
      matrix.f = anchorY - (anchorY - matrix.f) * finalScaleDiff
    }
    meta.scaleOptions.scale = targetScale
    meta.scaleOptions.virtualScale = targetScale
    try {
      component.handleTransformCacheInvalidation(oldMatrix, { e: matrix.e, f: matrix.f })
    } catch {}
    updateViewport(pluginContext, domEvent, false)
    return
  }

  cancelSpringAnimationIfAny(meta)

  const stiffness = meta.scaleOptions.springStiffness ?? 300
  const damping = meta.scaleOptions.springDamping ?? 35

  let position = meta.scaleOptions.scale
  let velocity = 0
  let lastTime = performance.now()
  const thresholdPos = Math.max(1e-4, Math.abs(targetScale) * 1e-3)
  const thresholdVel = 1e-3

  const oldMatrix = { e: matrix.e, f: matrix.f }

  function step(now: number) {
    const dt = Math.min((now - lastTime) / 1000, 0.033)
    lastTime = now

    const force = stiffness * (targetScale - position)
    const accel = force - damping * velocity

    velocity += accel * dt
    const prev = position
    position += velocity * dt

    const scaleDiff = position / prev
    if (isFinite(scaleDiff) && scaleDiff > 0) {
      matrix.scale(scaleDiff, scaleDiff)
      matrix.e = anchorX - (anchorX - matrix.e) * scaleDiff
      matrix.f = anchorY - (anchorY - matrix.f) * scaleDiff
      meta.scaleOptions.scale = position
      meta.scaleOptions.virtualScale = position
      updateViewport(pluginContext, domEvent, false)
    }

    const isSettled = Math.abs(targetScale - position) <= thresholdPos && Math.abs(velocity) <= thresholdVel
    if (isSettled) {
      const finalScaleDiff = targetScale / meta.scaleOptions.scale
      if (isFinite(finalScaleDiff) && finalScaleDiff > 0 && Math.abs(finalScaleDiff - 1) > 1e-12) {
        matrix.scale(finalScaleDiff, finalScaleDiff)
        matrix.e = anchorX - (anchorX - matrix.e) * finalScaleDiff
        matrix.f = anchorY - (anchorY - matrix.f) * finalScaleDiff
      }
      meta.scaleOptions.scale = targetScale
      meta.scaleOptions.virtualScale = targetScale
      try {
        component.handleTransformCacheInvalidation(oldMatrix, { e: matrix.e, f: matrix.f })
      } catch {}
      updateViewport(pluginContext, domEvent, false)
      meta.scaleOptions.springRafId = null
      return
    }

    meta.scaleOptions.springRafId = requestAnimationFrame(step)
  }

  meta.scaleOptions.springRafId = requestAnimationFrame(step)
}

function handleWheelEnd(pluginContext: PluginContext, domEvent: DOMEvent) {
  const meta = getScaleOptions.call(pluginContext)
  const { scale, minScale, maxScale } = meta.scaleOptions
  const eps = 1e-6
  if (scale + eps < minScale) {
    const target = minScale
    const anchorX = meta.scaleOptions.lastAnchorX ?? (domEvent.component.render.options.width / 2)
    const anchorY = meta.scaleOptions.lastAnchorY ?? (domEvent.component.render.options.height / 2)
    springAnimateToScale(pluginContext, domEvent, target, anchorX, anchorY)
  } else if (scale - eps > maxScale) {
    const target = maxScale
    const anchorX = meta.scaleOptions.lastAnchorX ?? (domEvent.component.render.options.width / 2)
    const anchorY = meta.scaleOptions.lastAnchorY ?? (domEvent.component.render.options.height / 2)
    springAnimateToScale(pluginContext, domEvent, target, anchorX, anchorY)
  } else {
    // inside bounds: sync virtualScale to visible scale to avoid sudden jumps later
    meta.scaleOptions.virtualScale = meta.scaleOptions.scale
    if (Math.abs(scale - minScale) < 1e-8) { meta.scaleOptions.scale = minScale }
    if (Math.abs(scale - maxScale) < 1e-8) { meta.scaleOptions.scale = maxScale }
  }
}

function handleZoom(
  pluginContext: PluginContext,
  event: DOMEventMetadata<'wheel'>,
  domEvent: DOMEvent
) {
  const { stateManager: state, matrix, component } = domEvent
  const meta = getScaleOptions.call(pluginContext)

  // read currentVisible and currentVirtual separately to avoid destructuring-default warnings
  const currentVisible = meta.scaleOptions.scale
  const prevVirtualRaw = meta.scaleOptions.virtualScale ?? currentVisible

  const minScale = meta.scaleOptions.minScale
  const maxScale = meta.scaleOptions.maxScale
  const scaleFactor = meta.scaleOptions.scaleFactor
  const overshootResistance = meta.scaleOptions.overshootResistance ?? 0.35
  const overshootLimitFactor = meta.scaleOptions.overshootLimitFactor ?? 0.05

  cancelSpringAnimationIfAny(meta)

  const oldMatrix = { e: matrix.e, f: matrix.f }

  const dynamicScaleFactor = Math.max(scaleFactor, currentVisible * 0.1)
  const delta = event.native.deltaY < 0 ? dynamicScaleFactor : -dynamicScaleFactor

  let newVirtual = prevVirtualRaw + delta

  let newVisible: number
  if (newVirtual >= minScale && newVirtual <= maxScale) {
    newVisible = newVirtual
  } else if (newVirtual < minScale) {
    newVisible = minScale + (newVirtual - minScale) * overshootResistance
    const lowerBound = Math.max(0, minScale * overshootLimitFactor)
    if (newVisible < lowerBound) {
      newVisible = lowerBound
      // sync virtual so further moves are consistent with clamped visible value
      newVirtual = minScale + (newVisible - minScale) / Math.max(1e-6, overshootResistance)
    }
  } else {
    newVisible = maxScale + (newVirtual - maxScale) * overshootResistance
    const upperBound = maxScale * (1 + Math.max(overshootLimitFactor, 0.05))
    if (newVisible > upperBound) {
      newVisible = upperBound
      newVirtual = maxScale + (newVisible - maxScale) / Math.max(1e-6, overshootResistance)
    }
  }

  const prevVisible = currentVisible
  if (newVisible === prevVisible) {
    meta.scaleOptions.virtualScale = newVirtual
    return
  }

  state.transition('SCALING')
  const mouseX = event.native.offsetX
  const mouseY = event.native.offsetY

  // remember anchor for later spring animation
  meta.scaleOptions.lastAnchorX = mouseX
  meta.scaleOptions.lastAnchorY = mouseY

  const scaleDiff = newVisible / prevVisible

  meta.scaleOptions.virtualScale = newVirtual
  meta.scaleOptions.scale = newVisible

  matrix.scale(scaleDiff, scaleDiff)

  matrix.e = mouseX - (mouseX - matrix.e) * scaleDiff
  matrix.f = mouseY - (mouseY - matrix.f) * scaleDiff

  try {
    component.handleTransformCacheInvalidation(oldMatrix, { e: matrix.e, f: matrix.f })
  } catch {}

  updateViewport(pluginContext, domEvent, false)

  const g = meta.gestureState
  if (g.wheelEndTimeoutId) {
    clearTimeout(g.wheelEndTimeoutId)
    g.wheelEndTimeoutId = null
  }
  const debounceMs = meta.scaleOptions.wheelDebounce ?? 200
  g.wheelEndTimeoutId = window.setTimeout(() => {
    g.wheelEndTimeoutId = null
    handleWheelEnd(pluginContext, domEvent)
  }, debounceMs)
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

  const meta = getScaleOptions.call(pluginContext)
  cancelSpringAnimationIfAny(meta)

  state.transition('PANNING')

  matrix.e -= deltaX
  matrix.f -= deltaY

  updateViewport(pluginContext, domEvent, true)
}
