/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-use-before-define */
// preact is fine, but i won't need it for the project.
// Note: This is a minimal implementation that only do jsx to html string conversion.

export type HTMLTag = keyof HTMLElementTagNameMap

export type ProprsWithChildren<P = unknown> = P & { children?: Child | Child[] }

export type Component<P = any> = (props: ProprsWithChildren<P>) => VNode

export type Child = string | number | boolean | null | undefined | VNode

export type DeepOptionalProps<T> = {
  [K in keyof T]?: T[K] extends object ? DeepOptionalProps<T[K]> : T[K]
}

export type InferElement<T extends HTMLTag> = HTMLElementTagNameMap[T]

export interface VNode<P = any> {
  type: HTMLTag | Component<P> | 'svg'
  props: ProprsWithChildren<P>
  children: Child[]
  __id__?: string
}

export type JSXElement<E extends HTMLTag | Component> = E extends HTMLTag ? VNode<DeepOptionalProps<InferElement<E>>>
  : E extends Component<infer P> ? VNode<P>
  : never

export function h<T extends HTMLTag | Component>(
  type: T,
  props: T extends FragmentType ? null
    : T extends HTMLTag ? (DeepOptionalProps<InferElement<T>> | null)
    : T extends Component<infer P> ? P
    : never,
  ...children: Child[]
): JSXElement<T> {
  return {
    type,
    props: props || null,
    children: children.flat().filter(Boolean)
  } as JSXElement<T>
}

export const Fragment = Symbol('Fragment') as unknown as Component<any>
export type FragmentType = typeof Fragment

function normalizeKey(key: string, isSvg: boolean): string {
  if (isSvg) {
    const svgSpecialCases: Record<string, string> = {
      className: 'class',
      htmlFor: 'for',
      viewBox: 'viewBox',
      fillRule: 'fill-rule',
      clipRule: 'clip-rule',
      strokeWidth: 'stroke-width',
      strokeLinecap: 'stroke-linecap',
      strokeLinejoin: 'stroke-linejoin',
      strokeDasharray: 'stroke-dasharray',
      strokeDashoffset: 'stroke-dashoffset'
    }
    return svgSpecialCases[key] || key
  }
  const specialCases: Record<string, string> = {
    className: 'class',
    htmlFor: 'for',
    charSet: 'charset'
  }
  return specialCases[key] || key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

function renderProps(props: ProprsWithChildren<Record<string, any>>, isSvg: boolean): string {
  if (!props) { return '' }
  return Object.entries(props)
    .filter(([key]) => key !== 'children')
    .map(([key, value]) => {
      if (key === 'style' && typeof value === 'object') {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const style = Object.entries(value)
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          .map(([k, v]) => `${normalizeKey(k, isSvg)}:${v}`)
          .join(';')
        return `style="${style}"`
      }
      if (typeof value === 'boolean' && value) {
        return normalizeKey(key, isSvg)
      }
      if (typeof value === 'string' || typeof value === 'number') {
        return `${normalizeKey(key, isSvg)}="${value}"`
      }
      return ''
    })
    .filter(Boolean)
    .join(' ')
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const SVG_TAGS = new Set([
  'svg',
  'path',
  'rect',
  'circle',
  'line',
  'g',
  'defs',
  'pattern',
  'mask',
  'use',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'animate'
])

let onClientCallbacks: Array<() => void> = []

export function renderToString(node: VNode) {
  const { vnode } = processVNode(node)
  const callbacks = [...onClientCallbacks]
  onClientCallbacks = []
  return {
    html: processNodeToStr(vnode),
    onClientMethods: callbacks
  }
}

export function processNodeToStr(node: Child): string {
  if (node == null || typeof node === 'boolean') {
    return ''
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  const { type, props, children, __id__ } = node as VNode<unknown>

  const refAttr = __id__ ? `data-ref="${__id__}"` : ''

  if (type === Fragment) {
    return children.map(processNodeToStr).join('')
  }

  if (typeof type === 'function') {
    return processNodeToStr(type(props))
  }

  const isSvg = typeof type === 'string' && SVG_TAGS.has(type)

  const propsString = renderProps(props, isSvg)
  const childrenString = children.map(processNodeToStr).join('')

  // Self-closing tags
  const voidElements = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
  ])
  if (isSvg && type === 'svg') {
    return `<svg xmlns="${SVG_NAMESPACE}"${propsString ? ' ' + propsString : ''}${refAttr}>${childrenString}</svg>`
  }

  if (voidElements.has(type)) {
    return `<${type}${propsString ? ' ' + propsString : ''} ${refAttr}/>`
  }

  return `<${type}${propsString ? ' ' + propsString : ''} ${refAttr}>${childrenString}</${type}>`
}

export function processVNode(rootNode: VNode) {
  function processNode(node: VNode<unknown>): VNode<unknown> {
    if (typeof node.type === 'function') {
      const result = node.type(node.props)
      const processed = processNode(result)
      return processed
    }

    const processedNode = { ...node }

    processedNode.children = node.children.map((child) => {
      if (child && typeof child === 'object' && 'type' in child) {
        return processNode(child as VNode)
      }
      return child
    })

    return processedNode
  }

  const processedVNode = processNode(rootNode)
  return { vnode: processedVNode }
}

export function onClient(callback: () => void) {
  onClientCallbacks.push(callback)
}
