// Vite asset import bildirimleri (renderer)
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}
declare module '*.webp' {
  const src: string
  export default src
}
// Vite ?url imports (e.g. the esbuild-wasm binary) resolve to a served asset URL.
declare module '*?url' {
  const src: string
  export default src
}
