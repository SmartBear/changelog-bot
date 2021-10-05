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
        const issues = ChangeLog.findIssues(version.body)
        const release = new Release(version.version || version.title, issues)
        return release
      })
      return new ChangeLog(releases)
    } catch (error) {
      console.log(error)
      return new ChangeLog([])
    }
  }

  private static findIssues(body: string) {
    const matches = body.match(new RegExp('(#\\d+)', 'mg'))
    if (!matches) {
      return []
    }
    return matches.map((match) => new Issue(parseInt(match.replace('#', ''))))
  }

  constructor(public releases: Release[]) {}
}
