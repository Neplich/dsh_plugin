import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'

import { listSkills } from '../src/server/skills.ts'

function skillDocument(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`
}

test('discovers symlinked skill directories and flat files', async () => {
  const project = await mkdtemp(join(tmpdir(), 'config-skills-project-'))
  const external = await mkdtemp(join(tmpdir(), 'config-skills-external-'))
  const root = join(project, '.dsh/skills')

  try {
    await mkdir(join(external, 'linked-directory'), { recursive: true })
    await writeFile(
      join(external, 'linked-directory/SKILL.md'),
      skillDocument('linked-directory', 'Linked directory'),
      'utf8',
    )
    await writeFile(
      join(external, 'linked-flat.md'),
      skillDocument('linked-flat', 'Linked flat file'),
      'utf8',
    )
    await mkdir(root, { recursive: true })
    await symlink(join(external, 'linked-directory'), join(root, 'linked-directory'))
    await symlink(join(external, 'linked-flat.md'), join(root, 'linked-flat.md'))
    await symlink(join(external, 'missing'), join(root, 'broken-link'))

    const { skills } = await listSkills('project', project, 524_288)

    expect(skills.map(skill => skill.name)).toEqual(['linked-directory', 'linked-flat'])
  } finally {
    await rm(project, { recursive: true, force: true })
    await rm(external, { recursive: true, force: true })
  }
})
