// Turns a pinned bitwarden/clients checkout (GPL-3.0) into AZET Pass. Everything else stays byte-identical to upstream.
// What changes (each line is a PARITY row): R-numbers are in ~/Code/azet-suite/reference/azet-pass/PARITY.md.
//  - no commercially licensed code: bitwarden_license/ and @bitwarden/commercial-sdk-internal are removed (OSS build)
//  - default server: the one production region is https://pass.azet.io (our Cloudflare Worker)
//  - name: "Bitwarden" -> "AZET Pass" in every UI string table (trademark; file-and-sentence rule c)
//  - logo, shield mark and toolbar/app icons: our key mark in the same slots and pixel sizes (c)
//  - 변형 축: the item view shows TOTP codes without Premium
// usage: node rebrand.mjs <clients-checkout>
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2])
const here = path.dirname(new URL(import.meta.url).pathname)
const p = (...a) => path.join(root, ...a)
const edit = (file, fn) => {
  const before = fs.readFileSync(p(file), 'utf8')
  const after = fn(before)
  if (after === before) throw new Error(`rebrand: no change in ${file} (upstream moved?)`)
  fs.writeFileSync(p(file), after)
}
const BASE = 'https://pass.azet.io'

// 1. OSS only
fs.rmSync(p('bitwarden_license'), { recursive: true, force: true })
fs.writeFileSync(p('package.json'), fs.readFileSync(p('package.json'), 'utf8').replace(/\n\s*"@bitwarden\/commercial-sdk-internal": "[^"]*",/, ''))

// 2. default server
edit('libs/common/src/platform/services/default-environment.service.ts', (s) =>
  s.replace(/export const PRODUCTION_REGIONS: RegionConfig\[\] = \[[\s\S]*?\n\];/, `export const PRODUCTION_REGIONS: RegionConfig[] = [
  {
    key: Region.US,
    domain: "pass.azet.io",
    urls: {
      base: null,
      api: "${BASE}/api",
      identity: "${BASE}/identity",
      icons: "${BASE}/icons",
      webVault: "${BASE}",
      notifications: "${BASE}/notifications",
      events: "${BASE}/events",
      scim: null,
      send: "${BASE}/#/send/",
    },
  },
];`))

// 3. name in every string table (values only; keys, placeholders and URLs untouched)
const tables = ['apps/browser/src/_locales', 'apps/desktop/src/locales', 'apps/web/src/locales']
let renamed = 0
for (const dir of tables.map((d) => p(d)).filter(fs.existsSync)) {
  for (const lang of fs.readdirSync(dir)) {
    const f = path.join(dir, lang, 'messages.json')
    if (!fs.existsSync(f)) continue
    const j = JSON.parse(fs.readFileSync(f, 'utf8'))
    // Our server sends no mail, so the two sentences that promise an emailed hint say what happens instead (다름 b).
    const ko = lang === 'ko'
    if (j.masterPassHintText) j.masterPassHintText.message = ko ? '비밀번호 힌트는 이메일로 보내지지 않으니 마스터 비밀번호를 따로 적어 두세요. 최대 길이: $CURRENT$/$MAXIMUM$' : 'Password hints are not emailed, so write your master password down somewhere safe. $CURRENT$/$MAXIMUM$ character maximum.'
    if (j.enterYourAccountEmailAddressAndYourPasswordHintWillBeSentToYou) j.enterYourAccountEmailAddressAndYourPasswordHintWillBeSentToYou.message = ko ? 'AZET Pass는 비밀번호 힌트를 이메일로 보내지 않습니다.' : 'AZET Pass does not email password hints.'
    for (const v of Object.values(j)) {
      if (typeof v?.message === 'string' && v.message.includes('Bitwarden')) {
        v.message = v.message.replaceAll('Bitwarden', 'AZET Pass')
        // Korean particles: 비트워든 ends in a consonant, 패스 in a vowel
        if (ko) v.message = v.message.replace(/AZET Pass(은|을|과|으로|이 )/g, (m, x) => 'AZET Pass' + { '은': '는', '을': '를', '과': '와', '으로': '로', '이 ': '가 ' }[x])
        renamed++
      }
    }
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n')
  }
}
for (const m of ['apps/browser/src/manifest.json', 'apps/browser/src/manifest.v3.json']) {
  edit(m, (s) => s.replace('"id": "{446900e4-71c2-419f-a6a7-df9c091e268b}"', '"id": "pass@azet.io"').replaceAll('"Bitwarden Inc."', '"AZET LLC"').replace('"https://bitwarden.com"', '"https://azet.io"').replaceAll('"Bitwarden"', '"AZET Pass"'))
}
// Firefox built-in data consent (required for new add-ons since 2025-11-03; the key needs Firefox 140). What reaches
// pass.azet.io: the encrypted vault (logins, cards, identities), the account email, the sites saved in logins and the
// icon requests for them; client name, version and device type ride on every request (that type can only be optional).
edit('apps/browser/src/manifest.json', (s) => s.replace('"strict_min_version": "91.0"\n', `"strict_min_version": "140.0",
      "data_collection_permissions": {
        "required": ["authenticationInfo", "personallyIdentifyingInfo", "financialAndPaymentInfo", "browsingActivity"],
        "optional": ["technicalAndInteraction"]
      }\n`))

// 4. logo and mark in the same SVG slots (class names kept so theme colours apply as upstream)
const MARK = 'M13 1a8 8 0 1 1 0 16a8 8 0 0 1 0-16Zm0 5a3 3 0 1 0 0 6a3 3 0 0 0 0-6ZM11 16h4v15h-4ZM15 21h5v3.5h-5ZM15 26.5h4v3.5h-4Z'
const wm = JSON.parse(fs.readFileSync(path.join(here, 'brand/generated/wordmark.json'), 'utf8')) // "AZET Pass", 34 high
const pm = JSON.parse(fs.readFileSync(path.join(here, 'brand/generated/wordmark-pm.json'), 'utf8')) // "Password Manager"
// mark (26x32) at the left, wordmark after it, both scaled to the slot height; classes kept so theme colours apply
const logo = (cls, w, h, title, sub) => {
  const k = sub ? h * 0.62 / 34 : h / 34 // wordmark scale
  const m = (sub ? h * 0.66 : h) / 32 // mark scale
  const x = 26 * m + h * 0.2
  let body = `<path class="${cls}" fill-rule="evenodd" transform="scale(${m.toFixed(4)})" d="${MARK}"/>` +
    `<path class="${cls}" transform="translate(${x.toFixed(2)} 0) scale(${k.toFixed(4)})" d="${wm.path}"/>`
  if (sub) body += `<path class="${cls}" transform="translate(${x.toFixed(2)} ${(h * 0.6).toFixed(2)}) scale(${(h * 0.36 / 34).toFixed(4)})" d="${pm.path}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="none"><title>${title}</title>${body}</svg>`
}
const putSvg = (file, svgText) => edit(file, (s) => s.replace(/<svg[\s\S]*?<\/svg>/, svgText))
const svgs = 'libs/assets/src/svg/svgs/'
putSvg(svgs + 'bitwarden-logo.icon.ts', logo('tw-fill-marketing-logo', 290, 45, 'AZET Pass'))
putSvg(svgs + 'bitwarden-logo-beta.icon.ts', logo('tw-fill-marketing-logo', 120, 18, 'AZET Pass Beta'))
putSvg(svgs + 'password-manager.ts', logo('tw-fill-fg-nav', 200, 49, 'AZET Pass Password Manager', true))
putSvg(svgs + 'side-nav-logo.ts', logo('tw-fill-fg-nav', 153, 24, 'AZET Pass'))
putSvg(svgs + 'side-nav-logo-beta.ts', logo('tw-fill-fg-nav', 154, 24, 'AZET Pass Beta'))
putSvg(svgs + 'bitwarden-icon.ts', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none"><rect class="tw-fill-bw-blue" width="20" height="20" rx="3"/><path fill="#fff" fill-rule="evenodd" transform="translate(5.1 2) scale(0.5)" d="${MARK}"/></svg>`)
edit('libs/assets/src/svg/svgs/shield.ts', (s) =>
  s.replace(/<svg[\s\S]*?<\/svg>/, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 32" fill="none">
    <path class="tw-fill-fg-nav" fill-rule="evenodd" d="${MARK}"/>
  </svg>`))

// 5. toolbar icons, same file names and sizes as upstream
const img = p('apps/browser/src/images')
const tmp = path.join(here, 'brand/generated')
const sizes = new Set()
for (const f of fs.readdirSync(img)) {
  const m = f.match(/^icon(\d+)(_gray|_locked)?(_beta)?\.png$/)
  if (!m) continue
  sizes.add(m[1])
  const kind = m[2] === '_gray' ? 'gray' : m[2] === '_locked' ? 'locked' : 'blue'
  fs.copyFileSync(path.join(tmp, `${kind}-${m[1]}.png`), path.join(img, f))
}

// 5b. desktop app identity, update feed and icons (same files and sizes as upstream)
const eb = 'apps/desktop/electron-builder.json'
if (fs.existsSync(p(eb))) {
  const j = JSON.parse(fs.readFileSync(p(eb), 'utf8'))
  j.extraMetadata.name = 'azet-pass'
  j.productName = 'AZET Pass'
  j.appId = 'io.azet.pass'
  j.copyright = 'Copyright © 2015-2026 Bitwarden Inc. and contributors (GPL-3.0); AZET Pass changes © 2026 AZET LLC'
  j.publish = { provider: 'generic', url: `${BASE}/desktop` } // update feed on our server (Bitwarden: artifacts.bitwarden.com)
  fs.writeFileSync(p(eb), JSON.stringify(j, null, 2) + '\n')
  const res = p('apps/desktop/resources')
  const big = path.join(here, 'brand/generated') // made by brand/make-icons.sh (+ iconutil, magick); committed so CI needs no Mac tools
  for (const f of ['icon.icns', 'dmg.icns', 'icon.beta.icns', 'dmg.beta.icns']) fs.copyFileSync(path.join(big, 'icon.icns'), path.join(res, f))
  for (const f of ['icon.png', 'icon.beta.png']) fs.copyFileSync(path.join(big, 'blue-1024.png'), path.join(res, f))
  for (const f of ['icon.ico', 'icon.beta.ico']) fs.copyFileSync(path.join(big, 'icon.ico'), path.join(res, f))
  for (const dir of ['icons', 'icons_beta']) {
    for (const f of fs.readdirSync(path.join(res, dir))) {
      const m = f.match(/^(\d+)x\1\.png$/)
      if (m && fs.existsSync(path.join(big, `blue-${m[1]}.png`))) fs.copyFileSync(path.join(big, `blue-${m[1]}.png`), path.join(res, dir, f))
    }
  }
}

// 6. 변형 축: TOTP code in the item view on the free plan (Bitwarden: Premium only). Server side, every item
//    already carries organizationUseTotp=true, which opens the copy and autofill gates.
edit('libs/vault/src/cipher-view/login-credentials/login-credentials-view.component.html', (s) => {
  const a = s.indexOf('@if (cipher.login.totp) {')
  const b = s.indexOf('</bit-form-field>', a)
  return s.slice(0, a) + s.slice(a, b).replace(/\(isPremium\$ \| async\)/g, '(totpFree$ | async)') + s.slice(b)
})
edit('libs/vault/src/cipher-view/login-credentials/login-credentials-view.component.ts', (s) =>
  s.replace('  showPasswordCount: boolean = false;', '  // AZET 변형 축: verification codes are on the free plan\n  readonly totpFree$ = of(true);\n  showPasswordCount: boolean = false;')
   .replace(/import \{([^}]*)\} from "rxjs";/, (m, names) => names.includes(' of') || names.includes('of,') ? m : `import {${names.trimEnd()}, of } from "rxjs";`))

// ...and TOTP leaves the extension's list of Premium benefits
const prem = 'apps/browser/src/billing/popup/settings/premium-v2.component.html'
if (fs.existsSync(p(prem))) edit(prem, (s) => s.replace(/\s*<li>\s*\{\{ "premiumSignUpTotp" \| i18n \}\}\s*<\/li>/, ''))

// Windows cross-build from a Mac: we ship NSIS/portable only, so the Appx tool install (brew msix-packaging) is skipped
const nb = 'apps/desktop/desktop_native/build.js'
if (fs.existsSync(p(nb))) edit(nb, (s) => s.replace(/runCommand\("brew", \["install", "iinuwa\/msix-packaging-tap\/msix-packaging", "osslsigncode"\]\);/, '// AZET: no Appx packaging, so the msix/osslsigncode tools are not installed'))

// GPL-3.0 source offer where the reference shows its copyright line
const SRC = 'https://github.com/neulketing/azet-pass'
const about = 'apps/browser/src/tools/popup/settings/about-dialog/about-dialog.component.html'
if (fs.existsSync(p(about))) edit(about, (s) => s.replace('<p>&copy; Bitwarden Inc. 2015-{{ year }}</p>', `<p>&copy; Bitwarden Inc. 2015-{{ year }}, AZET LLC. GPL-3.0, source: <a href="${SRC}" target="_blank" rel="noreferrer">github.com/neulketing/azet-pass</a></p>`))
// frontend-layout is the web shell; anon-layout draws the footer of the login and sign-up screens (web and extension)
for (const foot of ['apps/web/src/app/layouts/frontend-layout.component.html', 'libs/components/src/anon-layout/anon-layout.component.html'])
  if (fs.existsSync(p(foot))) edit(foot, (s) => s.replace('<div bitTypography="body2">&copy; {{ year }} Bitwarden Inc.</div>', `<div bitTypography="body2">&copy; {{ year }} Bitwarden Inc., AZET LLC. GPL-3.0, <a href="${SRC}" target="_blank" rel="noreferrer">source</a></div>`))

// Purchase path: Bitwarden sends a self-hosted user to its cloud billing; AZET Pass Premium is an AZET licence key sold
// on azet.io and entered through the same "Upload your license file" dialog (server: POST /api/accounts/license).
const shp = 'apps/web/src/app/billing/individual/premium/self-hosted-premium.component'
if (fs.existsSync(p(shp + '.ts'))) {
  edit(shp + '.ts', (s) => s.replace(/this\.environmentService\.cloudWebVaultUrl\$\.pipe\(\s*map\(\(url\) => `\$\{url\}\/#\/settings\/subscription\/premium`\),\s*\)/g, 'of("https://azet.io/")'))
  edit(shp + '.html', (s) => s.replace('href="https://bitwarden.com/pricing/"', 'href="https://azet.io/"'))
}

// Sign-up and sign-in on our server: consent links are our terms and privacy policy; the passkey and SSO buttons go,
// because the server has neither (a click ended in a 404 and an "unexpected error" toast).
const swap = (file, pairs) => fs.existsSync(p(file)) && edit(file, (s) => pairs.reduce((t, [a, b]) => t.replace(a, b), s))
const LEGAL = [['"https://bitwarden.com/terms/"', '"https://azet.io/terms"'], ['"https://bitwarden.com/privacy/"', '"https://azet.io/privacy#pass"']]
// ...and the marketing-mail opt-in goes too: we send no newsletter (its unsubscribe link was bitwarden.com/email-preferences)
swap('libs/auth/src/angular/registration/registration-start/registration-start.component.html', [...LEGAL, ['<bit-form-control *ngIf="!isSelfHost">', '<bit-form-control *ngIf="false">']])
swap('apps/desktop/src/main/menu/menu.help.ts', LEGAL)
swap('libs/auth/src/angular/login/login.component.html', [[/\n\s*<div class="tw-text-center">\{\{ "or" \| i18n \}\}<\/div>[\s\S]*?\{\{ "useSingleSignOn" \| i18n \}\}\s*<\/button>/, '']])
swap('apps/web/src/index.html', [['<title page-title>Bitwarden Web vault</title>', '<title page-title>AZET Pass Web vault</title>']])

// 7. Theme: AZET family tokens (azet-suite design/dist, DESIGN-SPEC U10) on top of Bitwarden's colour variables, so every
//    component keeps its upstream layout. Brand blue -> AZET violet (solid #6a4ae6 / dark #9a82ff), greys -> AZET ink and
//    rules, dark surfaces -> ground #0c111d / card #161b26; buttons become pills. Korean keeps words whole.
const AZ_THEME = `
/* AZET Pass theme (rebrand.mjs section 7) */
:root {
  --color-brand-050: #f4f1ff; --color-brand-100: #ebe6ff; --color-brand-200: #d9d0ff; --color-brand-300: #bfb0ff;
  --color-brand-400: #9a82ff; --color-brand-500: #8467f5; --color-brand-600: #7456ef; --color-brand-700: #6a4ae6;
  --color-brand-700-rgb: 106, 74, 230; --color-brand-800: #5b3bd6; --color-brand-800-rgb: 91, 59, 214;
  --color-brand-900: #4a2fb0; --color-brand-950: #2a2350; --color-brand-950-rgb: 42, 35, 80;
  --color-gray-050: #f9fafb; --color-gray-100: #f2f4f7; --color-gray-200: #eaecf0; --color-gray-300: #d0d5dd;
  --color-gray-400: #98a2b3; --color-gray-500: #667085; --color-gray-600: #475467; --color-gray-700: #344054;
  --color-gray-800: #1d2939; --color-gray-900: #101828; --color-gray-950: #0c111d;
  --color-primary-100: 244 241 255; --color-primary-300: 191 176 255; --color-primary-600: 106 74 230; --color-primary-700: 91 59 214;
  --color-background-alt: 249 250 251; --color-background-alt2: 106 74 230; --color-background-alt3: 74 47 176; --color-background-alt4: 42 35 80;
  --color-text-main: 16 24 40; --color-text-muted: 102 112 133;
  --color-illustration-outline: 42 35 80; --color-illustration-bg-primary: 235 230 255; --color-illustration-bg-secondary: 217 208 255;
  --color-illustration-logo: 106 74 230; --color-marketing-logo: 106 74 230;
}
.theme_dark {
  --color-primary-100: 42 35 80; --color-primary-300: 91 59 214; --color-primary-600: 154 130 255; --color-primary-700: 173 153 255;
  --color-background: 22 27 38; --color-background-alt: 12 17 29; --color-background-alt2: 31 36 47; --color-background-alt3: 51 55 65; --color-background-alt4: 12 17 29;
  --color-text-main: 245 245 246; --color-text-muted: 148 150 156;
  --color-bg-primary: #161b26; --color-bg-secondary: #0c111d; --color-bg-tertiary: #0c111d; --color-bg-quaternary: #1f242f; --color-bg-inactive: #0c111d;
  --color-bg-brand-strong: #ad99ff;
  --color-illustration-outline: 154 130 255; --color-illustration-bg-primary: 42 35 80; --color-illustration-bg-secondary: 74 47 176;
}
html:lang(ko) body { word-break: keep-all; overflow-wrap: anywhere; }
`
edit('libs/components/src/tw-theme.css', (s) => s + AZ_THEME)
edit('libs/components/src/button/button.component.ts', (s) => s.replace('classes.push("tw-rounded-xl");', 'classes.push("tw-rounded-full"); // AZET: pill buttons'))

console.log(`rebrand: ${renamed} strings renamed, ${sizes.size} icon sizes, server ${BASE}`)
