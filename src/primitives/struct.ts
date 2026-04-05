/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Box } from '../etoile'
import { Display } from '../etoile/graph/display'
import type { BBox } from '../etoile/native/dom'
import { perferNumeric } from '../shared'
import type { LayoutModule } from './squarify'

export function sortChildrenByKey<T extends AnyObject, K extends keyof T = 'weight'>(data: T[], ...keys: K[]) {
  return data.sort((a, b) => {
    for (const key of keys) {
      const v = a[key]
      const v2 = b[key]
      if (perferNumeric(v) && perferNumeric(v2)) {
        if (v2 > v) { return 1 }
        if (v2 < v) { return -1 }
        continue
      }
      // Not numeric, compare as string
      const comparison = ('' + v).localeCompare('' + v2)
      if (comparison !== 0) { return comparison }
    }
    return 0
  })
}

export function c2m<T extends AnyObject & { groups: Any[] }, K extends keyof T>(
  data: T,
  key: K,
  modifier?: (data: T) => T
): T & { weight: number } {
  if (Array.isArray(data.groups)) {
    data.groups = sortChildrenByKey(data.groups.map((d) => c2m(d as T, key as string, modifier)), 'weight')
  }
  const obj = { ...data, weight: data[key] }
  if (modifier) {
    Object.assign(obj, modifier(obj))
  }
  return obj
}

export function flatten<T extends AnyObject & { groups: T[] }>(data: T[]) {
  const result: Omit<T, 'groups'>[] = []
  for (let i = 0; i < data.length; i++) {
    const { groups, ...rest } = data[i]
    result.push(rest)
    if (groups) {
      result.push(...flatten(groups))
    }
  }
  return result
}

export type Module = ReturnType<typeof c2m>

export function bindParentForModule<T extends Module & { parent: Module }>(modules: Module[], parent?: Module) {
  return modules.map((module) => {
    const next = { ...module }
    next.parent = parent
    if (next.groups && Array.isArray(next.groups)) {
      next.groups = bindParentForModule(next.groups, next)
    }
    return next as T
  })
}

export type NativeModule = ReturnType<typeof bindParentForModule>[number] & {
  id: string,
  parent: NativeModule | null,
  groups: NativeModule[]
}

export function getNodeDepth(node: NativeModule) {
  let depth = 0
  while (node.parent) {
    node = node.parent
    depth++
  }
  return depth
}

export function visit<T extends AnyObject>(
  data: T[],
  fn: (data: T) => boolean | void,
  getChildren: (data: T) => T[] | null | undefined = (d) => d.children as T[] | null | undefined
): T | null {
  if (!data) { return null }
  for (const d of data) {
    const children = getChildren(d)
    if (children) {
      const result = visit(children, fn, getChildren)
      if (result) { return result }
    }
    const stop = fn(d)
    if (stop) { return d }
  }
  return null
}

export function findRelativeNode(p: { x: number, y: number }, layoutNodes: LayoutModule[]) {
  return visit(layoutNodes, (node) => {
    const [x, y, w, h] = node.layout
    if (p.x >= x && p.y >= y && p.x < x + w && p.y < y + h) {
      return true
    }
  })
}

export function findRelativeNodeById(id: string, layoutNodes: LayoutModule[]) {
  return visit(layoutNodes, (node) => {
    if (node.node.id === id) {
      return true
    }
  })
}

export function findRelativeGraphicNode(bbox: BBox, graphics: Display[]): Box<LayoutModule> | null {
  return visit(
    graphics as unknown as Box<LayoutModule>[],
    (graphic) => {
      const widget = graphic.__widget__ as { layout?: number[] } | null | undefined
      if (Array.isArray(widget?.layout)) {
        const [x, y, w, h] = widget.layout
        return bbox.x >= x && bbox.y >= y && bbox.x < x + w && bbox.y < y + h
      }
    },
    (graphic) => (graphic as unknown as { elements?: Box<LayoutModule>[] }).elements
  )
}
