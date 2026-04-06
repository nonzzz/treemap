/* eslint-disable @typescript-eslint/no-explicit-any */
import esbuild from 'esbuild'
import fs from 'fs'
import fsp from 'fs/promises'
import matter from 'gray-matter'
import markdownit from 'markdown-it'
import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import markdownhighlight from 'markdown-it-highlightjs'
import { Token } from 'markdown-it/index.js'
import { Mermaid } from 'mermaid'
import path from 'path'
import puppeteer, { ResponseForRequest } from 'puppeteer'
import { Browser } from 'puppeteer'
import { globSync } from 'tinyglobby'
import { injectHTMLTag } from 'vite-bundle-analyzer'
import { Fragment, h, onClient, renderToString } from './h'
/// <reference path="./jsx-namespace.d.ts" />

interface MarkdownFrontMatter {
  title: string
  level?: number
}

function hashCode(str: string) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    hash = (hash << 5) - hash + code
    hash = hash & hash
  }
  return hash
}

const mermaidContents: Record<string, string> = {}

function setupMermaid(md: MarkdownIt) {
  const defaultFenceRenderer = md.renderer.rules.fence || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }
  md.renderer.rules.fence = function(tokens, idx, options, env, self) {
    const token = tokens[idx]
    if (token.info === 'mermaid') {
      const code = token.content.trim()
      const hash = Math.abs(hashCode(code))
      mermaidContents['mermaid' + hash] = code
      return `<mermaid id="${`mermaid-` + hash}"></mermaid>`
    }
    return defaultFenceRenderer(tokens, idx, options, env, self)
  }
  return md
}

const md = markdownit({ html: true }).use(markdownItAnchor, {
  slugify: toID,
  permalink: markdownItAnchor.permalink.linkInsideHeader({
    symbol: '#',
    renderAttrs: () => ({ 'aria-hidden': 'true' })
  })
}).use(markdownhighlight, {}).use(setupMermaid)

const defaultWD = process.cwd()

const dirs = {
  docs: path.join(defaultWD, 'docs'),
  src: path.join(defaultWD, 'src'),
  dest: path.join(defaultWD, 'display'),
  example: path.join(defaultWD, 'dev'),
  script: __dirname
}

const target = ['chrome58', 'safari11', 'firefox57', 'edge16']

const pages = globSync('**/*.md', { cwd: path.join(defaultWD, 'docs') })

interface FormatedData {
  html: string
  title: string
  filePath: string
  frontmatter: MarkdownFrontMatter
  tokens: Token[]
}

const formatedPages = pages.map((page) => {
  const filePath = path.join(defaultWD, 'docs', page)
  const content = fs.readFileSync(filePath, 'utf8')
  const { data: frontmatter, content: markdownContent } = matter(content)
  return {
    html: md.render(markdownContent),
    title: path.basename(page, '.md'),
    filePath,
    frontmatter,
    tokens: md.parse(markdownContent, {})
  } as FormatedData
}).sort((a, b) => (a.frontmatter.level || 0) - (b.frontmatter.level || 0))

const commonCSS = minifyCSS(fs.readFileSync(path.join(dirs.script, 'style.css'), 'utf8'))

function minifyCSS(css: string) {
  return esbuild.transformSync(css, { target, loader: 'css', minify: true }).code
}

function buildAndMinifyJS(entry: string) {
  const r = esbuild.buildSync({
    bundle: true,
    format: 'iife',
    loader: {
      '.ts': 'ts'
    },
    define: {
      LIVE_RELOAD: 'false'
    },
    minify: true,
    write: false,
    entryPoints: [entry]
  })
  if (r.outputFiles.length) {
    return r.outputFiles[0].text
  }
  throw new Error('No output files')
}

interface HeadProps {
  title: string
}

export type Theme = 'light' | 'dark'

function pipeOriginalCSSIntoThemeSystem(css: string, theme: Theme) {
  let wrappered = ''
  if (theme === 'dark') {
    wrappered = `html[data-theme="dark"] { ${css} }\n`
  } else {
    wrappered = `html:not([data-theme="dark"]) { ${css} }\n`
  }

  return minifyCSS(wrappered)
}

const Icons = {
  Moon: () => (
    <svg id="theme-light" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
      <path
        fill="currentColor"
        d="M233.54 142.23a8 8 0 0 0-8-2a88.08 88.08 0 0
      1-109.8-109.8a8 8 0 0 0-10-10a104.84 104.84 0 0 0-52.91 37A104 104 0 0 0
      136 224a103.1 103.1 0 0 0 62.52-20.88a104.84 104.84 0 0 0 37-52.91a8 8 0
      0 0-1.98-7.98m-44.64 48.11A88 88 0 0 1 65.66 67.11a89 89 0 0 1
      31.4-26A106 106 0 0 0 96 56a104.11 104.11 0 0 0 104 104a106 106 0 0 0
      14.92-1.06a89 89 0 0 1-26.02 31.4"
      />
    </svg>
  ),
  Sun: () => (
    <svg id="theme-dark" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
      <path
        fill="currentColor"
        d="M120 40V16a8 8 0 0 1 16 0v24a8 8 0 0 1-16 0m72
      88a64 64 0 1 1-64-64a64.07 64.07 0 0 1 64 64m-16 0a48 48 0 1 0-48 48a48.05
      48.05 0 0 0 48-48M58.34 69.66a8 8 0 0 0 11.32-11.32l-16-16a8 8 0 0
      0-11.32 11.32Zm0 116.68l-16 16a8 8 0 0 0 11.32 11.32l16-16a8 8 0 0
      0-11.32-11.32M192 72a8 8 0 0 0 5.66-2.34l16-16a8 8 0 0 0-11.32-11.32l-16
      16A8 8 0 0 0 192 72m5.66 114.34a8 8 0 0 0-11.32 11.32l16 16a8 8 0 0 0
      11.32-11.32ZM48 128a8 8 0 0 0-8-8H16a8 8 0 0 0 0 16h24a8 8 0 0 0
      8-8m80 80a8 8 0 0 0-8 8v24a8 8 0 0 0 16 0v-24a8 8 0 0 0-8-8m112-88h-24a8
      8 0 0 0 0 16h24a8 8 0 0 0 0-16"
      />
    </svg>
  ),
  GitHub: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
      <path
        fill="currentColor"
        d="M208.31 75.68A59.78 59.78 0 0 0 202.93 28a8 8
      0 0 0-6.93-4a59.75 59.75 0 0 0-48 24h-24a59.75 59.75 0 0 0-48-24a8 8 0 0
      0-6.93 4a59.78 59.78 0 0 0-5.38 47.68A58.14 58.14 0 0 0 56 104v8a56.06
      56.06 0 0 0 48.44 55.47A39.8 39.8 0 0 0 96 192v8H72a24 24 0 0 1-24-24a40
      40 0 0 0-40-40a8 8 0 0 0 0 16a24 24 0 0 1 24 24a40 40 0 0 0 40 40h24v16a8
      8 0 0 0 16 0v-40a24 24 0 0 1 48 0v40a8 8 0 0 0 16 0v-40a39.8 39.8 0 0
      0-8.44-24.53A56.06 56.06 0 0 0 216 112v-8a58.14 58.14 0 0 0-7.69-28.32M200
      112a40 40 0 0 1-40 40h-48a40 40 0 0 1-40-40v-8a41.74 41.74 0 0 1
      6.9-22.48a8 8 0 0 0 1.1-7.69a43.8 43.8 0 0 1 .79-33.58a43.88 43.88 0 0 1
      32.32 20.06a8 8 0 0 0 6.71 3.69h32.35a8 8 0 0 0 6.74-3.69a43.87 43.87 0 0
      1 32.32-20.06a43.8 43.8 0 0 1 .77 33.58a8.09 8.09 0 0 0 1 7.65a41.7 41.7
      0 0 1 7 22.52Z"
      />
    </svg>
  ),
  Menu: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
      <path
        fill="#888888"
        d="M224 128a8 8 0 0 1-8 8H40a8 8 0 0 1 0-16h176a8 8 0 0 1 8 8M40 
  72h176a8 8 0 0 0 0-16H40a8 8 0 0 0 0 16m176 112H40a8 8 0 0 0 0 16h176a8 8 0 0 0 0-16"
      />
    </svg>
  )
}

const hljsPath = path.dirname(require.resolve('highlight.js/package.json', { paths: [defaultWD] }))

const hljsGitHubCSS = {
  light: pipeOriginalCSSIntoThemeSystem(fs.readFileSync(path.join(hljsPath, 'styles/github.css'), 'utf-8'), 'light'),
  dark: pipeOriginalCSSIntoThemeSystem(fs.readFileSync(path.join(hljsPath, 'styles/github-dark.css'), 'utf-8'), 'dark')
}

function Logo() {
  return (
    <svg
      className="logo"
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="4"
        y="4"
        width="32"
        height="32"
        rx="6"
        fill="var(--menu-bg)"
        stroke="var(--foreground-color)"
        strokeWidth="1.5"
      />
      <g>
        <rect
          x="8"
          y="8"
          width="11"
          height="11"
          fill="var(--foreground-color)"
          opacity="0.55"
        >
          <animateTransform
            attributeName="transform"
            type="scale"
            values="1;1.2;1"
            dur="3s"
            repeatCount="indefinite"
            additive="sum"
            calcMode="spline"
            keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
          />
        </rect>
        <rect
          x="21"
          y="8"
          width="11"
          height="11"
          fill="var(--foreground-color)"
          opacity="0.75"
        >
          <animate
            attributeName="width"
            values="11;8;11"
            dur="3s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
          />
          <animate
            attributeName="x"
            values="21;24;21"
            dur="3s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
          />
        </rect>
        <rect
          x="8"
          y="21"
          width="24"
          height="11"
          fill="var(--foreground-color)"
          opacity="0.85"
        >
          <animate
            attributeName="y"
            values="21;23;21"
            dur="2s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
          />
        </rect>
      </g>
    </svg>
  )
}

function Head(props: HeadProps) {
  const { title } = props
  return (
    <head>
      <meta charSet="utf-8" />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>squarified - {title}</title>
      <link rel="icon" type="image/svg+xml" href="/favicon.svg"></link>
      <meta property="og:type" content="website" />
      <meta property="og:title" content="squarified" />
      <meta name="og:description" content="A simple, fast, and lightweight layout algorithm for nested rectangles." />
      <style>
        {hljsGitHubCSS.light}
      </style>
      <style>
        {hljsGitHubCSS.dark}
      </style>
      <style>
        {commonCSS}
      </style>
    </head>
  )
}

interface HeadingBase {
  value: string
  id: string
}

interface HeadingMetadata extends HeadingBase {
  h3s: HeadingBase[]
}

interface HeadingStruct {
  key: string
  title: string
  h2s: HeadingMetadata[]
}

function toID(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '')
}

// #build-setup
function useTheme() {
  const darkMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const doc = document.documentElement
  const docDataset = doc.dataset
  const preferredDark = darkMediaQuery.matches || localStorage.getItem('theme') === 'dark'

  const updateTheme = function(theme: Theme) {
    localStorage.setItem('theme', theme)
    docDataset.theme = theme
  }

  const toggleTheme = function() {
    const theme = docDataset.theme === 'light' ? 'dark' : 'light'
    updateTheme(theme)
  }

  return { preferredDark, updateTheme, toggleTheme }
}

// #build-end

function Menu() {
  const structure: HeadingStruct[] = []
  for (const page of formatedPages) {
    if (page.title === 'index') { continue }

    const h2s: HeadingMetadata[] = []
    const root = { key: page.title, title: page.frontmatter.title, h2s }
    structure.push(root)

    let currentH2: HeadingMetadata | null = null

    for (let i = 0; i < page.tokens.length; i++) {
      const token = page.tokens[i]
      if (token.type === 'heading_open') {
        if (i + 1 < page.tokens.length && page.tokens[i + 1].type === 'inline') {
          const inlineToken = page.tokens[i + 1]
          const titleText = inlineToken.content
          const titleId = toID(titleText)
          if (token.tag === 'h2') {
            const h3s: HeadingBase[] = []
            currentH2 = { value: titleText, id: titleId, h3s }
            h2s.push(currentH2)
          } else if (token.tag === 'h3' && currentH2) {
            const h3: HeadingBase = { value: titleText, id: titleId }
            currentH2.h3s.push(h3)
          }
        }
      }
    }
  }

  onClient(() => {
    const { toggleTheme } = useTheme()
    const btn = document.querySelector<HTMLAnchorElement>('#theme-toggle')!
    btn.addEventListener('click', toggleTheme)
  })

  return (
    <aside>
      <nav id="menu">
        <div>
          <div id="widget">
            <a aria-label="Project Brand" href="./">
              <Logo />
            </a>
            <a aria-label="View this project on GitHub" href="https://github.com/nonzzz/squarified">
              <Icons.GitHub />
            </a>
            <a href="javascript:void(0)" aria-label="Toggle theme" id="theme-toggle">
              <Icons.Moon />
              <Icons.Sun />
            </a>
          </div>
          <ul>
            <li>
              <strong>
                <a href="./">Home</a>
              </strong>
            </li>
            {structure.map(({ key, title, h2s }) => (
              <Fragment>
                <li>
                  <strong>{title}</strong>
                </li>
                {h2s.map((h2) => (
                  <li>
                    <a href={key + '#' + h2.id}>{h2.value}</a>
                    {h2.h3s.length > 0 && (
                      <ul>
                        {h2.h3s.map((h3) => (
                          <li>
                            <a href={key + '#' + h3.id}>{h3.value}</a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </Fragment>
            ))}
            <li>
              <strong>
                <a href="example">Example</a>
              </strong>
            </li>
          </ul>
        </div>
      </nav>
    </aside>
  )
}

function Layout(props: FormatedData) {
  onClient(() => {
    const { preferredDark, updateTheme } = useTheme()
    updateTheme(preferredDark ? 'dark' : 'light')

    const menuButton = document.querySelector<HTMLAnchorElement>('#menu-toggle')!
    const shadow = document.querySelector<HTMLDivElement>('#shadow')!
    const sideMenu = document.querySelector<HTMLElement>('#menu')!

    menuButton.addEventListener('click', () => {
      sideMenu.classList.toggle('open')
      shadow.classList.toggle('open')
    })
    shadow.addEventListener('click', () => {
      sideMenu.classList.toggle('open')
      shadow.classList.toggle('open')
    })
  })

  return (
    <Fragment>
      <div id="menu-container">
        <a href="javascript:void(0)" id="menu-toggle">
          <Icons.Menu />
        </a>
      </div>
      <div id="shadow" />
      <main>
        {props.html}
      </main>
    </Fragment>
  )
}

let browser: Browser | null = null

function collectMermaidTags() {
  const regex = /<mermaid\s+id=["']mermaid-(\d+)["']\s*><\/mermaid>/g
  const collections: Array<{ id: string, code: string, belong: string }> = []

  for (const page of formatedPages) {
    let match
    while ((match = regex.exec(page.html)) !== null) {
      const index = match[1]
      const id = 'mermaid' + '-' + index
      const mermaidCode = mermaidContents['mermaid' + index]
      if (!mermaidCode) {
        continue
      }
      collections.push({ id, code: mermaidCode, belong: page.title })
    }
  }
  return collections
}

async function main() {
  const collections = collectMermaidTags()

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'Get',
    'Access-Control-Allow-Headers': 'Content-Type'
  }

  const responseBody: ResponseForRequest = {
    status: 200,
    body: '',
    headers,
    contentType: 'application/javascript'
  }

  const resolveMermaidChunk = (p: string) => {
    p = p.replace('http://mermaid/', 'mermaid/dist/')
    return fs.readFileSync(require.resolve(p))
  }

  try {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        defaultViewport: {
          width: 1280,
          height: 750
        }
      })
    }
    await Promise.all(collections.map(async ({ id, code, belong }) => {
      const page = await browser!.newPage()
      await page.setRequestInterception(true)
      page.on('request', (request) => {
        const url = request.url()

        if (url === 'http://mermaid/') {
          request.respond({ ...responseBody, body: resolveMermaidChunk(url + 'mermaid.esm.min.mjs') }).catch(() => {
            request.respond({
              status: 404,
              contentType: 'text/plain',
              body: 'Not Found!'
            }).catch(() => request.abort('failed'))
          })
        } else {
          if (url.includes('chunks/mermaid')) {
            request.respond({ ...responseBody, body: resolveMermaidChunk(url) }).catch(() => {
              request.respond({
                status: 404,
                contentType: 'text/plain',
                body: 'Not Found!'
              }).catch(() => request.abort('failed'))
            })
            return
          }
          request.continue().catch(() => {
            request.respond({
              status: 404,
              contentType: 'text/plain',
              body: 'Not Found!'
            }).catch(() => request.abort('failed'))
          })
        }
      })
      await page.addScriptTag({
        type: 'module',
        content: `
    import mermaid from 'http://mermaid';
    globalThis.mermaid = mermaid;
  `
      })
      await page.setContent(`<div id="${id}"></div>`)
      const svg = await page.$eval(
        '#' + id,
        async (el, code) => {
          const { mermaid } = globalThis as any as { mermaid: Mermaid }
          mermaid.initialize({
            theme: 'neutral',
            startOnLoad: false,
            securityLevel: 'loose',
            fontFamily: 'sans-serif'
          })
          const { svg: svgText } = await mermaid.render('graph', code, el)
          el.innerHTML = svgText

          const svg = el.getElementsByTagName?.('svg')?.[0]

          // svg.el
          const foreigon = svg.querySelectorAll('.label foreignObject')
          if (foreigon.length > 0) {
            foreigon.forEach((f) => {
              f.setAttribute('width', '200')
            })
          }

          if (svg.style) {
            svg.style.backgroundColor = 'transparent'
            svg.style.maxWidth = '750px'
          }

          return new XMLSerializer().serializeToString(svg)
        },
        code
      )
      formatedPages.find((p) => p.title === belong)!.html = formatedPages
        .find((p) => p.title === belong)!.html
        .replace(`<mermaid id="${id}"></mermaid>`, svg)
    }))
  } finally {
    if (browser) {
      await browser.close()
    }
  }

  for (const page of formatedPages) {
    const html: string[] = []
    html.push('<!DOCTYPE html>')
    const { html: s, onClientMethods } = renderToString(
      <html lang="en">
        <Head title={page.frontmatter.title} />
        <body>
          <Menu />
          <Layout {...page} />
        </body>
      </html>
    )

    html.push(s)
    html.push(`<script>
      ${captureConditionalCompile()}
      window.__MOUNTED_CALLBACKS__ = ${JSON.stringify(onClientMethods.map((c) => ({ f: c.toString() })))};
      window.addEventListener('DOMContentLoaded', () => {
         window.__MOUNTED_CALLBACKS__.forEach(({f}) => {
          const fn = new Function('return (' + f + ')();');
          fn();
         });
      });
    </script>`)

    if (!fs.existsSync(dirs.dest)) {
      fs.mkdirSync(dirs.dest)
    }
    if (!fs.existsSync(dirs.dest)) {
      fs.mkdirSync(dirs.dest)
    }

    await fsp.writeFile(path.join(dirs.dest, `${page.title}.html`), html.join(''), 'utf8')
  }
  const example = buildExampleDisplay()
  await fsp.copyFile(path.join(dirs.example, 'data.json'), path.join(dirs.dest, 'data.json'))
  await fsp.writeFile(path.join(dirs.dest, 'example.html'), example, 'utf8')
}

main().catch(console.error)

function buildExampleDisplay() {
  let html = fs.readFileSync(path.join(dirs.example, 'index.html'), 'utf8')
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  html = injectHTMLTag({
    html,
    injectTo: 'body',
    descriptors: {
      kind: 'script',
      text: buildAndMinifyJS(path.join(dirs.example, 'main.ts'))
    }
  })
  return html
}

function captureConditionalCompile() {
  const code = fs.readFileSync(__filename, 'utf8')
  const regex = /\/\/ #build-setup([\s\S]*?)\/\/ #build-end/g
  const matches = code.match(regex)
  if (matches && matches.length > 0) {
    const content = matches[0].replace(/\/\/ #build-setup/g, '').replace(/\/\/ #build-end/g, '')
    const result = esbuild.transformSync(content, { target, loader: 'ts', minify: true })
    if (result.code) {
      return result.code
    }
  }
  return ''
}
