# ASS Obfuscator

Cursed font subsetting for .ass subtitles.

It merges fonts referenced in a .ass subtitle in a single font, keeping only the glyphs used by the subtitle. Becuase fonts are merged, the glyphs need to be remapped to fit the subtitle's needs, so, "Z" might "é" if "Z" is not used in the subtitle but "é" is as in "café". As glyphs are changed it's needed to rewrite the subtitle to point to the proper glyphs, obfuscating it, thus the name "ASS obfuscator".

## CLI usage

```bash
ass-obfuscator [path to subtitle] --folder [path to folder with fonts]
```

- `--folder`: folder with fonts; can repeat; if it's not specified it will try to guess the system font folder
- `--target-dir`: target file directory, defaults to current directory
- `--target-path`: target subtitle path, defaults to `[target dir]/[original name].min.ass`
- `--font-name`: name of generated merged font, defaults to a random string
- `--font-path`: target font path, defaults to `[target dir]/[name of target subtitle].ttf`
- `--fallback-font`: font to use as fallback, defaults to `Arial` per ASS spec

Requires [FontForge](https://fontforge.org/) installed and available either in PATH or location defined by `FONTFORGE_PATH` environment variable.

It will create and delete temporary files inside the current directory (`temporary-fontforge-script.ff` and `temporary-font-*.ttf`). If someone prefers using a proper temporary folder, send a PR.

## Programatic usage

See cli.js, it's really small. Notice it's a ES module, you need to call `const {default: obfuscate} = await import('@qgustavor/ass-obfuscator')` when calling it from CommonJS.

## Why?!

Why not?

## Warning

That's cursed: a research was done by taking an anime episode and minifying with this tool, 1/3 of the participants said they could not watch the video. From that it's quite possible that a lot of people have issues configuring their players to load embedded fonts in videos. As a solution for this problem you can use the most cursed solution ever: just hardsub subtitles and wreck up with your encoder entropy.

Font subsetting is useful and is used by Chinese because Chinese fonts are extremely huge, so it's kinda a necessity. *On the other hand* merging multiple fonts into one can lead to issues and is the most cursed part. Surely, it helps reducing the total size because a lot of font metadata gets deduplicated in the process, but it's still cursed. Probably illegal too if fonts are licensed in a way they cannot be modified and/or require credits. Well, in the last case just include the font credits... maybe. If someone wish they can send a pull request removing font merging, but why? Just download the font subsetting script from the Chinese groups. It's in Chinese, but... ¯\\\_(ツ)_/¯
