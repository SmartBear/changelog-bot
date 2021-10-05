import { Issue } from './Issue'
import { Release } from './Release'
import parseChangeLog from 'changelog-parser'

export class ChangeLog {
  static async parse(content: string): Promise<ChangeLog> {
    try {
      const result = await parseChangeLog({
        text: content
      })
      const releases = result.versions.map((version) => {
        const issues = ChangeLog.findIssues(version.parsed._)
        const release = new Release(version.version || version.title, issues)
        return release
      })
      return new ChangeLog(releases)
    } catch (error) {
      console.log(error)
      return new ChangeLog([])
    }
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
