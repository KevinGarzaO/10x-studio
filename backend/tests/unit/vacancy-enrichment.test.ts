import { describe, it, expect } from 'vitest'
import { cleanVacancyText, vacancyTitle, vacancyBody, vacancyHeader } from '../../services/vacancies/text'
import { inferSeniority } from '../../services/vacancies/seniority'
import { inferModality, modalityFromLabel, MODALITY_LABEL } from '../../services/vacancies/modality'
import { buildSkillMatchers, detectSkills, termsFor } from '../../services/vacancies/skill-detect'
import { SKILL_TERMS } from '../../services/vacancies/skill-terms'
import { enrichVacancy } from '../../services/vacancies/enrich'

const skills = (list: [string, string, string[]?, string[]?][]) =>
  buildSkillMatchers(list.map(([name, label, terms, roles]) => ({ name, label, detect_terms: terms, role_categories: roles })))

describe('cleanVacancyText', () => {
  it('decodes the escaped HTML the scraper stores and drops the tags', () => {
    const raw = '## Backend Engineer\n&lt;p&gt;We use &lt;strong&gt;Python&lt;/strong&gt; &amp; Docker.&lt;/p&gt;'
    expect(cleanVacancyText(raw)).toBe('## Backend Engineer\nWe use Python & Docker.')
  })

  it('handles entities escaped twice and numeric ones', () => {
    expect(cleanVacancyText('&amp;lt;b&amp;gt;hola&amp;lt;/b&amp;gt; &#241;')).toBe('hola ñ')
  })

  it('is safe with nothing', () => {
    expect(cleanVacancyText(null)).toBe('')
    expect(cleanVacancyText(undefined)).toBe('')
  })

  it('splits the title, the header and the body', () => {
    const raw = '## Data Engineer\n**Departamento:** Analytics\n**Ubicación:** Remoto\nBuild pipelines'
    expect(vacancyTitle(raw)).toBe('Data Engineer')
    expect(vacancyHeader(raw)).toBe('Data Engineer\nAnalytics')
    expect(vacancyBody(raw)).toContain('Build pipelines')
    expect(vacancyBody(raw)).not.toContain('Data Engineer')
  })
})

describe('inferSeniority', () => {
  it.each([
    ['Senior Backend Engineer', 'senior'],
    ['Sr. Accountant', 'senior'],
    ['Staff Software Engineer', 'senior'],
    ['Head of Product', 'senior'],
    ['Junior Developer', 'junior'],
    ['Marketing Intern', 'junior'],
    ['Becario de Finanzas', 'junior'],
    ['Desarrollador SSR', 'semi_senior'],
    ['Mid-Level Designer', 'semi_senior'],
  ])('reads "%s" as %s from the title', (title, level) => {
    expect(inferSeniority(title, '')).toBe(level)
  })

  it('reads the number that levels a position', () => {
    expect(inferSeniority('Software Engineer I', '')).toBe('junior')
    expect(inferSeniority('Software Engineer II', '')).toBe('semi_senior')
    expect(inferSeniority('Software Engineer III', '')).toBe('senior')
    expect(inferSeniority('Analyst 3', '')).toBe('senior')
  })

  it('falls back to the years of experience the text asks for', () => {
    expect(inferSeniority('Backend Engineer', 'You have 6+ years of experience building APIs')).toBe('senior')
    expect(inferSeniority('Backend Engineer', '3-5 years of experience required')).toBe('semi_senior')
    expect(inferSeniority('Backend Engineer', '1 year of professional experience')).toBe('junior')
    expect(inferSeniority('Desarrollador', 'Mínimo 4 años de experiencia')).toBe('semi_senior')
  })

  it('says it does not know instead of guessing "semi senior"', () => {
    expect(inferSeniority('Account Executive', 'We are a fast growing company')).toBeNull()
    expect(inferSeniority('Operations Specialist', '')).toBeNull()
  })

  it('lets the title win over the years in the body', () => {
    expect(inferSeniority('Junior Developer', '10+ years of experience with the company culture')).toBe('junior')
  })

  it('ignores an absurd number of years', () => {
    expect(inferSeniority('Analyst', 'Founded 150 years of experience ago')).toBeNull()
  })
})

describe('inferModality', () => {
  it('trusts what the source declares', () => {
    expect(inferModality('remote', null, 'on-site in Austin')).toBe('remote')
    expect(inferModality('hybrid', null, '')).toBe('hybrid')
    expect(inferModality('onsite', null, 'fully remote')).toBe('onsite')
  })

  it('reads the text when the source does not know', () => {
    expect(inferModality('unknown', null, 'This is a fully remote position')).toBe('remote')
    expect(inferModality('unknown', null, 'Modalidad híbrida, 3 días en oficina')).toBe('hybrid')
    expect(inferModality(null, null, 'Trabajo presencial en Monterrey')).toBe('onsite')
    expect(inferModality('unknown', 'Remote - US', '')).toBe('remote')
  })

  it('does not call a hybrid role remote because it mentions remote days', () => {
    expect(inferModality('unknown', null, 'Hybrid role: 3 days in office, 2 days remote')).toBe('hybrid')
  })

  it('stays unknown when nothing says', () => {
    expect(inferModality('unknown', 'Austin, TX', 'Join our team')).toBe('unknown')
  })

  it('translates between the stored vocabulary and the visible one', () => {
    expect(MODALITY_LABEL.remote).toBe('Remoto')
    expect(modalityFromLabel('Híbrido')).toBe('hybrid')
    expect(modalityFromLabel('Presencial')).toBe('onsite')
    expect(modalityFromLabel('No especificado')).toBe('unknown')
    expect(modalityFromLabel(null)).toBe('unknown')
  })
})

describe('detectSkills', () => {
  const catalog = skills([
    ['python', 'Python', ['python', 'django'], ['backend']],
    ['react', 'React', ['reactjs', '=React'], ['frontend']],
    ['nodejs', 'Node.js', ['node.js', 'nodejs'], ['backend']],
    ['csharp', 'C#', ['c#'], ['backend']],
    ['cpp', 'C++', ['c++'], ['backend']],
    ['java', 'Java', ['java'], ['backend']],
    ['javascript', 'JavaScript', ['javascript'], ['frontend']],
    ['recruiting', 'Reclutamiento', ['^recruiter'], ['recursos_humanos']],
    ['git', 'Git', ['=Git', 'github'], ['backend']],
  ])

  const detect = (header: string, body: string, role: string | null = null) => detectSkills({ header, body }, catalog, role)

  it('finds a skill named in the title or department, however many times', () => {
    expect(detect('Python Developer', '')).toEqual(['python'])
  })

  it('counts a single mention in the body only for a skill of the role', () => {
    expect(detect('Backend Engineer', 'We use Python daily', 'backend')).toEqual(['python'])
    expect(detect('Frontend Engineer', 'We use Python daily', 'frontend')).toEqual([])
  })

  it('needs two mentions when the role is unknown', () => {
    expect(detect('Specialist', 'Python is nice', null)).toEqual([])
    expect(detect('Specialist', 'Python and more Python', null)).toEqual(['python'])
  })

  it('needs three mentions for a skill that is not of the role', () => {
    expect(detect('Backend Engineer', 'recruiter recruiter', 'backend')).toEqual([])
    expect(detect('Backend Engineer', 'nodejs, python, react', 'backend').includes('react')).toBe(false)
  })

  it('does not take a skill out of the middle of another word', () => {
    expect(detect('Developer', 'javascript, javascript', null)).toEqual(['javascript'])
    // "java" no está dentro de "javascript"
    expect(detect('Developer', 'javascript and javascript', null)).not.toContain('java')
  })

  it('tells C, C# and C++ apart', () => {
    expect(detect('C# Developer', '')).toEqual(['csharp'])
    expect(detect('C++ Developer', '')).toEqual(['cpp'])
  })

  it('respects the terms that are case sensitive', () => {
    expect(detect('Engineer', 'We react quickly and react to change', null)).toEqual([])
    expect(detect('React Engineer', '')).toEqual(['react'])
    // "git" en minúscula no cuenta (=Git), pero github sí, y con rol desconocido pide dos menciones.
    expect(detect('Engineer', 'git git git', null)).toEqual([])
    expect(detect('Engineer', 'GitHub and github repos', null)).toEqual(['git'])
  })

  it('counts a header-only term in the title but not in the body', () => {
    expect(detect('Technical Recruiter', '')).toEqual(['recruiting'])
    expect(detect('Backend Engineer', 'your recruiter recruiter recruiter will contact you', 'backend')).toEqual([])
  })

  it('returns the skills in the order of the catalog, without repeats', () => {
    expect(detect('Python Python Node.js Developer', '')).toEqual(['python', 'nodejs'])
  })

  it('finds nothing in empty text', () => {
    expect(detect('', '')).toEqual([])
  })

  it('falls back to the label and the name when a skill has no terms', () => {
    const bare = skills([['node-red', 'Node-RED']])
    expect(termsFor({ name: 'node-red', label: 'Node-RED' })).toEqual(['Node-RED', 'node red'])
    expect(detectSkills({ header: 'Node-RED developer', body: '' }, bare)).toEqual(['node-red'])
  })
})

describe('SKILL_TERMS', () => {
  it('has no empty term and no duplicated skill in its own list', () => {
    for (const [name, terms] of Object.entries(SKILL_TERMS)) {
      expect(terms.length, name).toBeGreaterThan(0)
      expect(terms.every(term => term.replace(/^[=^]+/, '').trim() !== ''), name).toBe(true)
      expect(new Set(terms).size, name).toBe(terms.length)
    }
  })

  it('does not use bare words that are also common in company texts', () => {
    const risky = ['ai', 'react', 'go', 'swift', 'rust', 'excel', 'git', 'recruiter', 'recruiting', 'sap', 'sketch', 'spark']
    for (const terms of Object.values(SKILL_TERMS)) {
      for (const term of terms) expect(risky.includes(term), term).toBe(false)
    }
  })
})

describe('enrichVacancy', () => {
  const catalog = skills([
    ['python', 'Python', ['python'], ['backend']],
    ['postgresql', 'PostgreSQL', ['postgresql', 'postgres'], ['backend']],
  ])

  it('links a vacancy with its role, level, skills and modality at once', () => {
    const text = '## Senior Backend Engineer\n**Departamento:** Platform\n**Ubicación:** Remoto\nYou will build services in Python on PostgreSQL. 100% remote.'

    expect(enrichVacancy({ text, location: 'Remoto', work_modality: 'unknown' }, catalog)).toEqual({
      role_category: 'backend',
      seniority_level: 'senior',
      skills: ['python', 'postgresql'],
      work_modality: 'remote',
    })
  })

  it('works on the escaped HTML the sources deliver', () => {
    const text = '## Backend Engineer\n&lt;p&gt;Experience with &lt;b&gt;Python&lt;/b&gt; required&lt;/p&gt;'
    expect(enrichVacancy({ text }, catalog).skills).toEqual(['python'])
  })

  it('does not invent what the text does not say', () => {
    const result = enrichVacancy({ text: '## Member of Technical Staff\nBuild things with people' }, catalog)

    expect(result).toEqual({ role_category: null, seniority_level: null, skills: [], work_modality: 'unknown' })
  })

  it('classifies the new business roles', () => {
    expect(enrichVacancy({ text: '## Senior Accountant\nClose the books' }, catalog).role_category).toBe('finanzas')
    expect(enrichVacancy({ text: '## Account Executive\nSell to companies' }, catalog).role_category).toBe('ventas')
    expect(enrichVacancy({ text: '## Talent Acquisition Lead\nHire people' }, catalog).role_category).toBe('recursos_humanos')
  })
})
