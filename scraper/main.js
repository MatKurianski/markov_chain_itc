const puppeteer = require('puppeteer');
const argv = require('yargs').option('links', {
  type: 'array',
  desc: 'One or more apple types/colors'
}).argv
const fs = require('fs')
const chalk = require('chalk');

class Printer {
  static blue(text) {
    console.log(chalk.blue(text))
  }

  static green(text) {
    console.log(chalk.green(text))
  }
}

async function scrapeInfiniteScrollItems(page) {
    let currentHeight = 0 
    let same_height = 0

    await new Promise(resolve => {
      const interval = setInterval(async () => {
        await page.evaluate('window.scrollBy(400, 400)')
        const newHeight = await page.evaluate('document.body.scrollHeight')

        if(newHeight !== currentHeight) {
          currentHeight = newHeight
          same_height = 0
        } else same_height++
        if (same_height > 10) {
          clearInterval(interval)
          resolve()
        }
      }, 400)
    })
}

let browser = undefined

const scrapeComments = async (link) => {
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(0); 
  await page.goto(link);
  const session = await page.target().createCDPSession();
  await session.send('Page.enable');
  await session.send('Page.setWebLifecycleState', {state: 'active'});
  try {
    const linkComentarios = await page.$eval('a.iframe-modal.main-section__view-more', href => href.getAttribute('href'))
    await page.goto('https://produto.mercadolivre.com.br'+linkComentarios, { timeout: 0 })
    await scrapeInfiniteScrollItems(page)
    const ps = await page.$$eval('.review-element p', ps => ps.map(p => p.childNodes[0].textContent.trim()))
    await page.close()
    return ps
  } catch(e) { return [] }
}

async function getLinks() {
  const onSaleProducts = 'https://www.mercadolivre.com.br/ofertas?page='
  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(0); 
  const session = await page.target().createCDPSession();
  await session.send('Page.enable');
  await session.send('Page.setWebLifecycleState', {state: 'active'});

  const pages = argv.pages || 5

  Printer.blue(`Coletando produtos das primeiras ${pages} páginas de ofertas do dia...`)

  const allLinks = new Set()
  try {
    for (let i = 1; i <= pages; i++) {
      await page.goto(onSaleProducts+i, { timeout: 0 })
      const links = await page.$$eval('.promotion-item__link-container', links => links.map(link => link.getAttribute('href')))
      for (let link of links) allLinks.add(link)
    }
  } catch(e) { console.log(e) }
  await page.close()
  Printer.green('Coletado!')
  return Array.from(allLinks)
}

puppeteer.launch()
  .then(async br => {
    browser = br
    comments = ''
    const max_simultaneos = argv.max || 6
    const links = argv.links || await getLinks()
    Printer.blue('Iniciando web scraping dos comentários...')
    for(let i = 0; i < links.length;) {
      const funcoes = []
      while(funcoes.length < max_simultaneos && i < links.length) {
        funcoes.push(scrapeComments(links[i]))
        i++
      }
      Printer.blue(i+'/'+links.length+' itens carregados.')
      const extracted_comments = (await Promise.all(funcoes)).flat().join('\n')
      comments += extracted_comments + '\n'
    }
    await browser.close()
    fs.writeFileSync('../comments.txt', comments)
    Printer.green('Pronto!')
  })
