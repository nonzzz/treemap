import { Component, logger } from './component'
import { DOMEvent } from './dom-event'
import type { ExposedEventMethods } from './dom-event'
import { Event } from './etoile'
import type { GraphicConfig } from './interface'
import { bindParentForModule } from './primitives/struct'
import type { Module } from './primitives/struct'
import { mixin } from './shared'
import { assertExists } from './shared/logger'
import type { Plugin } from './shared/plugin-driver'

export interface CreateTreemapOptions<P extends Plugin[]> {
  plugins: P
  graphic?: GraphicConfig
}

export interface TreemapOptions {
  data: Module[]
}

type UnionToIntersection<U> = (
  U extends Any ? (k: U) => void : never
) extends (k: infer I) => void ? I
  : never

type PluginMixins<P extends readonly Plugin[]> = UnionToIntersection<
  {
    [K in keyof P]: P[K] extends {
      onLoad?: (ctx: Any, component: Any) => infer R
    } ? R extends object ? R
      : NonNull
      : NonNull
  }[number]
>
export interface BasicTreemapInstance {
  init: (el: HTMLElement) => void
  dispose: () => void
  resize: () => void
  setOptions: (options: TreemapOptions) => void
}

export function createTreemap<const P extends readonly Plugin[]>(
  // @ts-expect-error todo fix
  options?: CreateTreemapOptions<P>
) {
  const { plugins = [], graphic = {} } = options || {}
  let root: HTMLElement | null = null
  let installed = false
  let domEvent: DOMEvent | null = null

  let component: Component | null = null

  const exposedEvent = new Event()

  if (!Array.isArray(plugins)) {
    logger.panic('Plugins should be an array')
  }

  const ctx = {
    init,
    dispose,
    resize,
    setOptions
  }

  function init(el: HTMLElement) {
    component = new Component(graphic, el)
    domEvent = new DOMEvent(component)
    root = el
    ;(root as HTMLDivElement).style.position = 'relative'
    if (!installed) {
      plugins.forEach((plugin) => component?.pluginDriver.use(plugin))
      installed = true
      component.pluginDriver.runHook('onLoad', ctx, domEvent)
    }
    domEvent.on('__exposed__', (type, args) => exposedEvent.emit(type, args))
  }

  function dispose() {
    if (root && component && domEvent) {
      domEvent.destory()
      component.destory()
      root.removeChild(root.firstChild!)
      for (const evt in exposedEvent.eventCollections) {
        exposedEvent.off(evt)
      }
      component.pluginDriver.runHook('onDispose')
      root = null
      component = null
      domEvent = null
    }
  }

  function resize() {
    if (!component || !root) { return }
    const { width, height } = root.getBoundingClientRect()
    component.render.initOptions({ height, width, devicePixelRatio: window.devicePixelRatio })
    component.render.canvas.style.position = 'absolute'
    if (domEvent) {
      component.pluginDriver.runHook('onResize', domEvent)
    }
    component.cleanup()
    component.draw()
  }

  function setOptions(options: TreemapOptions) {
    assertExists(component, logger, 'Treemap not initialized. Please call `init()` before setOptions.')
    component.data = bindParentForModule(options.data)
    resize()
  }

  const base = mixin(ctx, [
    { name: 'on', fn: () => exposedEvent.on.bind(exposedEvent) },
    { name: 'off', fn: () => exposedEvent.off.bind(exposedEvent) }
  ])

  return base as typeof base & BasicTreemapInstance & ExposedEventMethods & PluginMixins<P>
}

export type TreemapInstance<P extends readonly Plugin[]> = BasicTreemapInstance & ExposedEventMethods & PluginMixins<P>

export * from './interface'
export {
  c2m,
  findRelativeNode,
  findRelativeNodeById,
  flatten as flattenModule,
  getNodeDepth,
  sortChildrenByKey,
  visit
} from './primitives/struct'
export type { Plugin, PluginContext, PluginHooks } from './shared/plugin-driver'
export { definePlugin } from './shared/plugin-driver'

export { Component, logger } from './component'
export type { DOMEventType, ExposedEventCallback, ExposedEventDefinition, ExposedEventMethods, PrimitiveEventMetadata } from './dom-event'
export { isClickEvent, isContextMenuEvent, isMouseEvent, isWheelEvent } from './dom-event'
export type { LayoutModule } from './primitives/squarify'
export type { Module, NativeModule } from './primitives/struct'
export * from './shared'
