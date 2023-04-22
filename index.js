import globalCharacterMap from './character-map.js'
import assStringify from '@qgustavor/ass-stringify'
import assParser from '@qgustavor/ass-parser'
import childProcess from 'child_process'
import fontkit from 'fontkit'
import libjass from 'libjass'
import util from 'util'
import path from 'path'
import fs from 'fs/promises'

const FONTFORGE_PATH = process.env.FONTFORGE_PATH ?? 'fontforge'
const openFont = util.promisify(fontkit.open)
const execFile = util.promisify(childProcess.execFile)

async function processSubtitle (options) {
  const subtitle = options.subtitle
  const folders = options.folders

  if (typeof subtitle !== 'string' || !Array.isArray(folders)) {
    throw Error('Invalid arguments')
  }

  const targetDir = options.targetDir ?? process.cwd()
  const targetPath = options.targetPath ?? path.resolve(targetDir, path.basename(subtitle).replace(/([^.]+)$/, 'min.$1'))
  const targetFontName = options.fontName || Math.random().toString(36).substr(2).toUpperCase()
  const targetFontPath = options.fontPath || path.resolve(targetDir, path.basename(targetPath, path.extname(targetPath)) + '.ttf')

  const subtitleData = await fs.readFile(subtitle, 'utf-8')
  const parsedSubtitle = await libjass.ASS.fromString(subtitleData)

  const fontCharacters = {}
  for (const dialogue of parsedSubtitle.dialogues) {
    let font = dialogue.style.fontName
    for (const part of dialogue.parts) {
      if (part.constructor.name === 'Text') {
        fontCharacters[font] = (fontCharacters[font] || '') + part.value
      }
      if (part.constructor.name === 'FontName') {
        font = part.value
      }
    }
  }

  for (const font in fontCharacters) {
    fontCharacters[font] = Array.from(new Set(fontCharacters[font].split('').sort()))
  }

  const fontPaths = {}
  const FALLBACK_FONT = options.fallbackFont || 'Arial'

  for (const folder of folders) {
    const fontFiles = await fs.readdir(folder).catch(() => [])

    for (const file of fontFiles) {
      // Ignore not supported formats
      if (file.endsWith('.bak')) continue
      if (file.endsWith('.dat')) continue
      if (file.endsWith('.ini')) continue
      if (file.endsWith('.fon')) continue
      if (file.endsWith('.xml')) continue
      if (file.endsWith('.CompositeFont')) continue

      const fullPath = path.resolve(folder, file)
      const font = await openFont(fullPath).catch(() => null)
      if (font === null) {
        console.error('Error when loading', file)
        continue
      }
      if (fontCharacters[font.postscriptName]) fontPaths[font.postscriptName] = fullPath
      if (fontCharacters[font.fullName]) fontPaths[font.fullName] = fullPath

      if (fontCharacters[font.familyName] && !fontPaths[font.familyName]) {
        fontPaths[font.familyName] = fullPath
      }

      if (font.fullName === FALLBACK_FONT) {
        fontPaths[FALLBACK_FONT] = fullPath
      }
    }
  }

  let fallbackCharacters = ''
  for (const font in fontCharacters) {
    if (!fontPaths[font]) {
      console.error('Missing font:', font)
      fallbackCharacters += fontCharacters[font]
      delete fontCharacters[font]
    }
  }

  if (fallbackCharacters) {
    fontCharacters[FALLBACK_FONT] = Array.from(new Set(fallbackCharacters.split('')
      .concat(fontCharacters[FALLBACK_FONT] || []).sort()))
  }

  // Generate a character replacement map
  const characterMap = options.characterMap ?? globalCharacterMap

  let index = 0
  const fonts = Object.entries(fontCharacters)
    .sort((a, b) => b[1].length - a[1].length)
    .map(e => [
      e[0],
      fontPaths[e[0]],
      e[1],
      e[1].map(() => characterMap[index++])
    ])

  // Generate a temporary FontForge script
  // For each font
  //   Load it
  //   Subset it => https://stackoverflow.com/a/16674304
  //   Replace characters => SetGlyphName
  //   Save as a temporary file
  // Finally merge all temporary files into the final file

  // FIX ME: some replacements can override older replacements

  const fontScript = fonts.map((e, n) => `Open(${JSON.stringify(e[1])}, 1);
SelectAll();${e[2].map(e => `
SelectFewer(0u${e.charCodeAt(0).toString(16)});`).join('')}
DetachAndRemoveGlyphs();${
e[2].map((c, n) => `
Select(0u${c.charCodeAt(0).toString(16)});
SetUnicodeValue(0u${(n + 0xF100).toString(16)});`).join('')
}${e[2].map((c, n) => `
Select(0u${(n + 0xF100).toString(16)});
SetUnicodeValue(0u${e[3][n].charCodeAt(0).toString(16)});`).join('')}
ScaleToEm(1024);
Generate("temporary-font-${n}.ttf");
`).join('') + `Open("temporary-font-0.ttf", 1)
` + fonts.slice(1).map((e, n) => `MergeFonts("temporary-font-${n + 1}.ttf", 1);
`).join('') + `SetTTFName(0x409, 2, ${JSON.stringify(targetFontName)});
SetFontNames(${JSON.stringify(targetFontName)},${JSON.stringify(targetFontName)},${
  JSON.stringify(targetFontName)},"",${JSON.stringify(targetFontName)});
Generate(${JSON.stringify(targetFontPath)});
Quit(0);
`

  await fs.writeFile('temporary-fontforge-script.ff', fontScript)
  await execFile(FONTFORGE_PATH, ['-script', 'temporary-fontforge-script.ff'])

  let finalSubtitle = assParser(subtitleData)
  const finalStyles = finalSubtitle.find(({ section }) => section.includes('Styles'))
  const fontMap = {}

  for (const font of fonts) {
    fontMap[`font_${font[0]}`] = font
  }

  for (const style of finalStyles.body) {
    if (style.key !== 'Style') continue

    fontMap[style.value.Name] = fonts.find(e => e[0] === style.value.Fontname)
    style.value.Fontname = targetFontName
  }

  const finalEvents = finalSubtitle.find(({ section }) => section.includes('Events'))
  for (const event of finalEvents.body) {
    if (event.key !== 'Dialogue') continue

    let fontData = fontMap[event.value.Style]
    const parsedText = libjass.parser.parse(event.value.Text, 'dialogueParts')
    let fixedText = event.value.Text.replace(/\\fn[^\\}]+/g, '')

    for (const part of parsedText) {
      if (part.constructor.name === 'FontName') {
        fontData = fontMap[`font_${part.value}`]
      } else if (part.constructor.name === 'Text') {
        // FIX ME: use some ASS library instead of String.prototype.replace
        // There is ass-compiler, it handles tags, but it's lossy: it drops Aegisub data as an example
        fixedText = fixedText.replace(/^[^{]+|(?<=})[^{]+/g, e => e
          .replace(part.value, part.value.replace(/./g, e => fontData[3][fontData[2].indexOf(e)]))
        )
      }
    }

    event.value.Text = fixedText
  }

  finalSubtitle = assStringify(finalSubtitle)
  await fs.writeFile(targetPath, finalSubtitle)

  let startSize = 0
  let finalSize = 0
  for (const font of fonts) {
    startSize += (await fs.stat(font[1])).size
  }

  await fs.unlink('temporary-fontforge-script.ff')
  for (let i = 0; i < fonts.length; i++) {
    finalSize += (await fs.stat(`temporary-font-${i}.ttf`)).size
    await fs.unlink(`temporary-font-${i}.ttf`)
  }

  console.log('Start size:', startSize)
  console.log('Final size:', finalSize)
  console.log('Saved size:', startSize - finalSize)
  console.log('Saved size %:', ((startSize - finalSize) * 100 / startSize).toFixed(2))
}

export default processSubtitle
