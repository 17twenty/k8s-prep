import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']})
const p = await b.newPage()
await p.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2 })
await p.goto('http://localhost:5177/chapter/g-turn-the-image-digest-into-a-promotion-pull-request',{waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,3000))
const el = await p.evaluateHandle(()=>{
  const l=[...document.querySelectorAll('article .type-label')].find(e=>e.textContent==='diff')
  return l.parentElement
})
await p.evaluate(e=>e.scrollIntoView({block:'center'}), el)
await new Promise(r=>setTimeout(r,400))
await el.asElement().screenshot({ path:'/tmp/diffblock.png' })
await b.close()
