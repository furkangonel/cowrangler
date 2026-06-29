// Simulate ESM main process doing dynamic import
const mod = await import('pptxgenjs')
console.log('keys:', Object.keys(mod))
console.log('default type:', typeof mod.default)
const PptxGenJS = mod.default
try {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name:'COWR', width:13.333, height:7.5 })
  pptx.layout='COWR'
  const s = pptx.addSlide()
  // 1x1 red png
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  s.addImage({ data:'data:image/png;base64,'+png, x:0,y:0,w:13.333,h:7.5 })
  const buf = await pptx.write({ outputType:'nodebuffer' })
  console.log('write ok, type:', buf && buf.constructor && buf.constructor.name, 'len:', buf && buf.length)
} catch(e){ console.log('ERR:', e && e.message); console.log(e && e.stack) }
