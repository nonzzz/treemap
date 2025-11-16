import { Box } from './box'
import { Display, DisplayType, Graph } from './display'
import { RoundRect } from './rect'
import { Text } from './text'

export function isGraph(display: Display): display is Graph {
  return display.__instanceOf__ === DisplayType.Graph
}

export function isBox(display: Display): display is Box {
  return display.__instanceOf__ === DisplayType.Box
}

export function isRoundRect(display: Display): display is RoundRect {
  return isGraph(display) && display.__shape__ === DisplayType.RoundRect
}

export function isText<T extends Any = Any>(display: Display): display is Text<T> {
  return isGraph(display) && display.__shape__ === DisplayType.Text
}

export const asserts = {
  isGraph,
  isBox,
  isText,
  isRoundRect
}
