import { RoundRect, Text, traverse } from '../etoile'
import { Display, S } from '../etoile/graph/display'
import type { RoundRectStyleOptions } from '../etoile/graph/rect'
import { createSmoothFrame } from '../etoile/native/dom'
import { Matrix2D } from '../etoile/native/matrix'

export function hashCode(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    hash = (hash << 5) - hash + code
    hash = hash & hash
  }
  return hash
}

// For strings we only check the first character to determine if it's a number (I think it's enough)
export function perferNumeric(s: string | number) {
  if (typeof s === 'number') { return true }
  return s.charCodeAt(0) >= 48 && s.charCodeAt(0) <= 57
}

export function noop() {}

export function createRoundBlock<T extends Any = Any>(
  x: number,
  y: number,
  width: number,
  height: number,
  style?: Partial<RoundRectStyleOptions>,
  widget?: T
) {
  return new RoundRect({ width, height, x, y, style: { ...style } }, widget)
}

export function createTitleText<T extends Any = Any>(text: string, x: number, y: number, font: string, color: string, widget?: T) {
  return new Text({
    text,
    x,
    y,
    style: { fill: color, textAlign: 'center', baseline: 'middle', font, lineWidth: 1 }
  }, widget)
}

export const raf = window.requestAnimationFrame

export function createCanvasElement() {
  return document.createElement('canvas')
}

export function applyCanvasTransform(ctx: CanvasRenderingContext2D, matrix: Matrix2D, dpr: number) {
  ctx.setTransform(matrix.a * dpr, matrix.b * dpr, matrix.c * dpr, matrix.d * dpr, matrix.e * dpr, matrix.f * dpr)
}

export interface InheritedCollectionsWithParamter<T = Any> {
  name: string
  fn: (instance: T) => (...args: Any[]) => Any
}

type MixinHelpWithParamater<T extends InheritedCollectionsWithParamter[]> = T extends [infer L, ...infer R]
  ? L extends InheritedCollectionsWithParamter
    ? R extends InheritedCollectionsWithParamter[] ? { [key in L['name']]: ReturnType<L['fn']> } & MixinHelpWithParamater<R>
    : Record<string, never>
  : Record<string, never>
  : Record<string, never>

export function mixin<
  T extends AnyObject,
  const M extends InheritedCollectionsWithParamter<T>[]
>(
  app: T,
  methods: M
) {
  methods.forEach(({ name, fn }) => {
    Object.defineProperty(app, name, {
      value: fn(app),
      writable: false,
      enumerable: true
    })
  })

  return app as T & MixinHelpWithParamater<M>
}

export function typedForIn<T extends NonNullable<object>>(obj: T, callback: (key: keyof T, value: T[keyof T]) => void) {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      callback(key satisfies keyof T, obj[key satisfies keyof T])
    }
  }
}

export function stackMatrixTransform(graph: S, e: number, f: number, scale: number) {
  graph.x = graph.x * scale + e
  graph.y = graph.y * scale + f
  graph.scaleX = scale
  graph.scaleY = scale
}

export function stackMatrixTransformWithGraphAndLayer(graphs: Display[], e: number, f: number, scale: number) {
  traverse(graphs, (graph) => stackMatrixTransform(graph, e, f, scale))
}

interface EffectOptions {
  duration: number
  onStop?: () => void
  deps?: Array<() => boolean>
}

export function smoothFrame(callback: (progress: number, cleanup: () => void) => void, opts: EffectOptions) {
  const frame = createSmoothFrame()
  const startTime = Date.now()

  const condtion = (process: number) => {
    if (Array.isArray(opts.deps)) {
      return opts.deps.some((dep) => dep())
    }
    return process >= 1
  }

  frame.run(() => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(elapsed / opts.duration, 1)
    if (condtion(progress)) {
      frame.stop()
      if (opts.onStop) {
        opts.onStop()
      }
      return true
    }
    return callback(progress, frame.stop)
  })
}

interface DuckE {
  which: number
}

export function isScrollWheelOrRightButtonOnMouseupAndDown<E extends DuckE = DuckE>(e: E) {
  return e.which === 2 || e.which === 3
}

export class DefaultMap<K, V> extends Map<K, V> {
  private defaultFactory: () => V
  constructor(defaultFactory: () => V, entries?: readonly [K, V][] | null) {
    super(entries)
    this.defaultFactory = defaultFactory
  }
  get(key: K): V {
    if (!super.has(key)) {
      return this.defaultFactory()
    }
    return super.get(key)!
  }
  getOrInsert(key: K, value?: V): V {
    if (!super.has(key)) {
      const defaultValue = value || this.defaultFactory()
      super.set(key, defaultValue)
      return defaultValue
    }
    return super.get(key)!
  }
}
