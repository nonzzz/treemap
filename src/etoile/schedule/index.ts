/* eslint-disable no-use-before-define */
import { applyCanvasTransform } from '../../shared'
import { Box, asserts } from '../graph'
import { Display } from '../graph/display'
import { Event } from '../native/event'
import type { DefaultEventDefinition } from '../native/event'
import { log } from '../native/log'
import { Matrix2D } from '../native/matrix'
import { Render } from './render'

import type { RenderViewportOptions } from './render'

export type ApplyTo = string | HTMLElement

export interface DrawGraphIntoCanvasOptions {
  c: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  dpr: number
}

// First cleanup canvas
export function drawGraphIntoCanvas(
  graph: Display,
  opts: DrawGraphIntoCanvasOptions,
  visibleSet?: Set<number>
) {
  const { ctx, dpr } = opts
  if (asserts.isGraph(graph) && visibleSet && !visibleSet.has(graph.id)) {
    return
  }
  ctx.save()
  if (asserts.isBox(graph)) {
    const elements = graph.elements
    const cap = elements.length

    for (let i = 0; i < cap; i++) {
      const element = elements[i]
      drawGraphIntoCanvas(element, opts, visibleSet)
    }
  }
  if (asserts.isGraph(graph)) {
    const matrix = graph.matrix.create({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    matrix.transform(graph.x, graph.y, graph.scaleX, graph.scaleY, graph.rotation, graph.skewX, graph.skewY)
    applyCanvasTransform(ctx, matrix, dpr)
    graph.render(ctx)
  }
  ctx.restore()
}

type BBox = { x: number, y: number, width: number, height: number }

function bboxIntersect(a: BBox, b: BBox) {
  return !(
    a.x + a.width < b.x ||
    a.x > b.x + b.width ||
    a.y + a.height < b.y ||
    a.y > b.y + b.height
  )
}

class QuadTree<T> {
  boundary: BBox
  capacity: number
  objects: Array<{ bbox: BBox, obj: T }>
  divided: boolean
  northeast?: QuadTree<T>
  northwest?: QuadTree<T>
  southeast?: QuadTree<T>
  southwest?: QuadTree<T>
  constructor(boundary: BBox, capacity: number = 8) {
    this.boundary = boundary
    this.capacity = capacity
    this.objects = []
    this.divided = false
  }
  insert(bbox: BBox, obj: T): boolean {
    if (!bboxIntersect(this.boundary, bbox)) {
      return false
    }
    if (this.objects.length < this.capacity) {
      this.objects.push({ bbox, obj })
      return true
    }
    if (!this.divided) {
      this.subdivide()
    }
    return (
      this.northeast!.insert(bbox, obj) ||
      this.northwest!.insert(bbox, obj) ||
      this.southeast!.insert(bbox, obj) ||
      this.southwest!.insert(bbox, obj)
    )
  }
  subdivide() {
    const { x, y, width, height } = this.boundary
    const hw = width / 2
    const hh = height / 2
    this.northeast = new QuadTree({ x: x + hw, y, width: hw, height: hh }, this.capacity)
    this.northwest = new QuadTree({ x, y, width: hw, height: hh }, this.capacity)
    this.southeast = new QuadTree({ x: x + hw, y: y + hh, width: hw, height: hh }, this.capacity)
    this.southwest = new QuadTree({ x, y: y + hh, width: hw, height: hh }, this.capacity)
    this.divided = true
  }
  query(range: BBox, found: T[] = []): T[] {
    if (!bboxIntersect(this.boundary, range)) { return found }
    for (const { bbox, obj } of this.objects) {
      if (bboxIntersect(bbox, range)) { found.push(obj) }
    }
    if (this.divided) {
      this.northeast!.query(range, found)
      this.northwest!.query(range, found)
      this.southeast!.query(range, found)
      this.southwest!.query(range, found)
    }
    return found
  }
}

function collectBoundingGraphics(graph: Display, parentMatrix?: Matrix2D) {
  const results: Array<{ bbox: BBox, obj: Display }> = []
  const matrix = parentMatrix ?? new Matrix2D()
  if (asserts.isGraph(graph)) {
    const x = graph.x ?? 0
    const y = graph.y ?? 0
    const width = graph.width ?? 0
    const height = graph.height ?? 0

    const p1 = matrix.transformPoint(x, y)
    const p2 = matrix.transformPoint(x + width, y + height)

    const bbox = <BBox> {
      x: Math.min(p1.x, p2.x),
      y: Math.min(p1.y, p2.y),
      width: Math.abs(p2.x - p1.x),
      height: Math.abs(p2.y - p1.y)
    }
    results.push({ bbox, obj: graph })
  }
  if (asserts.isBox(graph)) {
    const elements = graph.elements
    const cap = elements.length

    for (let i = 0; i < cap; i++) {
      const element = elements[i]
      results.push(...collectBoundingGraphics(element, matrix))
    }
  }
  return results
}

export class Schedule<D extends DefaultEventDefinition = DefaultEventDefinition> extends Box {
  render: Render
  to: HTMLElement
  event: Event<D>
  quadTree?: QuadTree<Display>
  constructor(to: ApplyTo, renderOptions: Partial<RenderViewportOptions> = {}) {
    super()
    this.to = typeof to === 'string' ? document.querySelector(to)! : to
    if (!this.to) {
      log.panic('The element to bind is not found.')
    }
    const { width, height } = this.to.getBoundingClientRect()
    Object.assign(renderOptions, { width, height }, { devicePixelRatio: window.devicePixelRatio || 1 })
    this.event = new Event()
    this.render = new Render(this.to, renderOptions as RenderViewportOptions)
  }

  update(buildQuadTree = false) {
    this.render.clear(this.render.options.width, this.render.options.height)
    const all = collectBoundingGraphics(this)
    const viewport = { x: 0, y: 0, width: this.render.options.width, height: this.render.options.height }
    if (buildQuadTree) {
      this.quadTree = new QuadTree<Display>(viewport)
      const cap = all.length
      for (let i = 0; i < cap; i++) {
        const { bbox, obj } = all[i]
        this.quadTree.insert(bbox, obj)
      }
    }
    let visibleSet = new Set<number>()
    if (this.quadTree) {
      const visible = this.quadTree.query(viewport)
      visibleSet = new Set(visible.map((g) => g.id))
    }
    this.execute(this.render, this, visibleSet)

    const matrix = this.matrix.create({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
    applyCanvasTransform(this.render.ctx, matrix, this.render.options.devicePixelRatio)
  }

  // execute all graph elements
  execute(render: Render, graph: Display = this, visibleSet?: Set<number>) {
    drawGraphIntoCanvas(graph, { c: render.canvas, ctx: render.ctx, dpr: render.options.devicePixelRatio }, visibleSet)
  }
}
