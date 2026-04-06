/* eslint-disable @typescript-eslint/no-explicit-any */
import { Child, DeepOptionalProps, InferElement, VNode } from './h'

declare global {
  namespace JSX {
    type Element = VNode
    type SVGTag = keyof SVGElementTagNameMap
    export interface ElementChildrenAttribute {
      children: Child | Child[]
    }
    export type IntrinsicElements = {
      [K in ElementTag]: K extends keyof SVGElementTagNameMap ? DeepOptionalProps<SVGElementTagNameMap[K]>
        : K extends 'meta' ? DeepOptionalProps<HTMLMetaElement & { charSet: string, property: string }>
        : DeepOptionalProps<InferElement<K>> | ElementChildrenAttribute
    }
    export type ElementChildrenAttribute = {
      children: any
    }
  }
}

export {}
