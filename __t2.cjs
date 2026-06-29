const PptxGenJS = require('pptxgenjs')
const Ctor = PptxGenJS.default ?? PptxGenJS
console.log('require shape: default?', !!PptxGenJS.default, '| typeof PptxGenJS:', typeof PptxGenJS, '| typeof Ctor:', typeof Ctor)
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
;(async()=>{
  const pptx = new Ctor()
  const inW=13.333, inH=+(inW*(720/1280)).toFixed(3)
  pptx.defineLayout({name:'COWR',width:inW,height:inH}); pptx.layout='COWR'
  const s=pptx.addSlide(); s.addImage({data:'data:image/png;base64,'+png,x:0,y:0,w:inW,h:inH})
  const out='/tmp/__deck.pptx'
  const res = await pptx.writeFile({ fileName: out })
  const fs=require('fs')
  console.log('writeFile returned:', res, '| exists:', fs.existsSync(out), '| bytes:', fs.existsSync(out)&&fs.statSync(out).size)
})().catch(e=>{console.log('ERR',e.message)})
