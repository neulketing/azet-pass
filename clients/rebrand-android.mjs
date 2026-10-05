// Turns a pinned bitwarden/android checkout (GPL-3.0) into AZET Pass for Android. Everything else stays as upstream.
//  - default server: the US region is https://pass.azet.io
//  - app id io.azet.pass, name "AZET Pass" in every string table (Korean particles fixed), Bridge label
//  - launcher foreground, logo wordmark, logo icons and shield glyph: our key mark in the same vector slots
//  - 변형 축 needs no client change here: every TOTP gate is `isPremium || organizationUseTotp`, and the server
//    sends organizationUseTotp=true
// usage: node rebrand-android.mjs <android-checkout>
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2])
const here = path.dirname(new URL(import.meta.url).pathname)
const p = (...a) => path.join(root, ...a)
const edit = (file, fn) => {
  const before = fs.readFileSync(p(file), 'utf8')
  const after = fn(before)
  if (after === before) throw new Error(`rebrand-android: no change in ${file}`)
  fs.writeFileSync(p(file), after)
}
const MARK = 'M13 1a8 8 0 1 1 0 16a8 8 0 0 1 0-16Zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0-6ZM11 16h4v15h-4ZM15 21h5v3.5h-5ZM15 26.5h4v3.5h-4Z'
const wm = JSON.parse(fs.readFileSync(path.join(here, 'brand/generated/wordmark.json'), 'utf8'))

edit('data/src/main/kotlin/com/bitwarden/data/datasource/disk/model/EnvironmentUrlDataJson.kt', (s) =>
  s.replace('val DEFAULT_US: EnvironmentUrlDataJson =\n            EnvironmentUrlDataJson(base = "https://vault.bitwarden.com")',
    'val DEFAULT_US: EnvironmentUrlDataJson =\n            EnvironmentUrlDataJson(base = "https://pass.azet.io")'))
edit('app/build.gradle.kts', (s) => s.replace('applicationId = "com.x8bit.bitwarden"', 'applicationId = "io.azet.pass"'))
edit('app/src/main/AndroidManifest.xml', (s) => s.replace('android:label="Bitwarden Bridge"', 'android:label="AZET Pass Bridge"'))

// every string table of the password manager (the separate Authenticator app module is not shipped)
let renamed = 0
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.name === 'build' || e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
for (const mod of ['app', 'ui', 'core', 'data', 'network', 'cxf', 'authenticatorbridge']) {
  if (!fs.existsSync(p(mod))) continue
  for (const f of walk(p(mod)).filter((f) => /\/res\/values[^/]*\/strings[^/]*\.xml$/.test(f))) {
    const ko = /values-ko/.test(f)
    const s = fs.readFileSync(f, 'utf8')
    const out = s.replace(/>([^<]*Bitwarden[^<]*)</g, (m, t) => {
      renamed++
      let v = t.replaceAll('Bitwarden', 'AZET Pass')
      if (ko) v = v.replace(/AZET Pass(은|을|과|으로|이 )/g, (_, x) => 'AZET Pass' + { '은': '는', '을': '를', '과': '와', '으로': '로', '이 ': '가 ' }[x])
      return `>${v}<`
    })
    if (out !== s) fs.writeFileSync(f, out)
  }
}

// vectors: same files, same viewports
const vector = (w, h, body) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${w}dp"
    android:height="${h}dp"
    android:viewportWidth="${w}"
    android:viewportHeight="${h}">
${body}
</vector>
`
const mark = (color, scale, dx, dy) => `    <group android:translateX="${dx}" android:translateY="${dy}" android:scaleX="${scale}" android:scaleY="${scale}">
        <path android:fillColor="${color}" android:fillType="evenOdd" android:pathData="${MARK}"/>
    </group>`
// adaptive-icon foreground: 108 viewport, safe zone 66; mark 26x32 scaled to fill ~48 high
for (const f of ['app/src/main/res/drawable/ic_launcher_foreground.xml', 'app/src/release/res/drawable/ic_launcher_foreground.xml', 'app/src/beta/res/drawable/ic_launcher_foreground.xml'])
  if (fs.existsSync(p(f))) fs.writeFileSync(p(f), vector(108, 108, mark('#FFFFFF', 1.5, 34.5, 30)))
for (const f of ['app/src/main/res/drawable/ic_launcher_monochrome.xml', 'app/src/release/res/drawable/ic_launcher_monochrome.xml'])
  if (fs.existsSync(p(f))) fs.writeFileSync(p(f), vector(108, 108, mark('#000000', 1.5, 34.5, 30)))
const ui = 'ui/src/main/res/drawable'
fs.writeFileSync(p(ui, 'logo_bitwarden.xml'), vector(218, 34, mark('#175DDC', 34 / 32, 0, 0) +
  `\n    <group android:translateX="${(218 - wm.width).toFixed(1)}"><path android:fillColor="#175DDC" android:pathData="${wm.path}"/></group>`))
fs.writeFileSync(p(ui, 'logo_bitwarden_icon.xml'), vector(1024, 1024, `    <path android:fillColor="#175DDC" android:pathData="M184,0h656a184,184 0 0 1 184,184v656a184,184 0 0 1 -184,184h-656a184,184 0 0 1 -184,-184v-656a184,184 0 0 1 184,-184z"/>\n` + mark('#FFFFFF', 24, 200, 128)))
fs.writeFileSync(p(ui, 'logo_shield_icon.xml'), vector(108, 108, mark('#FFFFFF', 1.5, 34.5, 30)))
fs.writeFileSync(p(ui, 'ic_shield.xml'), vector(20, 20, mark('#000000', 0.56, 2.7, 1)))

console.log(`rebrand-android: ${renamed} strings renamed, server https://pass.azet.io, app id io.azet.pass`)
