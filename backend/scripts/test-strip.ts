const content = `## Account Executive - Italy
**Empresa:** gitlab
**Departamento:** EMEA - Commercial
**Ubicación:** Remoto
&lt;div class=&quot;content-intro&quot;&gt;&lt;p&gt;GitLab is the intelligent orchestration platform for DevSecOps.&lt;/p&gt;
&lt;p&gt;The same principles built into our products are reflected in how our team works: we embrace AI as a core productivity multiplier.
### Contacto
🔗 Postularse: https://job-boards.greenhouse.io/gitlab/jobs/8503792002`;

function stripMetadata(content: string, title: string): string {
  let result = content.replace(/\*{0,3}Contacto[\s\S]*/gi, '')
  const lines = result.split('\n')
  const filtered = lines.filter(l => {
    const t = l.trim()
    if (!t) return true
    if (t === title || t === `## ${title}`) return false
    if (/^\*\*Empresa/i.test(t)) return false
    if (/^\*\*Rol/i.test(t)) return false
    if (/^\*\*Ubicaci/i.test(t)) return false
    if (/^\*\*Modalidad/i.test(t)) return false
    if (/^\*\*Presupuesto/i.test(t)) return false
    if (/^\*\*Departamento/i.test(t)) return false
    if (/^🔗/i.test(t)) return false
    return true
  })
  return filtered.join('\n').trim()
}

console.log("=== RESULT ===")
console.log(stripMetadata(content, "Account Executive - Italy"))
