// Sets the icon and version strings of a Windows exe (what electron-builder's rcedit step does, without wine).
import fs from 'node:fs'
import * as PE from 'pe-library'
import * as ResEdit from 'resedit'
const [exe, ico, product, version] = process.argv.slice(2)
const pe = PE.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true })
const res = PE.NtExecutableResource.from(pe)
const icon = ResEdit.Data.IconFile.from(fs.readFileSync(ico))
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)
const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, icon.icons.map((i) => i.data))
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0]
const [a, b, c] = version.split('.').map(Number)
vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033)
vi.setStringValues({ lang: 1033, codepage: 1200 }, { ProductName: product, FileDescription: product, CompanyName: 'AZET LLC', LegalCopyright: 'GPL-3.0; Bitwarden Inc. and contributors; AZET LLC', OriginalFilename: `${product}.exe`, InternalName: product })
vi.outputToResourceEntries(res.entries)
res.outputResource(pe)
fs.writeFileSync(exe, Buffer.from(pe.generate()))
console.log('set icon and version on', exe)
