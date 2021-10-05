import { Issue } from './Issue'
import { Release } from './Release'
import parseChangeLog from 'changelog-parser'

export class ChangeLog {
  static async parse(content: string): Promise<ChangeLog> {
    const releases: Release[] = []

    try {
      const result = await parseChangeLog({
        text: content
      })
      result.versions.forEach((version) => {
        const release = new Release(version.version || version.title, [])

        const rowIssues = ChangeLog.findIssues(version.parsed._)
        release.issues.push(...rowIssues)
        releases.push(release)
      })
    } catch (error) {
      console.log(error)
    }
    return new ChangeLog(releases)
  }

  private static findIssues(lines: string[]) {
    const rowIssues: Issue[] = []
    lines.forEach((row) => {
      const re = new RegExp('(#\\d+)')
      const matches = re.exec(row)
      if (matches) {
        const issueNumber: number = parseInt(matches[0].replace('#', ''))
        rowIssues.push(new Issue(issueNumber))
      }
    })
    return rowIssues
  }

  constructor(public releases: Release[]) {}
}
