/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable no-use-before-define */
import { Box, Schedule } from './etoile'
import type { ColorDecoratorResult } from './etoile/native/runtime'
import type { GraphicConfig, GraphicFont, GraphicLayout, Series } from './interface'
import type { LayoutModule } from './primitives/squarify'
import { squarify } from './primitives/squarify'
import type { NativeModule } from './primitives/struct'
import { DefaultMap, createRoundBlock, createTitleText } from './shared'
import { createLogger } from './shared/logger'
import { PluginDriver } from './shared/plugin-driver'

export const logger = createLogger('Treemap')

export type ColorMappings = Record<string, ColorDecoratorResult>

const DEFAULT_RECT_FILL_DESC: ColorDecoratorResult = {
  mode: 'rgb',
  desc: { r: 0, g: 0, b: 0 }
}

export const DEFAULT_TITLE_AREA_HEIGHT: Series<number> = {
  min: 30,
  max: 60
}

export const DEFAULT_RECT_GAP = 4

export const DEFAULT_RECT_BORDER_RADIUS = 4

const DEFAULT_FONT_SIZE: Series<number> = {
  max: 70,
  min: 12
}

export const DEFAULT_FONT_FAMILY = 'sans-serif'

export const DEFAULT_FONT_COLOR = '#000'

// I don't have enough experience but I think using AABB to optimize font is a good choice.

export interface AABB {
  x: number
  y: number
  width: number
  height: number
}

export class Component extends Schedule {
  pluginDriver: PluginDriver<Component>
  data: NativeModule[]
  colorMappings: ColorMappings
  rectLayer: Box
  textLayer: Box
  layoutNodes: LayoutModule[]
  config: GraphicConfig
  caches: DefaultMap<string, number>

  constructor(config: GraphicConfig, ...args: ConstructorParameters<typeof Schedule>) {
    super(...args)
    this.data = []
    this.config = config
    this.colorMappings = {}
    this.pluginDriver = new PluginDriver(this)
    this.rectLayer = new Box()
    this.textLayer = new Box()
    this.caches = new DefaultMap(() => 14)
    this.layoutNodes = []
  }

  clearFontCacheInAABB(aabb: AABB) {
    const affectedModules = this.getModulesInAABB(this.layoutNodes, aabb)
    for (const module of affectedModules) {
      this.caches.delete(module.node.id)
    }
  }

  private getModulesInAABB(modules: LayoutModule[], aabb: AABB): LayoutModule[] {
    const result: LayoutModule[] = []

    for (const module of modules) {
      const [x, y, w, h] = module.layout
      const moduleAABB: AABB = { x, y, width: w, height: h }
      if (this.isAABBIntersecting(moduleAABB, aabb)) {
        result.push(module)
        if (module.children && module.children.length > 0) {
          result.push(...this.getModulesInAABB(module.children, aabb))
        }
      }
    }
    return result
  }

  getViewportAABB(matrixE: number, matrixF: number): AABB {
    const { width, height } = this.render.options

    const viewportX = -matrixE
    const viewportY = -matrixF
    const viewportWidth = width
    const viewportHeight = height

    return {
      x: viewportX,
      y: viewportY,
      width: viewportWidth,
      height: viewportHeight
    }
  }

  private getAABBUnion(a: AABB, b: AABB): AABB {
    const minX = Math.min(a.x, b.x)
    const minY = Math.min(a.y, b.y)
    const maxX = Math.max(a.x + a.width, b.x + b.width)
    const maxY = Math.max(a.y + a.height, b.y + b.height)

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }

  handleTransformCacheInvalidation(
    oldMatrix: { e: number, f: number },
    newMatrix: { e: number, f: number }
  ) {
    const oldViewportAABB = this.getViewportAABB(oldMatrix.e, oldMatrix.f)
    const newViewportAABB = this.getViewportAABB(newMatrix.e, newMatrix.f)

    const affectedAABB = this.getAABBUnion(oldViewportAABB, newViewportAABB)

    this.clearFontCacheInAABB(affectedAABB)
  }

  private isAABBIntersecting(a: AABB, b: AABB): boolean {
    return !(
      a.x + a.width < b.x ||
      b.x + b.width < a.x ||
      a.y + a.height < b.y ||
      b.y + b.height < a.y
    )
  }

  private drawRoundRect(node: LayoutModule) {
    const [x, y, w, h] = node.layout
    const { rectRadius } = node.config

    const effectiveRadius = Math.min(
      rectRadius,
      w / 4,
      h / 4
    )
    const fill = this.colorMappings[node.node.id] || DEFAULT_RECT_FILL_DESC

    const rect = createRoundBlock(x, y, w, h, {
      fill,
      padding: 0,
      radius: effectiveRadius
    })

    this.rectLayer.add(rect)
    for (const child of node.children) {
      this.drawRoundRect(child)
    }
  }
  private drawText(node: LayoutModule) {
    if (!node.node.label && !node.node.isCombinedNode) { return }

    const [x, y, w, h] = node.layout
    const { titleAreaHeight } = node.config
    const content: string = node.node.isCombinedNode ? `+ ${node.node.originalNodeCount} Modules` : node.node.label
    const availableHeight = node.children && node.children.length > 0
      ? titleAreaHeight - DEFAULT_RECT_GAP * 2
      : h - DEFAULT_RECT_GAP * 2
    const availableWidth = w - DEFAULT_RECT_GAP * 2
    if (availableWidth <= 0 || availableHeight <= 0) { return }

    const config: Required<GraphicFont> = {
      fontSize: this.config.font?.fontSize || DEFAULT_FONT_SIZE,
      family: this.config.font?.family || DEFAULT_FONT_FAMILY,
      color: this.config.font?.color || DEFAULT_FONT_COLOR
    }

    const optimalFontSize = this.caches.getOrInsert(
      node.node.id,
      evaluateOptimalFontSize(
        this.render.ctx,
        content,
        config,
        availableWidth,
        availableHeight
      )
    )
    const font = `${optimalFontSize}px ${config.family}`
    this.render.ctx.font = font

    const result = getTextLayout(this.render.ctx, content, availableWidth, availableHeight)
    if (!result.valid) { return }
    const { text } = result

    const textX = x + Math.round(w / 2)
    const textY = y + (node.children && node.children.length > 0
      ? Math.round(titleAreaHeight / 2)
      : Math.round(h / 2))
    const textComponent = createTitleText(text, textX, textY, font, config.color)
    this.textLayer.add(textComponent)
    for (const child of node.children) {
      this.drawText(child)
    }
  }
  draw(flush = true, update = true) {
    // prepare data
    const { width, height } = this.render.options

    if (update) {
      this.layoutNodes = this.calculateLayoutNodes(this.data, { w: width, h: height, x: 0, y: 0 })
    }

    if (flush) {
      const result = this.pluginDriver.cascadeHook('onModuleInit', this.layoutNodes)
      if (result) {
        this.colorMappings = result.colorMappings || {}
      }
    }
    for (const node of this.layoutNodes) {
      this.drawRoundRect(node)
    }

    for (const node of this.layoutNodes) {
      this.drawText(node)
    }
    this.add(this.rectLayer, this.textLayer)
    if (update) {
      this.update()
    }
  }
  cleanup() {
    this.remove(this.rectLayer, this.textLayer)
    this.rectLayer.destory()
    this.textLayer.destory()
  }
  calculateLayoutNodes(data: NativeModule[], rect: Parameters<typeof squarify>[1], scale = 1) {
    const config: Required<GraphicLayout> = {
      titleAreaHeight: this.config.layout?.titleAreaHeight ?? DEFAULT_TITLE_AREA_HEIGHT,
      rectRadius: this.config.layout?.rectRadius ?? DEFAULT_RECT_BORDER_RADIUS,
      rectGap: this.config.layout?.rectGap ?? DEFAULT_RECT_GAP
    }
    const layoutNodes = squarify(data, rect, config, scale)
    const result = this.pluginDriver.cascadeHook('onLayoutCalculated', layoutNodes, rect, config)
    if (result && result.layoutNodes?.length) {
      return result.layoutNodes
    }
    return layoutNodes
  }
}

export function evaluateOptimalFontSize(
  c: CanvasRenderingContext2D,
  text: string,
  config: Required<GraphicFont>,
  desiredW: number,
  desiredH: number
) {
  desiredW = Math.floor(desiredW)
  desiredH = Math.floor(desiredH)
  const { fontSize, family } = config
  let min = fontSize.min
  let max = fontSize.max

  while (max - min >= 1) {
    const current = min + (max - min) / 2
    c.font = `${current}px ${family}`

    const textWidth = c.measureText(text).width
    const metrics = c.measureText(text)
    const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent

    if (textWidth <= desiredW && textHeight <= desiredH) {
      min = current
    } else {
      max = current
    }
  }

  return Math.floor(min)
}
interface TextLayoutResult {
  valid: boolean
  text: string
  width: number
  direction: 'horizontal' | 'vertical'
}

export function getTextLayout(c: CanvasRenderingContext2D, text: string, width: number, height: number): TextLayoutResult {
  const textWidth = c.measureText(text).width
  const metrics = c.measureText(text)
  const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent

  if (textHeight > height) {
    return { valid: false, text: '', direction: 'horizontal', width: 0 }
  }

  if (textWidth <= width) {
    return { valid: true, text, direction: 'horizontal', width: textWidth }
  }

  const ellipsisWidth = c.measureText('...').width
  if (width <= ellipsisWidth) {
    return { valid: false, text: '', direction: 'horizontal', width: 0 }
  }

  let left = 0
  let right = text.length
  let bestFit = ''

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const substring = text.substring(0, mid)
    const subWidth = c.measureText(substring).width

    if (subWidth + ellipsisWidth <= width) {
      bestFit = substring
      left = mid + 1
    } else {
      right = mid - 1
    }
  }

  return bestFit.length > 0
    ? { valid: true, text: bestFit + '...', direction: 'horizontal', width }
    : { valid: true, text: '...', direction: 'horizontal', width: ellipsisWidth }
}
