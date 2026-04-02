import { Component } from './component'
import { Event } from './etoile'
import type { BindThisParameter } from './etoile'
import { captureBoxXY } from './etoile/native/dom'
import { DEFAULT_MATRIX_LOC, Matrix2D } from './etoile/native/matrix'
import type { LayoutModule } from './primitives/squarify'
import { findRelativeGraphicNode, findRelativeNode } from './primitives/struct'

// I think those event is enough for user.

export const DOM_EVENTS = ['click', 'mousedown', 'mousemove', 'mouseup', 'mouseover', 'mouseout', 'wheel', 'contextmenu'] as const

export type DOMEventType = typeof DOM_EVENTS[number]

export interface DOMEventMetadata<T extends keyof HTMLElementEventMap = Any> {
  native: HTMLElementEventMap[T]
  readonly kind: T
}

export type DOMEventCallback<T extends DOMEventType> = (metadata: DOMEventMetadata<T>) => void

export interface PrimitiveEventMetadata<T extends keyof HTMLElementEventMap> {
  native: HTMLElementEventMap[T]
  module: LayoutModule | null
}

export type ExposedEventCallback<T extends DOMEventType> = (metadata: PrimitiveEventMetadata<T>) => void

export type ExposedEventDefinition = {
  [K in DOMEventType]: BindThisParameter<ExposedEventCallback<K>, AnyObject>
}

export interface ExposedEventMethods<C = AnyObject, D = ExposedEventDefinition> {
  on<Evt extends keyof D | (string & {})>(
    evt: Evt,
    handler: BindThisParameter<Evt extends keyof D ? D[Evt] : Any, unknown extends C ? this : C>
  ): void
  off<Evt extends keyof D>(
    evt: keyof D,
    handler?: BindThisParameter<D[Evt], unknown extends C ? this : C>
  ): void
}

export type DOMEVEntDefinition =
  & {
    [K in DOMEventType]: BindThisParameter<DOMEventCallback<K>, unknown>
  }
  & {
    __exposed__: <D extends DOMEventType | (string & {})>(
      type: D,
      metadata: D extends DOMEventType ? PrimitiveEventMetadata<D> : Any
    ) => void
  }

export const STATE_TRANSITION = {
  IDLE: 'IDLE',
  PRESSED: 'PRESSED',
  DRAGGING: 'DRAGGING',
  ZOOMING: 'ZOOMING',
  MOVE: 'MOVE',
  SCALING: 'SCALING',
  PANNING: 'PANNING'
} as const

export type StateTransition = typeof STATE_TRANSITION[keyof typeof STATE_TRANSITION]

export class StateManager {
  current: StateTransition
  constructor() {
    this.current = STATE_TRANSITION.IDLE
  }
  canTransition(to: StateTransition) {
    switch (this.current) {
      case 'IDLE':
        return to === 'PRESSED' || to === 'MOVE' || to === 'SCALING' || to === 'ZOOMING' || to === 'PANNING'
      case 'PRESSED':
        return to === 'DRAGGING' || to === 'IDLE'
      case 'DRAGGING':
        return to === 'IDLE'
      case 'MOVE':
        return to === 'PRESSED' || to === 'IDLE'
      case 'SCALING':
        return to === 'IDLE'
      case 'ZOOMING':
        return to === 'IDLE'
      case 'PANNING':
        return to === 'IDLE'
      default:
        return false
    }
  }
  transition(to: StateTransition): boolean {
    const valid = this.canTransition(to)
    if (valid) {
      this.current = to
    }
    return valid
  }
  reset() {
    this.current = STATE_TRANSITION.IDLE
  }
  isInState(state: StateTransition) {
    return this.current === state
  }
}

export function isWheelEvent(metadata: DOMEventMetadata<DOMEventType>): metadata is DOMEventMetadata<'wheel'> {
  return metadata.kind === 'wheel'
}

export function isMouseEvent(
  metadata: DOMEventMetadata<DOMEventType>
): metadata is DOMEventMetadata<'mousedown' | 'mouseup' | 'mousemove'> {
  return ['mousedown', 'mouseup', 'mousemove'].includes(metadata.kind)
}

export function isClickEvent(metadata: DOMEventMetadata<DOMEventType>): metadata is DOMEventMetadata<'click'> {
  return metadata.kind === 'click'
}

export function isContextMenuEvent(
  metadata: DOMEventMetadata<DOMEventType>
): metadata is DOMEventMetadata<'contextmenu'> {
  return metadata.kind === 'contextmenu'
}

function bindDOMEvent(el: HTMLElement, evt: DOMEventType, dom: DOMEvent) {
  const handler = (e: unknown) => {
    const data = {
      native: e as HTMLElementEventMap[DOMEventType]
    }
    Object.defineProperty(data, 'kind', {
      value: evt,
      enumerable: true,
      configurable: false,
      writable: false
    })
    // @ts-expect-error safe operation
    dom.emit(evt, data)
  }
  el.addEventListener(evt, handler)

  return { evt, handler }
}

// We don't consider db click for us library
// So the trigger step follows:
// mousedown => mouseup => click
// For menu click (downstream demand)

export class DOMEvent extends Event<DOMEVEntDefinition> {
  domEvents: Array<ReturnType<typeof bindDOMEvent>>
  el: HTMLElement | null
  currentModule: LayoutModule | null
  component: Component
  matrix: Matrix2D
  stateManager: StateManager
  constructor(component: Component) {
    super()
    this.component = component
    this.el = component.render.canvas
    this.matrix = new Matrix2D()
    this.currentModule = null
    this.stateManager = new StateManager()
    this.domEvents = DOM_EVENTS.map((evt) => bindDOMEvent(this.el!, evt, this))

    DOM_EVENTS.forEach((evt) => {
      this.on(evt, (e: DOMEventMetadata<DOMEventType>) => {
        this.dispatch(evt, e)
      })
    })
  }

  destory() {
    if (this.el) {
      this.domEvents.forEach(({ evt, handler }) => this.el?.removeEventListener(evt, handler))
      this.domEvents = []
      for (const evt in this.eventCollections) {
        this.off(evt as DOMEventType)
      }
      this.matrix.create(DEFAULT_MATRIX_LOC)
    }
  }

  private dispatch<T extends DOMEventType>(kind: T, e: DOMEventMetadata<T>) {
    const node = this.findRelativeNode(e)

    const { native } = e
    const bbox = captureBoxXY(this.el!, native, 1, 1, this.matrix.e, this.matrix.f)

    // this.component.elements
    const res = findRelativeGraphicNode(bbox, this.component.elements)
    console.log('find node', res)
    this.component.pluginDriver.runHook('onDOMEventTriggered', kind, e, node, this)
    this.emit('__exposed__', kind, { native: e.native, module: node })
  }
  findRelativeNode(e: DOMEventMetadata) {
    return findRelativeNode(
      captureBoxXY(this.el!, e.native, 1, 1, this.matrix.e, this.matrix.f),
      this.component.layoutNodes
    )
  }
}
