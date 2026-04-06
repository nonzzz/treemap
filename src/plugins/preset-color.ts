import type { ColorMappings } from '../component'
import type { ColorDecoratorResultHLS } from '../etoile/native/runtime'
import type { LayoutModule } from '../primitives/squarify'
import { hashCode } from '../shared'
import { definePlugin } from '../shared/plugin-driver'

// Golden angle — sequential application gives maximally distinct hues
const GOLDEN_ANGLE = 137.508

// Hue bands that look washed-out or neon-ugly in HSL; snap to nearest clean hue
const AVOID_RANGES: Array<[number, number, number]> = [
  [55, 70, 50], // chartreuse → snap toward yellow
  [165, 195, 205] // cyan-green → snap toward sky-blue
]

export const presetColorPlugin = definePlugin({
  name: 'treemap:preset-color',
  onModuleInit(modules) {
    const colorMappings: ColorMappings = {}

    for (let i = 0; i < modules.length; i++) {
      const module = modules[i]
      const seed = Math.abs(hashCode(module.node.id))
      const rootHue = (seed * GOLDEN_ANGLE) % 360
      assignColorMappings(colorMappings, module, rootHue, 0, i, 1)
    }

    return { colorMappings }
  }
})

function assignColorMappings(
  colorMappings: ColorMappings,
  module: LayoutModule,
  ancestorHue: number,
  depth: number,
  siblingIndex: number,
  siblingCount: number
) {
  // Position-based spread fans siblings evenly across ±45°; tiny hash nudge ensures uniqueness
  const posSpread = siblingCount > 1 ? 90 * (siblingIndex / (siblingCount - 1)) - 45 : 0
  const hashNudge = (Math.abs(hashCode(module.node.id)) % 10) - 5
  const hue = avoidMuddyHues(((ancestorHue + posSpread + hashNudge) % 360 + 360) % 360)

  // High saturation for vivid look, but capping at 88 avoids eye strain
  const saturation = Math.max(88 - depth * 5, 65)
  // Start bright enough for dark text (≥50%), step up gently with depth
  const lightness = Math.min(52 + depth * 3, 64)

  colorMappings[module.node.id] = makeHSL(hue, saturation, lightness)

  if (module.node.isCombinedNode && module.node.originalNodes) {
    for (const combined of module.node.originalNodes) {
      colorMappings[combined.id] = colorMappings[module.node.id]
    }
  }

  if (module.children && module.children.length) {
    const childCount = module.children.length
    for (let i = 0; i < childCount; i++) {
      assignColorMappings(colorMappings, module.children[i], hue, depth + 1, i, childCount)
    }
  }
}

function avoidMuddyHues(hue: number): number {
  for (const [lo, hi, target] of AVOID_RANGES) {
    if (hue >= lo && hue <= hi) {
      return (hue - lo) < (hi - hue) ? target : target + (hi - lo)
    }
  }
  return hue
}

function makeHSL(hue: number, saturation: number, lightness: number): ColorDecoratorResultHLS {
  return {
    mode: 'hsl',
    desc: {
      h: ((hue % 360) + 360) % 360,
      s: Math.min(Math.max(saturation, 62), 88),
      l: Math.min(Math.max(lightness, 48), 66)
    }
  }
}
