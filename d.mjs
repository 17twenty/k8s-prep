import puppeteer from 'puppeteer-core'
const b = await puppeteer.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']})
const p = await b.newPage()
await p.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 2 })
await p.goto('http://localhost:5177/chapter/g-review-the-promotion-like-a-deployment',{waitUntil:'domcontentloaded'})
await new Promise(r=>setTimeout(r,3000))
const h = await p.evaluateHandle(()=>[...document.querySelectorAll('article .type-label')].find(e=>e.textContent==='diff')?.parentElement)
const el = h.asElement()
if (!el) { console.log('diff block not rendered'); process.exit(1) }
await p.evaluate(e=>e.scrollIntoView({block:'center'}), el)
await new Promise(r=>setTimeout(r,400))
await el.screenshot({ path:'/tmp/diffblock.png' })
console.log('numbered gutter present:', await p.evaluate(e=>/^\s*1\s/.test(e.innerText), el))
await b.close()
